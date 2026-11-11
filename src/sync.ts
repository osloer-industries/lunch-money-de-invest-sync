import type { ScalableCapitalProfile, SyncConfig, TradeRepublicProfile } from "./shared/config.js";
import { readConfigFromDisk } from "./shared/config.js";
import { tagSharedExpenses } from "./shared/tagging.js";
import type { BrokerSource, CanonicalTransaction } from "./shared/transaction.js";
import { createLunchMoneyClient, resolveTagIds, type TagsApi } from "./lunch-money/client.js";
import { upsertTransactions, type TransactionsApi } from "./lunch-money/upsert.js";
import { createTradeRepublicTransport, fetchTradeRepublicTimeline } from "./trade-republic/client.js";
import { mapTradeRepublicEvents } from "./trade-republic/mapper.js";
import { fetchAllScalableCapitalTransactions } from "./scalable-capital/client.js";
import { mapScalableCapitalTransactions } from "./scalable-capital/mapper.js";
import {
  formatDryRunAccountLine,
  summarizeAccountSyncPlan,
  type AccountSyncPlan,
} from "./sync/plan.js";

export interface LunchMoneySyncClient extends TagsApi, TransactionsApi {}

export interface BrokerCollectors {
  collectTradeRepublic: (profile: TradeRepublicProfile) => Promise<CanonicalTransaction[]>;
  collectScalableCapital: (profile: ScalableCapitalProfile) => Promise<CanonicalTransaction[]>;
}

export type SyncLogger = (message: string) => void;

export interface SyncRunOptions {
  /** When true, fetch and map broker data but do not call the Lunch Money API. */
  dryRun?: boolean;
}

function uniqueTags(transactions: readonly CanonicalTransaction[]): string[] {
  return [...new Set(transactions.flatMap((tx) => tx.tags ?? []))];
}

interface SyncOneAccountParams {
  owner: string;
  source: BrokerSource;
  rawTransactions: CanonicalTransaction[];
  lunchMoneyAssetId: number;
  sharedCardLast4: readonly string[];
  client: LunchMoneySyncClient;
  logger: SyncLogger;
  options: SyncRunOptions;
}

async function syncOneAccount(params: SyncOneAccountParams): Promise<AccountSyncPlan> {
  const transactions = tagSharedExpenses(params.rawTransactions, params.sharedCardLast4);
  const plan: AccountSyncPlan = {
    brokerSource: params.source,
    owner: params.owner,
    lunchMoneyAssetId: params.lunchMoneyAssetId,
    transactions,
  };

  if (params.options.dryRun) {
    params.logger(formatDryRunAccountLine(plan, summarizeAccountSyncPlan(transactions)));
    return plan;
  }

  const tagIds = await resolveTagIds(params.client, uniqueTags(transactions));
  const summary = await upsertTransactions(
    params.client,
    transactions,
    params.lunchMoneyAssetId,
    tagIds,
  );
  params.logger(
    `[${params.source}:${params.owner}] inserted ${summary.insertedCount}, skipped ${summary.skippedCount} duplicate(s)`,
  );
  return plan;
}

export async function runSync(
  config: SyncConfig,
  client: LunchMoneySyncClient,
  collectors: BrokerCollectors,
  logger: SyncLogger = console.log,
  options: SyncRunOptions = {},
): Promise<AccountSyncPlan[]> {
  const plans: AccountSyncPlan[] = [];

  for (const profile of config.tradeRepublicProfiles) {
    const transactions = await collectors.collectTradeRepublic(profile);
    plans.push(
      await syncOneAccount({
        owner: profile.owner,
        source: "trade-republic",
        rawTransactions: transactions,
        lunchMoneyAssetId: profile.lunchMoneyAssetId,
        sharedCardLast4: config.sharedCardLast4,
        client,
        logger,
        options,
      }),
    );
  }

  for (const profile of config.scalableCapitalProfiles) {
    const transactions = await collectors.collectScalableCapital(profile);
    plans.push(
      await syncOneAccount({
        owner: profile.owner,
        source: "scalable-capital",
        rawTransactions: transactions,
        lunchMoneyAssetId: profile.lunchMoneyAssetId,
        sharedCardLast4: config.sharedCardLast4,
        client,
        logger,
        options,
      }),
    );
  }

  if (options.dryRun && plans.length > 0) {
    const total = plans.reduce((sum, plan) => sum + plan.transactions.length, 0);
    logger(
      `[dry-run] complete: ${plans.length} profile(s), ${total} transaction(s) would be sent to Lunch Money (no API writes)`,
    );
  }

  return plans;
}

const liveCollectors: BrokerCollectors = {
  async collectTradeRepublic(profile) {
    const transport = createTradeRepublicTransport();
    const events = await fetchTradeRepublicTimeline(transport, {
      phoneNumber: profile.phoneNumber,
      pin: profile.pin,
    });
    return mapTradeRepublicEvents(events);
  },
  async collectScalableCapital(profile) {
    const transactions = await fetchAllScalableCapitalTransactions(fetch, {
      proxyUrl: profile.proxyUrl,
      ...(profile.proxyToken ? { proxyToken: profile.proxyToken } : {}),
    });
    return mapScalableCapitalTransactions(transactions);
  },
};

export interface CliOptions {
  dryRun: boolean;
}

/** Lunch Money client used when `--dry-run` is set (never invoked; satisfies typing). */
export function createDryRunNoOpClient(): LunchMoneySyncClient {
  return {
    tags: {
      getAll: async () => [],
      create: async () => ({ id: 0, name: "" }),
    },
    transactions: {
      create: async () => ({ transactions: [], skipped_duplicates: [] }),
    },
  };
}

/** Parse supported CLI flags for `tsx src/sync.ts`. */
export function parseSyncCliArgs(argv: readonly string[]): CliOptions {
  const dryRun = argv.includes("--dry-run");
  const unsupported = argv.filter((arg) => arg.startsWith("-") && arg !== "--dry-run");
  if (unsupported.length > 0) {
    throw new Error(`Unknown option(s): ${unsupported.join(", ")}. Supported: --dry-run`);
  }
  return { dryRun };
}

async function main(): Promise<void> {
  const cli = parseSyncCliArgs(process.argv.slice(2));
  const config = readConfigFromDisk(undefined, {
    lunchMoneyApiKeyOptional: cli.dryRun,
  });
  const client = cli.dryRun
    ? createDryRunNoOpClient()
    : createLunchMoneyClient(config.lunchMoneyApiKey);
  await runSync(config, client, liveCollectors, console.log, { dryRun: cli.dryRun });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
