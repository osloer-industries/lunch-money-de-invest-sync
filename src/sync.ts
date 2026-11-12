import type { ScalableCapitalProfile, SyncConfig, TradeRepublicProfile } from "./shared/config.js";
import { readConfigFromDisk } from "./shared/config.js";
import { tagSharedExpenses } from "./shared/tagging.js";
import type { BrokerSource, CanonicalTransaction } from "./shared/transaction.js";
import { createLunchMoneyClient, resolveTagIds, type TagsApi } from "./lunch-money/client.js";
import { previewUpsert } from "./lunch-money/preview.js";
import { upsertTransactions, type TransactionsApi } from "./lunch-money/upsert.js";
import { createDefaultPytrCliRunner, fetchTradeRepublicTimeline } from "./trade-republic/client.js";
import { mapTradeRepublicEvents } from "./trade-republic/mapper.js";
import {
  createDefaultScCliRunner,
  fetchAllScalableCapitalTransactions,
} from "./scalable-capital/client.js";
import { mapScalableCapitalTransactions } from "./scalable-capital/mapper.js";
import {
  filterSyncConfig,
  parseSyncCliOptions,
  SYNC_HELP_TEXT,
  type SyncBroker,
} from "./sync-options.js";

export interface LunchMoneySyncClient extends TagsApi, TransactionsApi {}

export interface BrokerCollectors {
  collectTradeRepublic: (profile: TradeRepublicProfile) => Promise<CanonicalTransaction[]>;
  collectScalableCapital: (profile: ScalableCapitalProfile) => Promise<CanonicalTransaction[]>;
}

export type SyncLogger = (message: string) => void;

export interface RunSyncSelection {
  readonly includeBrokers: ReadonlySet<SyncBroker>;
  readonly owners: readonly string[];
  readonly dryRun: boolean;
}

function uniqueTags(transactions: readonly CanonicalTransaction[]): string[] {
  return [...new Set(transactions.flatMap((tx) => tx.tags ?? []))];
}

async function syncOneAccount(
  owner: string,
  source: BrokerSource,
  rawTransactions: CanonicalTransaction[],
  lunchMoneyAssetId: number,
  sharedCardLast4: readonly string[],
  client: LunchMoneySyncClient,
  logger: SyncLogger,
  dryRun: boolean,
): Promise<void> {
  const transactions = tagSharedExpenses(rawTransactions, sharedCardLast4);
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
  logger: SyncLogger = console.log,
  selection: RunSyncSelection = {
    includeBrokers: new Set<SyncBroker>(["trade-republic", "scalable-capital"]),
    owners: [],
    dryRun: false,
  },
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

  for (const profile of tradeProfiles) {
    const transactions = await collectors.collectTradeRepublic(profile);
    await syncOneAccount(
      profile.owner,
      "trade-republic",
      transactions,
      profile.lunchMoneyAssetId,
      config.sharedCardLast4,
      client,
      logger,
      selection.dryRun,
    );
  }

  for (const profile of scalableProfiles) {
    const transactions = await collectors.collectScalableCapital(profile);
    await syncOneAccount(
      profile.owner,
      "scalable-capital",
      transactions,
      profile.lunchMoneyAssetId,
      config.sharedCardLast4,
      client,
      logger,
      selection.dryRun,
    );
  }
}

export function createLiveCollectors(): BrokerCollectors {
  return liveCollectors;
}

const liveCollectors: BrokerCollectors = {
  async collectTradeRepublic(profile) {
    const pytrConfig = {
      ...(profile.pytrCommand ? { pytrCommand: profile.pytrCommand } : {}),
      ...(profile.pytrHome ? { pytrHome: profile.pytrHome } : {}),
      ...(profile.loginV2 !== undefined ? { loginV2: profile.loginV2 } : {}),
      ...(profile.wafTokenMode ? { wafTokenMode: profile.wafTokenMode } : {}),
      ...(profile.account ? { account: profile.account } : {}),
      ...(profile.pytrMinVersion ? { pytrMinVersion: profile.pytrMinVersion } : {}),
    };
    const runner = createDefaultPytrCliRunner(pytrConfig);
    const events = await fetchTradeRepublicTimeline(runner, pytrConfig);
    return mapTradeRepublicEvents(events);
  },
  async collectScalableCapital(profile) {
    const cliConfig = {
      ...(profile.scBinaryPath ? { scBinaryPath: profile.scBinaryPath } : {}),
      ...(profile.scConfigDir ? { scConfigDir: profile.scConfigDir } : {}),
      ...(profile.portfolioId ? { portfolioId: profile.portfolioId } : {}),
    };
    const runner = createDefaultScCliRunner(cliConfig);
    const transactions = await fetchAllScalableCapitalTransactions(runner, cliConfig);
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
  return { includeBrokers, owners: cli.owners, dryRun: cli.dryRun };
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
    (deps.logger ?? console.log)(SYNC_HELP_TEXT);
    return;
  }
  const config = (deps.readConfig ?? readConfigFromDisk)();
  const client = (deps.createClient ?? createLunchMoneyClient)(config.lunchMoneyApiKey);
  await runSync(
    config,
    client,
    deps.collectors ?? liveCollectors,
    deps.logger ?? console.log,
    selectionFromCliOptions(cli),
  );
}

async function main(): Promise<void> {
  await runSyncCli(process.argv.slice(2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
