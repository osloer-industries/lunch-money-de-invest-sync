import { describe, expect, it } from "vitest";
import type { CanonicalTransaction } from "../shared/transaction.js";
import type { DryRunSummary } from "../lunch-money/preview.js";
import { buildDryRunProfileSummary, buildDryRunReviewSummary } from "./build-summary.js";

function transaction(overrides: Partial<CanonicalTransaction> = {}): CanonicalTransaction {
  return {
    externalId: "trade-republic:evt-1",
    date: "2024-03-10",
    amount: -500,
    currency: "eur",
    payee: "Broad market ETF",
    canonicalType: "buy",
    source: "trade-republic",
    categoryId: 10,
    tags: ["investment"],
    ...overrides,
  };
}

function preview(transactions: readonly CanonicalTransaction[]): DryRunSummary {
  return {
    wouldInsert: transactions.length,
    wouldSkip: 0,
    lines: transactions.map((tx) => ({
      externalId: tx.externalId,
      date: tx.date,
      amount: -tx.amount,
      payee: tx.payee,
      action: "insert" as const,
    })),
  };
}

describe("buildDryRunReviewSummary", () => {
  it("builds category buckets and plain amount rows", () => {
    const uncategorised = transaction({
      externalId: "trade-republic:evt-2",
      date: "2024-03-11",
      amount: 120,
      payee: "Dividend payout",
      canonicalType: "dividend",
      tags: ["needs-review"],
    });
    const { categoryId: _removed, ...uncategorisedRow } = uncategorised;
    const mapped = [transaction(), uncategorisedRow];
    const profile = buildDryRunProfileSummary({
      broker: "trade-republic",
      owner: "operator-a",
      transactions: mapped,
      preview: preview(mapped),
      categoryIdToName: { 10: "Investments" },
      stepIndex: 1,
      stepTotal: 1,
    });

    expect(profile.categoryBuckets.map((bucket) => bucket.categoryLabel).toSorted()).toEqual([
      "Investments",
      "Uncategorised",
    ]);
    expect(profile.rows[0]?.amountPlain).toBe("€500.00 out");
    expect(profile.rows[1]?.amountPlain).toBe("€120.00 in");
    expect(profile.uncategorisedCount).toBe(1);
    expect(profile.needsReviewCount).toBe(1);
    expect(profile.uncategorisedShare).toBe(0.5);

    const summary = buildDryRunReviewSummary([profile]);
    expect(summary.allRowsAreInserts).toBe(true);
    expect(summary.aggregateUncategorisedShare).toBe(0.5);
  });

  it("returns empty date range and zero totals when there are no rows", () => {
    const profile = buildDryRunProfileSummary({
      broker: "scalable-capital",
      owner: "operator-b",
      transactions: [],
      preview: { wouldInsert: 0, wouldSkip: 0, lines: [] },
      categoryIdToName: {},
      stepIndex: 1,
      stepTotal: 1,
    });
    expect(profile.dateFrom).toBeNull();
    expect(profile.dateTo).toBeNull();
    expect(profile.categoryBuckets).toEqual([]);
  });
});