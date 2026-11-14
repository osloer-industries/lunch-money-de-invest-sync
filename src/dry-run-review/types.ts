import type { CanonicalType } from "../shared/canonical-type.js";
import type { BrokerSource } from "../shared/transaction.js";

/** One mapped transaction row in the dry-run review UI (future JSON API #83). */
export interface DryRunReviewRow {
  readonly externalId: string;
  readonly date: string;
  readonly amountPlain: string;
  readonly payee: string;
  readonly tags: readonly string[];
  readonly categoryLabel: string;
  readonly canonicalType: CanonicalType;
  readonly action: "insert" | "skip_duplicate";
}

/** Rows grouped under one Lunch Money category label for drill-down. */
export interface DryRunCategoryBucket {
  readonly categoryLabel: string;
  readonly categoryId?: number;
  readonly count: number;
  readonly rows: readonly DryRunReviewRow[];
}

/** Per broker profile summary shown before the operator confirms sync. */
export interface DryRunProfileSummary {
  readonly broker: BrokerSource;
  readonly owner: string;
  readonly stepIndex: number;
  readonly stepTotal: number;
  readonly wouldInsert: number;
  readonly wouldSkip: number;
  readonly uncategorisedCount: number;
  readonly needsReviewCount: number;
  readonly uncategorisedShare: number;
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
  readonly inTotalPlain: string;
  readonly outTotalPlain: string;
  readonly categoryBuckets: readonly DryRunCategoryBucket[];
  readonly rows: readonly DryRunReviewRow[];
}

/** Aggregate dry-run review payload across all profiles in a sync pass. */
export interface DryRunReviewSummary {
  readonly profiles: readonly DryRunProfileSummary[];
  readonly totalWouldInsert: number;
  readonly totalWouldSkip: number;
  readonly aggregateUncategorisedShare: number;
  readonly allRowsAreInserts: boolean;
}