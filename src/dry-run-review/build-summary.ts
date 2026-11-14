import type { DryRunSummary } from "../lunch-money/preview.js";
import type { BrokerSource, CanonicalTransaction } from "../shared/transaction.js";
import { formatPlainCanonicalAmount } from "./plain-amount.js";
import type {
  DryRunCategoryBucket,
  DryRunProfileSummary,
  DryRunReviewRow,
  DryRunReviewSummary,
} from "./types.js";

const UNCATEGORISED_LABEL = "Uncategorised";
const NEEDS_REVIEW_TAG = "needs-review";

function previewActionMap(preview: DryRunSummary): Map<string, "insert" | "skip_duplicate"> {
  return new Map(preview.lines.map((line) => [line.externalId, line.action]));
}

export interface BuildDryRunProfileInput {
  readonly broker: BrokerSource;
  readonly owner: string;
  readonly transactions: readonly CanonicalTransaction[];
  readonly preview: DryRunSummary;
  readonly categoryIdToName: Readonly<Record<number, string>>;
  readonly stepIndex: number;
  readonly stepTotal: number;
}

function categoryLabelForTransaction(
  tx: CanonicalTransaction,
  categoryIdToName: Readonly<Record<number, string>>,
): string {
  if (tx.categoryId === undefined) {
    return UNCATEGORISED_LABEL;
  }
  return categoryIdToName[tx.categoryId] ?? `Category #${tx.categoryId}`;
}

function buildRow(
  tx: CanonicalTransaction,
  actionMap: Map<string, "insert" | "skip_duplicate">,
  categoryIdToName: Readonly<Record<number, string>>,
): DryRunReviewRow {
  const action = actionMap.get(tx.externalId) ?? "insert";
  return {
    externalId: tx.externalId,
    date: tx.date,
    amountPlain: formatPlainCanonicalAmount(tx.amount, tx.currency),
    payee: tx.payee,
    tags: tx.tags ?? [],
    categoryLabel: categoryLabelForTransaction(tx, categoryIdToName),
    canonicalType: tx.canonicalType,
    action,
  };
}

function dateRange(rows: readonly DryRunReviewRow[]): { from: string | null; to: string | null } {
  if (rows.length === 0) {
    return { from: null, to: null };
  }
  let from = rows[0]!.date;
  let to = rows[0]!.date;
  for (const row of rows) {
    if (row.date < from) {
      from = row.date;
    }
    if (row.date > to) {
      to = row.date;
    }
  }
  return { from, to };
}

function inOutTotalsPlain(transactions: readonly CanonicalTransaction[]): {
  readonly inTotalPlain: string;
  readonly outTotalPlain: string;
} {
  if (transactions.length === 0) {
    const zero = formatPlainCanonicalAmount(0, "eur");
    return { inTotalPlain: zero, outTotalPlain: zero };
  }
  const currency = transactions[0]!.currency;
  let inSum = 0;
  let outSum = 0;
  for (const tx of transactions) {
    if (tx.amount > 0) {
      inSum += tx.amount;
    } else if (tx.amount < 0) {
      outSum += -tx.amount;
    }
  }
  return {
    inTotalPlain: formatPlainCanonicalAmount(inSum, currency),
    outTotalPlain: formatPlainCanonicalAmount(-outSum, currency),
  };
}

function buildCategoryBuckets(
  rows: readonly DryRunReviewRow[],
  transactions: readonly CanonicalTransaction[],
): DryRunCategoryBucket[] {
  const categoryIdByExternalId = new Map(
    transactions.map((tx) => [tx.externalId, tx.categoryId] as const),
  );
  const byLabel = new Map<string, DryRunReviewRow[]>();
  for (const row of rows) {
    const list = byLabel.get(row.categoryLabel) ?? [];
    list.push(row);
    byLabel.set(row.categoryLabel, list);
  }
  return [...byLabel.entries()]
    .map(([categoryLabel, bucketRows]) => {
      const categoryId = bucketRows
        .map((row) => categoryIdByExternalId.get(row.externalId))
        .find((id) => id !== undefined);
      return {
        categoryLabel,
        count: bucketRows.length,
        rows: bucketRows,
        ...(categoryId === undefined ? {} : { categoryId }),
      };
    })
    .toSorted((left, right) => left.categoryLabel.localeCompare(right.categoryLabel));
}

export function buildDryRunProfileSummary(input: BuildDryRunProfileInput): DryRunProfileSummary {
  const actionMap = previewActionMap(input.preview);
  const rows = input.transactions.map((tx) => buildRow(tx, actionMap, input.categoryIdToName));
  const uncategorisedCount = rows.filter((row) => row.categoryLabel === UNCATEGORISED_LABEL).length;
  const needsReviewCount = rows.filter((row) => row.tags.includes(NEEDS_REVIEW_TAG)).length;
  const uncategorisedShare = rows.length === 0 ? 0 : uncategorisedCount / rows.length;
  const range = dateRange(rows);
  const totals = inOutTotalsPlain(input.transactions);

  return {
    broker: input.broker,
    owner: input.owner,
    stepIndex: input.stepIndex,
    stepTotal: input.stepTotal,
    wouldInsert: input.preview.wouldInsert,
    wouldSkip: input.preview.wouldSkip,
    uncategorisedCount,
    needsReviewCount,
    uncategorisedShare,
    dateFrom: range.from,
    dateTo: range.to,
    inTotalPlain: totals.inTotalPlain,
    outTotalPlain: totals.outTotalPlain,
    categoryBuckets: buildCategoryBuckets(rows, input.transactions),
    rows,
  };
}

export function buildDryRunReviewSummary(profiles: readonly DryRunProfileSummary[]): DryRunReviewSummary {
  const totalWouldInsert = profiles.reduce((sum, profile) => sum + profile.wouldInsert, 0);
  const totalWouldSkip = profiles.reduce((sum, profile) => sum + profile.wouldSkip, 0);
  const totalRows = profiles.reduce((sum, profile) => sum + profile.rows.length, 0);
  const totalUncategorised = profiles.reduce((sum, profile) => sum + profile.uncategorisedCount, 0);
  const aggregateUncategorisedShare = totalRows === 0 ? 0 : totalUncategorised / totalRows;
  const allRowsAreInserts =
    totalWouldInsert > 0 &&
    profiles.every((profile) => profile.rows.every((row) => row.action === "insert"));

  return {
    profiles,
    totalWouldInsert,
    totalWouldSkip,
    aggregateUncategorisedShare,
    allRowsAreInserts,
  };
}