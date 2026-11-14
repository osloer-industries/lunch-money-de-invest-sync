import type { DryRunProfileSummary } from "./dry-run-review/types.js";
import type { BrokerBalanceSnapshot } from "./shared/broker-balances.js";
import type { BrokerSource } from "./shared/transaction.js";

export interface SyncAccountResult {
  readonly owner: string;
  readonly source: BrokerSource;
  readonly lunchMoneyAssetId: number;
  readonly firstSyncForAccount: boolean;
  readonly existingBrokerExternalIds: number;
  readonly dryRun: boolean;
  readonly insertedCount?: number;
  readonly skippedCount?: number;
  readonly wouldInsert?: number;
  readonly wouldSkip?: number;
  /** Structured dry-run review for this profile (`--dry-run --json`). */
  readonly dryRunSummary?: DryRunProfileSummary;
  /** Broker balance readings after the transaction sync (--json only). */
  readonly brokerBalances?: BrokerBalanceSnapshot;
  /** Balance steps (holdings, savings, cash reconciliation) that failed for this profile (--json only). */
  readonly balanceFailures?: number;
}

export interface SyncRunJsonDryRunMeta {
  readonly aggregateUncategorisedShare: number;
  readonly uncategorisedShareExceedsThreshold: boolean;
}

export interface SyncRunJsonResult {
  readonly ok: true;
  readonly balanceFailures: number;
  readonly accounts: readonly SyncAccountResult[];
  readonly dryRunReview?: SyncRunJsonDryRunMeta;
}