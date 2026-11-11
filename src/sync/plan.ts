import type { BrokerSource, CanonicalTransaction } from "../shared/transaction.js";

export interface AccountSyncPlan {
  brokerSource: BrokerSource;
  owner: string;
  lunchMoneyAssetId: number;
  transactions: readonly CanonicalTransaction[];
}

export interface AccountSyncPlanSummary {
  transactionCount: number;
  dateMin: string | null;
  dateMax: string | null;
  netAmount: number;
  sharedTaggedCount: number;
  externalIdPreview: string[];
  hiddenExternalIdCount: number;
}

const EXTERNAL_ID_PREVIEW_LIMIT = 5;

export function summarizeAccountSyncPlan(transactions: readonly CanonicalTransaction[]): AccountSyncPlanSummary {
  if (transactions.length === 0) {
    return {
      transactionCount: 0,
      dateMin: null,
      dateMax: null,
      netAmount: 0,
      sharedTaggedCount: 0,
      externalIdPreview: [],
      hiddenExternalIdCount: 0,
    };
  }

  const dates = transactions
    .map((tx) => tx.date)
    .toSorted((a, b) => a.localeCompare(b));
  const netAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  const sharedTaggedCount = transactions.filter((tx) => tx.tags?.includes("shared")).length;
  const externalIds = transactions.map((tx) => tx.externalId);
  const externalIdPreview = externalIds.slice(0, EXTERNAL_ID_PREVIEW_LIMIT);
  const hiddenExternalIdCount = Math.max(0, externalIds.length - externalIdPreview.length);

  return {
    transactionCount: transactions.length,
    dateMin: dates[0] ?? null,
    dateMax: dates.at(-1) ?? null,
    netAmount,
    sharedTaggedCount,
    externalIdPreview,
    hiddenExternalIdCount,
  };
}

/** Human-readable dry-run line safe to show an operator (no broker credentials). */
export function formatDryRunAccountLine(
  plan: AccountSyncPlan,
  summary: AccountSyncPlanSummary,
): string {
  const prefix = `[dry-run] [${plan.brokerSource}:${plan.owner}] → Lunch Money manual account ${plan.lunchMoneyAssetId}`;
  if (summary.transactionCount === 0) {
    return `${prefix}: no transactions to upsert`;
  }

  const dateRange =
    summary.dateMin === summary.dateMax
      ? `on ${summary.dateMin}`
      : `${summary.dateMin} … ${summary.dateMax}`;
  const moreIds =
    summary.hiddenExternalIdCount > 0 ? ` (+${summary.hiddenExternalIdCount} more external_id values)` : "";
  const sharedNote =
    summary.sharedTaggedCount > 0 ? `, ${summary.sharedTaggedCount} tagged "shared"` : "";

  return [
    `${prefix}: ${summary.transactionCount} transaction(s) ${dateRange}, net amount ${summary.netAmount.toFixed(2)}${sharedNote}`,
    `  external_id preview: ${summary.externalIdPreview.join(", ")}${moreIds}`,
  ].join("\n");
}
