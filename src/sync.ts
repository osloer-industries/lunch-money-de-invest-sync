import type { ScalableCapitalProfile, SyncConfig, TradeRepublicProfile } from "./shared/config.js";
import { readConfigFromDisk } from "./shared/config.js";
import { tagSharedExpenses } from "./shared/tagging.js";
import type { BrokerSource, CanonicalTransaction } from "./shared/transaction.js";
import { createLunchMoneyClient, resolveTagIds, type TagsApi } from "./lunch-money/client.js";
import { upsertTransactions, type TransactionsApi } from "./lunch-money/upsert.js";
import { createTradeRepublicTransport, fetchTradeRepublicTimeline } from "./trade-republic/client.js";
import { mapTradeRepublicEvents } from "./trade-republic/mapper.js";
import {
  createDefaultScCliRunner,
  fetchAllScalableCapitalTransactions,
} from "./scalable-capital/client.js";
import { mapScalableCapitalTransactions } from "./scalable-capital/mapper.js";

export interface LunchMoneySyncClient extends TagsApi, TransactionsApi {}

export interface BrokerCollectors {
  collectTradeRepublic: (profile: TradeRepublicProfile) => Promise<CanonicalTransaction[]>;
  collectScalableCapital: (profile: ScalableCapitalProfile) => Promise<CanonicalTransaction[]>;
}

export type SyncLogger = (message: string) => void;

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
): Promise<void> {
  const transactions = tagSharedExpenses(rawTransactions, sharedCardLast4);
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
): Promise<void> {
  for (const profile of config.tradeRepublicProfiles) {
    const transactions = await collectors.collectTradeRepublic(profile);
    await syncOneAccount(
      profile.owner,
      "trade-republic",
      transactions,
      profile.lunchMoneyAssetId,
      config.sharedCardLast4,
      client,
      logger,
    );
  }

  for (const profile of config.scalableCapitalProfiles) {
    const transactions = await collectors.collectScalableCapital(profile);
    await syncOneAccount(
      profile.owner,
      "scalable-capital",
      transactions,
      profile.lunchMoneyAssetId,
      config.sharedCardLast4,
      client,
      logger,
    );
  }
}

export function createLiveCollectors(): BrokerCollectors {
  return liveCollectors;
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

async function main(): Promise<void> {
  const config = readConfigFromDisk();
  const client = createLunchMoneyClient(config.lunchMoneyApiKey);
  await runSync(config, client, liveCollectors);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
