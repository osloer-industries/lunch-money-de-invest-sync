import { previewUpsert } from "../lunch-money/preview.js";
import { applyCategoryTagMappings } from "../shared/apply-mappings.js";
import type { ScalableCapitalProfile, SyncConfig, TradeRepublicProfile } from "../shared/config.js";
import type { SyncBroker } from "../sync-options.js";
import { filterSyncConfig } from "../sync-options.js";
import { tagSharedExpenses } from "../shared/tagging.js";
import type { BrokerSource, CanonicalTransaction } from "../shared/transaction.js";
import { forEachProfileSequentially } from "../shared/sequential-profiles.js";
import type { TransactionsApi } from "../lunch-money/upsert.js";
import { buildDryRunProfileSummary, buildDryRunReviewSummary } from "./build-summary.js";
import { filterTransactionsSince } from "./since.js";
import type { DryRunProfileSummary, DryRunReviewSummary } from "./types.js";

export interface DryRunCollectionSelection {
  readonly includeBrokers: ReadonlySet<SyncBroker>;
  readonly owners: readonly string[];
  readonly since?: string;
}

export interface DryRunBrokerCollectors {
  readonly collectTradeRepublic: (profile: TradeRepublicProfile) => Promise<CanonicalTransaction[]>;
  readonly collectScalableCapital: (profile: ScalableCapitalProfile) => Promise<CanonicalTransaction[]>;
}

type DryRunCollectionClient = TransactionsApi & {
  readonly categories?: {
    getAll(): Promise<ReadonlyArray<{ readonly id: number; readonly name: string }>>;
  };
};

interface CollectProfileSummaryParams<T extends { owner: string; lunchMoneyAssetId: number }> {
  readonly profile: T;
  readonly broker: BrokerSource;
  readonly collect: (profile: T) => Promise<CanonicalTransaction[]>;
  readonly config: SyncConfig;
  readonly client: DryRunCollectionClient;
  readonly categoryIdToName: Readonly<Record<number, string>>;
  readonly since: string | undefined;
  readonly stepIndex: number;
  readonly stepTotal: number;
}

async function loadCategoryIdToName(client: DryRunCollectionClient): Promise<Record<number, string>> {
  if (!client.categories?.getAll) {
    return {};
  }
  const rows = await client.categories.getAll();
  return Object.fromEntries(rows.map((row) => [row.id, row.name]));
}

function effectiveSince(config: SyncConfig, selection: DryRunCollectionSelection): string | undefined {
  return selection.since ?? config.syncSince;
}

function prepareTransactions(
  raw: readonly CanonicalTransaction[],
  config: SyncConfig,
  since: string | undefined,
): CanonicalTransaction[] {
  const mapped = tagSharedExpenses(
    applyCategoryTagMappings(raw, config.categoryMap, config.tagMap),
    config.sharedCardLast4,
  );
  return since ? filterTransactionsSince(mapped, since) : [...mapped];
}

async function collectProfileSummary<T extends { owner: string; lunchMoneyAssetId: number }>(
  params: CollectProfileSummaryParams<T>,
): Promise<DryRunProfileSummary> {
  const raw = await params.collect(params.profile);
  const transactions = prepareTransactions(raw, params.config, params.since);
  const preview = await previewUpsert(params.client, transactions, params.profile.lunchMoneyAssetId);
  return buildDryRunProfileSummary({
    broker: params.broker,
    owner: params.profile.owner,
    transactions,
    preview,
    categoryIdToName: params.categoryIdToName,
    stepIndex: params.stepIndex,
    stepTotal: params.stepTotal,
  });
}

interface CollectForBrokerParams<T extends { owner: string; lunchMoneyAssetId: number }> {
  readonly broker: BrokerSource;
  readonly profiles: readonly T[];
  readonly collect: (profile: T) => Promise<CanonicalTransaction[]>;
  readonly config: SyncConfig;
  readonly client: DryRunCollectionClient;
  readonly categoryIdToName: Readonly<Record<number, string>>;
  readonly since: string | undefined;
  readonly stepTotal: number;
  readonly stepCounter: { value: number };
  readonly summaries: DryRunProfileSummary[];
}

async function collectForBroker<T extends { owner: string; lunchMoneyAssetId: number }>(
  params: CollectForBrokerParams<T>,
): Promise<void> {
  await forEachProfileSequentially(params.profiles, async (profile) => {
    params.stepCounter.value += 1;
    params.summaries.push(
      await collectProfileSummary({
        profile,
        broker: params.broker,
        collect: params.collect,
        config: params.config,
        client: params.client,
        categoryIdToName: params.categoryIdToName,
        since: params.since,
        stepIndex: params.stepCounter.value,
        stepTotal: params.stepTotal,
      }),
    );
  });
}

/**
 * Fetches and maps broker data like sync, then returns structured dry-run summaries
 * without logging every preview line.
 */
export async function runDryRunCollection(
  config: SyncConfig,
  client: DryRunCollectionClient,
  collectors: DryRunBrokerCollectors,
  selection: DryRunCollectionSelection,
): Promise<DryRunReviewSummary> {
  const since = effectiveSince(config, selection);
  const categoryIdToName = await loadCategoryIdToName(client);

  const tradeProfiles = selection.includeBrokers.has("trade-republic")
    ? filterSyncConfig(config.tradeRepublicProfiles, selection.owners)
    : [];
  const scalableProfiles = selection.includeBrokers.has("scalable-capital")
    ? filterSyncConfig(config.scalableCapitalProfiles, selection.owners)
    : [];

  if (
    selection.owners.length > 0 &&
    tradeProfiles.length === 0 &&
    scalableProfiles.length === 0
  ) {
    throw new Error(`No profiles matched --account filter: ${selection.owners.join(", ")}`);
  }

  const stepTotal = tradeProfiles.length + scalableProfiles.length;
  const profiles: DryRunProfileSummary[] = [];
  const stepCounter = { value: 0 };

  if (tradeProfiles.length > 0) {
    await collectForBroker({
      broker: "trade-republic",
      profiles: tradeProfiles,
      collect: collectors.collectTradeRepublic,
      config,
      client,
      categoryIdToName,
      since,
      stepTotal,
      stepCounter,
      summaries: profiles,
    });
  }
  if (scalableProfiles.length > 0) {
    await collectForBroker({
      broker: "scalable-capital",
      profiles: scalableProfiles,
      collect: collectors.collectScalableCapital,
      config,
      client,
      categoryIdToName,
      since,
      stepTotal,
      stepCounter,
      summaries: profiles,
    });
  }

  return buildDryRunReviewSummary(profiles);
}