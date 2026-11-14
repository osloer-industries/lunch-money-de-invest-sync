import type { ScalableCapitalProfile, SyncConfig, TradeRepublicProfile } from "./shared/config.js";
import { readConfigFromDisk, readConfigFromDiskForCli } from "./shared/config.js";
import { ensureLunchMoneyApiKeyForCli } from "./shared/bootstrap-lunch-money-api-key.js";
import type { LunchMoneyApiKeyStore } from "./shared/lunch-money-api-key-store.js";
import { createDefaultLunchMoneyApiKeyStore } from "./shared/lunch-money-api-key-store.js";
import { tagSharedExpenses } from "./shared/tagging.js";
import type { BrokerSource, CanonicalTransaction } from "./shared/transaction.js";
import { createLunchMoneyClient, resolveTagIds, type TagsApi } from "./lunch-money/client.js";
import { previewUpsert } from "./lunch-money/preview.js";
import { upsertTransactions, type TransactionsApi } from "./lunch-money/upsert.js";
import { mapTradeRepublicEvents } from "./trade-republic/mapper.js";
import {
  fetchScalableCashTransactionsForProfile,
  fetchTradeRepublicEventsForProfile,
} from "./shared/broker-profile-transport.js";
import { mapScalableCapitalTransactions } from "./scalable-capital/mapper.js";
import { applyCategoryTagMappings } from "./shared/apply-mappings.js";
import { groupTypeObservations } from "./shared/canonical-type.js";
import { collectTypeObservations } from "./shared/collect-type-observations.js";
import { writeAnonymisedTypeSummaryToPath } from "./shared/export-type-summary.js";
import {
  filterSyncConfig,
  parseSyncCliOptions,
  SYNC_HELP_TEXT,
  type SyncBroker,
} from "./sync-options.js";
import { writeFile } from "node:fs/promises";
import { runCliModuleMain } from "./shared/cli-main.js";
import { forEachProfileSequentially } from "./shared/sequential-profiles.js";
import { detectFirstSyncForAccount } from "./lunch-money/first-sync-for-account.js";
import { createNdjsonEventWriter, type BrokerLoginEventSink } from "./shared/cli-events.js";
import { writeStdoutJson } from "./shared/scriptable-cli.js";
import type { SyncAccountResult, SyncRunResult } from "./sync-result.js";

export interface LunchMoneySyncClient extends TagsApi, TransactionsApi {}

export interface BrokerCollectors {
  collectTradeRepublic: (profile: TradeRepublicProfile) => Promise<CanonicalTransaction[]>;
  collectScalableCapital: (profile: ScalableCapitalProfile) => Promise<CanonicalTransaction[]>;
}

export type SyncLogger = (message: string) => void;

export function defaultSyncLogger(message: string): void {
  console.log(message);
}

export interface RunSyncSelection {
  readonly includeBrokers: ReadonlySet<SyncBroker>;
  readonly owners: readonly string[];
  readonly dryRun: boolean;
  readonly exportTypeSummary?: string | null;
  readonly json?: boolean;
}

function createDefaultRunSyncSelection(): RunSyncSelection {
  return {
    includeBrokers: new Set<SyncBroker>(["trade-republic", "scalable-capital"]),
    owners: [],
    dryRun: false,
  };
}

function uniqueTags(transactions: readonly CanonicalTransaction[]): string[] {
  return [...new Set(transactions.flatMap((tx) => tx.tags ?? []))];
}

interface SyncOneAccountParams {
  readonly owner: string;
  readonly source: BrokerSource;
  readonly rawTransactions: readonly CanonicalTransaction[];
  readonly lunchMoneyAssetId: number;
  readonly sharedCardLast4: readonly string[];
  readonly categoryMap: SyncConfig["categoryMap"];
  readonly tagMap: SyncConfig["tagMap"];
  readonly client: LunchMoneySyncClient;
  readonly logger: SyncLogger;
  readonly dryRun: boolean;
}

const BROKER_EXTERNAL_ID_PREFIX: Record<BrokerSource, string> = {
  "trade-republic": "trade-republic:",
  "scalable-capital": "scalable-capital:",
};

async function syncOneAccount(params: SyncOneAccountParams): Promise<SyncAccountResult> {
  const {
    owner,
    source,
    rawTransactions,
    lunchMoneyAssetId,
    sharedCardLast4,
    categoryMap,
    tagMap,
    client,
    logger,
    dryRun,
  } = params;
  const transactions = tagSharedExpenses(
    applyCategoryTagMappings(rawTransactions, categoryMap, tagMap),
    sharedCardLast4,
  );
  const firstSync = await detectFirstSyncForAccount(client, lunchMoneyAssetId, [BROKER_EXTERNAL_ID_PREFIX[source]]);
  if (dryRun) {
    const preview = await previewUpsert(client, transactions, lunchMoneyAssetId);
    logger(
      `[${source}:${owner}] dry-run: would insert ${preview.wouldInsert}, would skip ${preview.wouldSkip} duplicate(s)`,
    );
    for (const line of preview.lines) {
      logger(
        `  ${line.action === "insert" ? "+" : "="} ${line.date} ${line.amount} ${line.payee} (${line.externalId})`,
      );
    }
    if (firstSync.firstSyncForAccount) {
      logger(
        `[${source}:${owner}] note: first sync for this Lunch Money account — classification is locked in after the first successful sync`,
      );
    }
    return {
      owner,
      source,
      lunchMoneyAssetId,
      firstSyncForAccount: firstSync.firstSyncForAccount,
      existingBrokerExternalIds: firstSync.existingBrokerExternalIds,
      dryRun: true,
      wouldInsert: preview.wouldInsert,
      wouldSkip: preview.wouldSkip,
      dryRunSummary: null,
    };
  }
  const tagIds = await resolveTagIds(client, uniqueTags(transactions));
  const summary = await upsertTransactions(client, transactions, lunchMoneyAssetId, tagIds);
  logger(
    `[${source}:${owner}] inserted ${summary.insertedCount}, skipped ${summary.skippedCount} duplicate(s)`,
  );
  return {
    owner,
    source,
    lunchMoneyAssetId,
    firstSyncForAccount: firstSync.firstSyncForAccount,
    existingBrokerExternalIds: firstSync.existingBrokerExternalIds,
    dryRun: false,
    insertedCount: summary.insertedCount,
    skippedCount: summary.skippedCount,
  };
}

export async function runSync(
  config: SyncConfig,
  client: LunchMoneySyncClient,
  collectors: BrokerCollectors,
  logger: SyncLogger = defaultSyncLogger,
  selection: RunSyncSelection = createDefaultRunSyncSelection(),
): Promise<SyncRunResult | undefined> {
  const tradeProfiles =
    selection.includeBrokers.has("trade-republic")
      ? filterSyncConfig(config.tradeRepublicProfiles, selection.owners)
      : [];
  const scalableProfiles =
    selection.includeBrokers.has("scalable-capital")
      ? filterSyncConfig(config.scalableCapitalProfiles, selection.owners)
      : [];

  if (
    selection.owners.length > 0 &&
    tradeProfiles.length === 0 &&
    scalableProfiles.length === 0
  ) {
    throw new Error(`No profiles matched --account filter: ${selection.owners.join(", ")}`);
  }

  const syncContext = {
    sharedCardLast4: config.sharedCardLast4,
    categoryMap: config.categoryMap,
    tagMap: config.tagMap,
    client,
    logger,
    dryRun: selection.dryRun,
  };

  const brokerSyncJobs = [
    {
      profiles: tradeProfiles,
      source: "trade-republic" as const,
      collect: collectors.collectTradeRepublic,
    },
    {
      profiles: scalableProfiles,
      source: "scalable-capital" as const,
      collect: collectors.collectScalableCapital,
    },
  ] as const;
  const accounts: SyncAccountResult[] = [];
  await forEachProfileSequentially(brokerSyncJobs, async (job) => {
    const chunk = await syncProfilesForBroker(job.profiles, job.source, job.collect, syncContext);
    accounts.push(...chunk);
  });
  if (selection.json) {
    return { ok: true, accounts };
  }
  return undefined;
}

async function syncProfilesForBroker<T extends { owner: string; lunchMoneyAssetId: number }>(
  profiles: readonly T[],
  source: BrokerSource,
  collect: (profile: T) => Promise<CanonicalTransaction[]>,
  context: {
    sharedCardLast4: readonly string[];
    categoryMap: SyncConfig["categoryMap"];
    tagMap: SyncConfig["tagMap"];
    client: LunchMoneySyncClient;
    logger: SyncLogger;
    dryRun: boolean;
  },
): Promise<SyncAccountResult[]> {
  const results: SyncAccountResult[] = [];
  await forEachProfileSequentially(profiles, async (profile) => {
    const transactions = await collect(profile);
    const accountResult = await syncOneAccount({
      owner: profile.owner,
      source,
      rawTransactions: transactions,
      lunchMoneyAssetId: profile.lunchMoneyAssetId,
      sharedCardLast4: context.sharedCardLast4,
      categoryMap: context.categoryMap,
      tagMap: context.tagMap,
      client: context.client,
      logger: context.logger,
      dryRun: context.dryRun,
    });
    results.push(accountResult);
  });
  return results;
}

export function createLiveCollectors(loginEvents?: BrokerLoginEventSink): BrokerCollectors {
  const brokerContext = loginEvents ? { loginEvents } : {};
  return {
    async collectTradeRepublic(profile) {
      const events = await fetchTradeRepublicEventsForProfile(profile, brokerContext);
      return mapTradeRepublicEvents(events);
    },
    async collectScalableCapital(profile) {
      const transactions = await fetchScalableCashTransactionsForProfile(profile, brokerContext);
      return mapScalableCapitalTransactions(transactions);
    },
  };
}

function selectionFromCliOptions(
  cli: ReturnType<typeof parseSyncCliOptions>,
): RunSyncSelection {
  const includeBrokers =
    cli.brokers.length === 0
      ? new Set<SyncBroker>(["trade-republic", "scalable-capital"])
      : new Set(cli.brokers);
  return {
    includeBrokers,
    owners: cli.owners,
    dryRun: cli.dryRun,
    exportTypeSummary: cli.exportTypeSummary,
    json: cli.json,
  };
}

export async function runSyncCli(
  argv: readonly string[],
  deps: {
    readConfig?: typeof readConfigFromDisk;
    createClient?: typeof createLunchMoneyClient;
    collectors?: BrokerCollectors;
    logger?: SyncLogger;
    apiKeyStore?: LunchMoneyApiKeyStore;
  } = {},
): Promise<void> {
  const cli = parseSyncCliOptions(argv);
  if (cli.help) {
    (deps.logger ?? defaultSyncLogger)(SYNC_HELP_TEXT);
    return;
  }
  const humanLogger = deps.logger ?? defaultSyncLogger;
  const logger = cli.json ? () => undefined : humanLogger;
  await ensureLunchMoneyApiKeyForCli(deps.apiKeyStore ?? createDefaultLunchMoneyApiKeyStore());
  const config = (deps.readConfig ?? readConfigFromDiskForCli)();
  const client = (deps.createClient ?? createLunchMoneyClient)(config.lunchMoneyApiKey);
  const loginEvents = cli.events ? createNdjsonEventWriter() : undefined;
  if (cli.exportTypeSummary) {
    const observations = await collectTypeObservations(config);
    const groups = groupTypeObservations(observations);
    const target = await writeAnonymisedTypeSummaryToPath(cli.exportTypeSummary, groups, {
      write: (absolutePath, body) => writeFile(absolutePath, body, "utf8"),
    });
    logger(`Wrote anonymised type summary to ${target}`);
  }
  const result = await runSync(
    config,
    client,
    deps.collectors ?? createLiveCollectors(loginEvents),
    logger,
    selectionFromCliOptions(cli),
  );
  if (cli.json && result) {
    writeStdoutJson(result);
  }
}

runCliModuleMain(async () => {
  try {
    await runSyncCli(process.argv.slice(2));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}, import.meta.url);
