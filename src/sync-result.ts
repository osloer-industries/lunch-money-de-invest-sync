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
  /**
   * HOOK(#84): When the forgiving dry-run summary module lands, populate `dryRunSummary` here
   * for `--json` output instead of echoing row-level preview lines.
   */
  readonly dryRunSummary?: null;
}

export interface SyncRunResult {
  readonly ok: true;
  readonly accounts: readonly SyncAccountResult[];
}