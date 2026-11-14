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
import {
  readScalableCapitalBalances,
  readTradeRepublicBalances,
  type BrokerBalanceSnapshot,
} from "./shared/broker-balances.js";
import type { ManualAccountBalanceApi } from "./lunch-money/manual-account-balance.js";
import { syncBrokerBalances } from "./sync-balances.js";

export interface LunchMoneySyncClient extends TagsApi, TransactionsApi, ManualAccountBalanceApi {}

export interface BrokerCollectors {
  collectTradeRepublic: (profile: TradeRepublicProfile) => Promise<CanonicalTransaction[]>;
  collectScalableCapital: (profile: ScalableCapitalProfile) => Promise<CanonicalTransaction[]>;
  /** Reads market value / cash after the transaction sync; omitted → no balance steps. */
  readTradeRepublicBalances?: (profile: TradeRepublicProfile) => Promise<BrokerBalanceSnapshot>;
  readScalableCapitalBalances?: (profile: ScalableCapitalProfile) => Promise<BrokerBalanceSnapshot>;
}

export interface SyncRunSummary {
  /** Balance steps (market value, savings, cash reconciliation) that failed and were skipped. */
  readonly balanceFailures: number;
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
  /** Set the Lunch Money cash balance to the broker value when they differ (opt-in). */
  readonly reconcileCash?: boolean;
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

/** Returns the canonical sum of rows a dry-run would still insert (0 after a real sync). */
async function syncOneAccount(params: SyncOneAccountParams): Promise<number> {
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
    return pendingCanonicalDelta(preview.lines);
  }
  const tagIds = await resolveTagIds(client, uniqueTags(transactions));
  const summary = await upsertTransactions(client, transactions, lunchMoneyAssetId, tagIds);
  logger(
    `[${source}:${owner}] inserted ${summary.insertedCount}, skipped ${summary.skippedCount} duplicate(s)`,
  );
  return 0;
}

function pendingCanonicalDelta(lines: ReadonlyArray<{ action: string; amount: number }>): number {
  // Preview amounts use Lunch Money v2 signs (positive = outflow), the inverse of canonical.
  const total = lines.filter((line) => line.action === "insert").reduce((sum, line) => sum - line.amount, 0);
  return Math.round(total * 100) / 100;
}

export async function runSync(
  config: SyncConfig,
  client: LunchMoneySyncClient,
  collectors: BrokerCollectors,
  logger: SyncLogger = defaultSyncLogger,
  selection: RunSyncSelection = createDefaultRunSyncSelection(),
): Promise<SyncRunSummary> {
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
    reconcileCash: selection.reconcileCash === true,
  };

  const brokerSyncJobs = [
    {
      profiles: tradeProfiles,
      source: "trade-republic" as const,
      collect: collectors.collectTradeRepublic,
      readBalances: collectors.readTradeRepublicBalances,
    },
    {
      profiles: scalableProfiles,
      source: "scalable-capital" as const,
      collect: collectors.collectScalableCapital,
      readBalances: collectors.readScalableCapitalBalances,
    },
  ] as const;
  let balanceFailures = 0;
  await forEachProfileSequentially(brokerSyncJobs, async (job) => {
    balanceFailures += await syncProfilesForBroker(job.profiles, job.source, job.collect, job.readBalances, syncContext);
  });
  if (balanceFailures > 0) {
    logger(`Transactions synced, but ${balanceFailures} balance step(s) failed — see the warnings above.`);
  }
  return { balanceFailures };
}

interface BalanceTrackedProfile {
  readonly owner: string;
  readonly lunchMoneyAssetId: number;
  readonly holdingsAccountId?: number | undefined;
  readonly savingsAccountId?: number | undefined;
}

async function syncProfilesForBroker<T extends BalanceTrackedProfile>(
  profiles: readonly T[],
  source: BrokerSource,
  collect: (profile: T) => Promise<CanonicalTransaction[]>,
  readBalances: ((profile: T) => Promise<BrokerBalanceSnapshot>) | undefined,
  context: {
    sharedCardLast4: readonly string[];
    categoryMap: SyncConfig["categoryMap"];
    tagMap: SyncConfig["tagMap"];
    client: LunchMoneySyncClient;
    logger: SyncLogger;
    dryRun: boolean;
    reconcileCash: boolean;
  },
): Promise<number> {
  let failures = 0;
  await forEachProfileSequentially(profiles, async (profile) => {
    const transactions = await collect(profile);
    const pendingCashDelta = await syncOneAccount({
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
    if (!readBalances) {
      return;
    }
    failures += await syncBrokerBalances({
      label: `[${source}:${profile.owner}]`,
      snapshot: await readBalances(profile),
      cashAccountId: profile.lunchMoneyAssetId,
      holdingsAccountId: profile.holdingsAccountId,
      savingsAccountId: profile.savingsAccountId,
      pendingCashDelta,
      client: context.client,
      logger: context.logger,
      dryRun: context.dryRun,
      reconcileCash: context.reconcileCash,
    });
  });
  return failures;
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
  readTradeRepublicBalances,
  readScalableCapitalBalances,
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
    reconcileCash: cli.reconcileCash,
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
): Promise<SyncRunSummary> {
  const cli = parseSyncCliOptions(argv);
  if (cli.help) {
    (deps.logger ?? defaultSyncLogger)(SYNC_HELP_TEXT);
    return { balanceFailures: 0 };
  }
  await ensureLunchMoneyApiKeyForCli(deps.apiKeyStore ?? createDefaultLunchMoneyApiKeyStore());
  const config = (deps.readConfig ?? readConfigFromDiskForCli)();
  const client = (deps.createClient ?? createLunchMoneyClient)(config.lunchMoneyApiKey);
  if (cli.exportTypeSummary) {
    const observations = await collectTypeObservations(config);
    const groups = groupTypeObservations(observations);
    const target = await writeAnonymisedTypeSummaryToPath(cli.exportTypeSummary, groups, {
      write: (absolutePath, body) => writeFile(absolutePath, body, "utf8"),
    });
    (deps.logger ?? defaultSyncLogger)(`Wrote anonymised type summary to ${target}`);
  }
  return runSync(
    config,
    client,
    deps.collectors ?? liveCollectors,
    deps.logger ?? defaultSyncLogger,
    selectionFromCliOptions(cli),
  );
}

runCliModuleMain(async () => {
  try {
    const summary = await runSyncCli(process.argv.slice(2));
    if (summary.balanceFailures > 0) {
      // Transactions are already synced; a non-zero exit keeps failed balance steps visible to schedulers.
      process.exitCode = 1;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}, import.meta.url);
