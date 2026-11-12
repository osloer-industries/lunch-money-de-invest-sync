import type { ScalableCapitalProfile, SyncConfig, TradeRepublicProfile } from "./shared/config.js";
import { readConfigFromDisk } from "./shared/config.js";
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
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { runCliModuleMain } from "./shared/cli-main.js";
import { forEachProfileSequentially } from "./shared/sequential-profiles.js";

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

async function syncOneAccount(params: SyncOneAccountParams): Promise<void> {
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
    return;
  }
  const tagIds = await resolveTagIds(client, uniqueTags(transactions));
  const summary = await upsertTransactions(client, transactions, lunchMoneyAssetId, tagIds);
  logger(
    `[${source}:${owner}] inserted ${summary.insertedCount}, skipped ${summary.skippedCount} duplicate(s)`,
  );
}

export async function runSync(
  config: SyncConfig,
  client: LunchMoneySyncClient,
  collectors: BrokerCollectors,
  logger: SyncLogger = defaultSyncLogger,
  selection: RunSyncSelection = createDefaultRunSyncSelection(),
): Promise<void> {
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
  await forEachProfileSequentially(brokerSyncJobs, async (job) => {
    await syncProfilesForBroker(job.profiles, job.source, job.collect, syncContext);
  });
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
): Promise<void> {
  await forEachProfileSequentially(profiles, async (profile) => {
    const transactions = await collect(profile);
    await syncOneAccount({
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
  });
}

export function createLiveCollectors(): BrokerCollectors {
  return liveCollectors;
}

const liveCollectors: BrokerCollectors = {
  async collectTradeRepublic(profile) {
    const events = await fetchTradeRepublicEventsForProfile(profile);
    return mapTradeRepublicEvents(events);
  },
  async collectScalableCapital(profile) {
    const transactions = await fetchScalableCashTransactionsForProfile(profile);
    return mapScalableCapitalTransactions(transactions);
  },
};

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
  };
}

export async function runSyncCli(
  argv: readonly string[],
  deps: {
    readConfig?: typeof readConfigFromDisk;
    createClient?: typeof createLunchMoneyClient;
    collectors?: BrokerCollectors;
    logger?: SyncLogger;
  } = {},
): Promise<void> {
  const cli = parseSyncCliOptions(argv);
  if (cli.help) {
    (deps.logger ?? defaultSyncLogger)(SYNC_HELP_TEXT);
    return;
  }
  const config = (deps.readConfig ?? readConfigFromDisk)();
  const client = (deps.createClient ?? createLunchMoneyClient)(config.lunchMoneyApiKey);
  if (cli.exportTypeSummary) {
    const observations = await collectTypeObservations(config);
    const groups = groupTypeObservations(observations);
    const target = await writeAnonymisedTypeSummaryToPath(cli.exportTypeSummary, groups, {
      write: (absolutePath, body) => writeFile(absolutePath, body, "utf8"),
    });
    (deps.logger ?? defaultSyncLogger)(`Wrote anonymised type summary to ${target}`);
  }
  await runSync(
    config,
    client,
    deps.collectors ?? liveCollectors,
    deps.logger ?? defaultSyncLogger,
    selectionFromCliOptions(cli),
  );
}

runCliModuleMain(async () => {
  await runSyncCli(process.argv.slice(2));
});
