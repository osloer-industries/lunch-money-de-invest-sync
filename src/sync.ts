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
import { existsSync, readFileSync } from "node:fs";
import { chmod, writeFile } from "node:fs/promises";
import { runCliModuleMain } from "./shared/cli-main.js";
import { forEachProfileSequentially } from "./shared/sequential-profiles.js";
import { detectFirstSyncForAccount } from "./lunch-money/first-sync-for-account.js";
import { createNdjsonEventWriter, type BrokerLoginEventSink } from "./shared/cli-events.js";
import { writeStdoutJson } from "./shared/scriptable-cli.js";
import type { SyncAccountResult, SyncRunJsonResult } from "./sync-result.js";
import {
  readScalableCapitalBalances,
  readTradeRepublicBalances,
  type BrokerBalanceSnapshot,
} from "./shared/broker-balances.js";
import type { ManualAccountBalanceApi } from "./lunch-money/manual-account-balance.js";
import { syncBrokerBalances } from "./sync-balances.js";
import { runDryRunCollection } from "./dry-run-review/collect.js";
import {
  dryRunAggregateUncategorisedShareExceedsThreshold,
  runDryRunTerminalReview,
  type DryRunTerminalReviewDeps,
} from "./dry-run-review/terminal-review.js";
import type { DryRunReviewSummary } from "./dry-run-review/types.js";
import { filterTransactionsSince } from "./dry-run-review/since.js";
import { createInquirerPrompter } from "./setup/inquirer-prompter.js";
import type { CategoryMappingSetupClient, SetupFilesystem, SetupPrompter } from "./setup/types.js";

export interface LunchMoneySyncClient extends TagsApi, TransactionsApi, ManualAccountBalanceApi {
  readonly categories?: CategoryMappingSetupClient["categories"];
}

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
  /** Set when an interactive dry-run review finishes (undefined for normal sync / non-TTY dry-run). */
  readonly dryRunProceed?: boolean;
}

export type SyncLogger = (message: string) => void;

export function defaultSyncLogger(message: string): void {
  console.log(message);
}

export interface RunSyncSelection {
  readonly includeBrokers: ReadonlySet<SyncBroker>;
  readonly owners: readonly string[];
  readonly dryRun: boolean;
  readonly since?: string;
  readonly exportTypeSummary?: string | null;
  readonly json?: boolean;
  readonly nonInteractive?: boolean;
  /** Set the Lunch Money cash balance to the broker value when they differ (opt-in). */
  readonly reconcileCash?: boolean;
}

export interface SyncDryRunReviewDeps {
  readonly prompter: SetupPrompter;
  readonly filesystem: SetupFilesystem;
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

function effectiveSince(config: SyncConfig, selection: RunSyncSelection): string | undefined {
  return selection.since ?? config.syncSince;
}

function shouldUseInteractiveDryRunReview(selection: RunSyncSelection): boolean {
  return (
    selection.dryRun &&
    !selection.json &&
    selection.nonInteractive !== true &&
    (process.stdin.isTTY ?? false) &&
    process.env["VITEST"] === undefined
  );
}

function lunchMoneyAssetIdForOwner(
  config: SyncConfig,
  broker: BrokerSource,
  owner: string,
): number {
  const profiles =
    broker === "trade-republic" ? config.tradeRepublicProfiles : config.scalableCapitalProfiles;
  const profile = profiles.find((row) => row.owner === owner);
  if (!profile) {
    throw new Error(`No ${broker} profile for owner "${owner}"`);
  }
  return profile.lunchMoneyAssetId;
}

async function syncAccountsFromDryRunReview(
  config: SyncConfig,
  client: LunchMoneySyncClient,
  review: DryRunReviewSummary,
): Promise<SyncAccountResult[]> {
  const accounts: SyncAccountResult[] = [];
  for (const profile of review.profiles) {
    const lunchMoneyAssetId = lunchMoneyAssetIdForOwner(config, profile.broker, profile.owner);
    const firstSync = await detectFirstSyncForAccount(client, lunchMoneyAssetId, [
      profile.broker === "trade-republic" ? "trade-republic:" : "scalable-capital:",
    ]);
    accounts.push({
      owner: profile.owner,
      source: profile.broker,
      lunchMoneyAssetId,
      firstSyncForAccount: firstSync.firstSyncForAccount,
      existingBrokerExternalIds: firstSync.existingBrokerExternalIds,
      dryRun: true,
      wouldInsert: profile.wouldInsert,
      wouldSkip: profile.wouldSkip,
      dryRunSummary: profile,
    });
  }
  return accounts;
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

interface SyncOneAccountOutcome {
  readonly pendingCashDelta: number;
  readonly account: SyncAccountResult;
}

async function syncOneAccount(params: SyncOneAccountParams): Promise<SyncOneAccountOutcome> {
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
      pendingCashDelta: pendingCanonicalDelta(preview.lines),
      account: {
        owner,
        source,
        lunchMoneyAssetId,
        firstSyncForAccount: firstSync.firstSyncForAccount,
        existingBrokerExternalIds: firstSync.existingBrokerExternalIds,
        dryRun: true,
        wouldInsert: preview.wouldInsert,
        wouldSkip: preview.wouldSkip,
      },
    };
  }
  const tagIds = await resolveTagIds(client, uniqueTags(transactions));
  const summary = await upsertTransactions(client, transactions, lunchMoneyAssetId, tagIds);
  logger(
    `[${source}:${owner}] inserted ${summary.insertedCount}, skipped ${summary.skippedCount} duplicate(s)`,
  );
  return {
    pendingCashDelta: 0,
    account: {
      owner,
      source,
      lunchMoneyAssetId,
      firstSyncForAccount: firstSync.firstSyncForAccount,
      existingBrokerExternalIds: firstSync.existingBrokerExternalIds,
      dryRun: false,
      insertedCount: summary.insertedCount,
      skippedCount: summary.skippedCount,
    },
  };
}

function pendingCanonicalDelta(lines: ReadonlyArray<{ action: string; amount: number }>): number {
  // Preview amounts use Lunch Money v2 signs (positive = outflow), the inverse of canonical.
  const total = lines.filter((line) => line.action === "insert").reduce((sum, line) => sum - line.amount, 0);
  return Math.round(total * 100) / 100;
}

async function runInteractiveDryRunReview(
  config: SyncConfig,
  client: LunchMoneySyncClient,
  collectors: BrokerCollectors,
  logger: SyncLogger,
  selection: RunSyncSelection,
  dryRunReview?: SyncDryRunReviewDeps,
): Promise<boolean> {
  if (!client.categories) {
    throw new Error("Dry-run review requires a Lunch Money client with categories.getAll");
  }
  const since = effectiveSince(config, selection);
  const summary = await runDryRunCollection(config, client, collectors, {
    includeBrokers: selection.includeBrokers,
    owners: selection.owners,
    ...(since === undefined ? {} : { since }),
  });
  const reviewDeps: DryRunTerminalReviewDeps = {
    prompter: dryRunReview?.prompter ?? createInquirerPrompter(),
    client: { categories: client.categories },
    filesystem: dryRunReview?.filesystem ?? createLiveSetupFilesystem(),
  };
  const result = await runDryRunTerminalReview(
    summary,
    { categoryMap: config.categoryMap, tagMap: config.tagMap },
    reviewDeps,
  );
  if (!result.proceed) {
    logger("Dry-run review cancelled — no changes written to Lunch Money.");
    return false;
  }
  return true;
}

async function runJsonDryRunSync(
  config: SyncConfig,
  client: LunchMoneySyncClient,
  collectors: BrokerCollectors,
  selection: RunSyncSelection,
): Promise<SyncRunJsonResult> {
  if (!client.categories) {
    throw new Error("Dry-run JSON output requires a Lunch Money client with categories.getAll");
  }
  const since = effectiveSince(config, selection);
  const review = await runDryRunCollection(config, client, collectors, {
    includeBrokers: selection.includeBrokers,
    owners: selection.owners,
    ...(since === undefined ? {} : { since }),
  });
  const accounts = await syncAccountsFromDryRunReview(config, client, review);
  return {
    ok: true,
    balanceFailures: 0,
    accounts,
    dryRunReview: {
      aggregateUncategorisedShare: review.aggregateUncategorisedShare,
      uncategorisedShareExceedsThreshold: dryRunAggregateUncategorisedShareExceedsThreshold(review),
    },
  };
}

export async function runSync(
  config: SyncConfig,
  client: LunchMoneySyncClient,
  collectors: BrokerCollectors,
  logger: SyncLogger = defaultSyncLogger,
  selection: RunSyncSelection = createDefaultRunSyncSelection(),
  dryRunReview?: SyncDryRunReviewDeps,
): Promise<SyncRunSummary | SyncRunJsonResult> {
  if (shouldUseInteractiveDryRunReview(selection)) {
    const proceed = await runInteractiveDryRunReview(config, client, collectors, logger, selection, dryRunReview);
    return { balanceFailures: 0, dryRunProceed: proceed };
  }

  if (selection.dryRun && selection.json) {
    return runJsonDryRunSync(config, client, collectors, selection);
  }

  const since = effectiveSince(config, selection);

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
    collectJsonAccounts: selection.json === true,
    ...(since === undefined ? {} : { since }),
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
  const accounts: SyncAccountResult[] = [];
  let balanceFailures = 0;
  await forEachProfileSequentially(brokerSyncJobs, async (job) => {
    balanceFailures += await syncProfilesForBroker(
      job.profiles,
      job.source,
      job.collect,
      job.readBalances,
      syncContext,
      accounts,
    );
  });
  if (balanceFailures > 0) {
    logger(`Transactions synced, but ${balanceFailures} balance step(s) failed — see the warnings above.`);
  }
  if (selection.json) {
    return { ok: true, balanceFailures, accounts };
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
    collectJsonAccounts: boolean;
    since?: string;
  },
  jsonAccounts: SyncAccountResult[],
): Promise<number> {
  let failures = 0;
  await forEachProfileSequentially(profiles, async (profile) => {
    let transactions = await collect(profile);
    if (context.since) {
      transactions = filterTransactionsSince(transactions, context.since);
    }
    const { pendingCashDelta, account } = await syncOneAccount({
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
      if (context.collectJsonAccounts) {
        jsonAccounts.push(account);
      }
      return;
    }
    const snapshot = await readBalances(profile);
    const balanceFailuresForProfile = await syncBrokerBalances({
      label: `[${source}:${profile.owner}]`,
      snapshot,
      cashAccountId: profile.lunchMoneyAssetId,
      holdingsAccountId: profile.holdingsAccountId,
      savingsAccountId: profile.savingsAccountId,
      pendingCashDelta,
      client: context.client,
      logger: context.logger,
      dryRun: context.dryRun,
      reconcileCash: context.reconcileCash,
    });
    failures += balanceFailuresForProfile;
    if (context.collectJsonAccounts) {
      jsonAccounts.push({
        ...account,
        brokerBalances: snapshot,
        balanceFailures: balanceFailuresForProfile,
      });
    }
  });
  return failures;
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
    readTradeRepublicBalances,
    readScalableCapitalBalances,
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
    ...(cli.since ? { since: cli.since } : {}),
    exportTypeSummary: cli.exportTypeSummary,
    json: cli.json,
    nonInteractive: cli.nonInteractive,
    reconcileCash: cli.reconcileCash,
  };
}

export function createLiveSetupFilesystem(): SetupFilesystem {
  return {
    exists: existsSync,
    readText(path) {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return null;
      }
    },
    writeText: (path, content) => writeFile(path, content, "utf8"),
    chmod,
  };
}

function summarizeRunSyncCliResult(result: SyncRunSummary | SyncRunJsonResult): SyncRunSummary {
  const dryRunProceed = "dryRunProceed" in result ? result.dryRunProceed : undefined;
  return dryRunProceed === undefined
    ? { balanceFailures: result.balanceFailures }
    : { balanceFailures: result.balanceFailures, dryRunProceed };
}

async function maybeWriteTypeSummaryExport(
  exportPath: string | null,
  config: SyncConfig,
  logger: SyncLogger,
): Promise<void> {
  if (!exportPath) {
    return;
  }
  const observations = await collectTypeObservations(config);
  const groups = groupTypeObservations(observations);
  const target = await writeAnonymisedTypeSummaryToPath(exportPath, groups, {
    write: (absolutePath, body) => writeFile(absolutePath, body, "utf8"),
  });
  logger(`Wrote anonymised type summary to ${target}`);
}

export async function runSyncCli(
  argv: readonly string[],
  deps: {
    readConfig?: typeof readConfigFromDisk;
    createClient?: typeof createLunchMoneyClient;
    collectors?: BrokerCollectors;
    logger?: SyncLogger;
    apiKeyStore?: LunchMoneyApiKeyStore;
    prompter?: SetupPrompter;
    filesystem?: SetupFilesystem;
  } = {},
): Promise<SyncRunSummary> {
  const cli = parseSyncCliOptions(argv);
  if (cli.help) {
    (deps.logger ?? defaultSyncLogger)(SYNC_HELP_TEXT);
    return { balanceFailures: 0 };
  }
  const humanLogger = deps.logger ?? defaultSyncLogger;
  const logger = cli.json ? () => undefined : humanLogger;
  await ensureLunchMoneyApiKeyForCli(deps.apiKeyStore ?? createDefaultLunchMoneyApiKeyStore());
  const config = (deps.readConfig ?? readConfigFromDiskForCli)();
  const client = (deps.createClient ?? createLunchMoneyClient)(config.lunchMoneyApiKey);
  const loginEvents = cli.events ? createNdjsonEventWriter() : undefined;
  await maybeWriteTypeSummaryExport(cli.exportTypeSummary, config, logger);
  const result = await runSync(
    config,
    client,
    deps.collectors ?? createLiveCollectors(loginEvents),
    logger,
    selectionFromCliOptions(cli),
    deps.prompter && deps.filesystem ? { prompter: deps.prompter, filesystem: deps.filesystem } : undefined,
  );
  if (cli.json && "accounts" in result) {
    writeStdoutJson(result);
  }
  return summarizeRunSyncCliResult(result);
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