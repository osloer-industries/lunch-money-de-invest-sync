import { describe, expect, it } from "vitest";
import type { CanonicalTransaction } from "../shared/transaction.js";
import { formatDryRunAccountLine, summarizeAccountSyncPlan } from "./plan.js";

function tx(overrides: Partial<CanonicalTransaction> = {}): CanonicalTransaction {
  return {
    externalId: "tr:1",
    date: "2026-07-01",
    amount: -10,
    currency: "eur",
    payee: "Shop",
    source: "trade-republic",
    ...overrides,
  };
}

describe("summarizeAccountSyncPlan", () => {
  it("returns zeros for an empty batch", () => {
    expect(summarizeAccountSyncPlan([])).toEqual({
      transactionCount: 0,
      dateMin: null,
      dateMax: null,
      netAmount: 0,
      sharedTaggedCount: 0,
      externalIdPreview: [],
      hiddenExternalIdCount: 0,
    });
  });

  it("aggregates date range, net amount, and tag counts", () => {
    const summary = summarizeAccountSyncPlan([
      tx({ date: "2026-07-03", amount: -5, tags: ["shared"] }),
      tx({ date: "2026-07-01", amount: 2, externalId: "tr:2" }),
    ]);
    expect(summary.transactionCount).toBe(2);
    expect(summary.dateMin).toBe("2026-07-01");
    expect(summary.dateMax).toBe("2026-07-03");
    expect(summary.netAmount).toBe(-3);
    expect(summary.sharedTaggedCount).toBe(1);
  });
});

describe("formatDryRunAccountLine", () => {
  it("reports when there is nothing to upsert", () => {
    const plan = {
      brokerSource: "trade-republic" as const,
      owner: "operator-b",
      lunchMoneyAssetId: 7,
      transactions: [],
    };
    expect(formatDryRunAccountLine(plan, summarizeAccountSyncPlan([]))).toContain(
      "no transactions to upsert",
    );
  });

  it("uses a single-date phrase when min and max match", () => {
    const plan = {
      brokerSource: "trade-republic" as const,
      owner: "operator-b",
      lunchMoneyAssetId: 7,
      transactions: [tx()],
    };
    const line = formatDryRunAccountLine(plan, summarizeAccountSyncPlan(plan.transactions));
    expect(line).toContain("on 2026-07-01");
  });

  it("truncates long external_id lists in the preview", () => {
    const plan = {
      brokerSource: "trade-republic" as const,
      owner: "operator-b",
      lunchMoneyAssetId: 7,
      transactions: Array.from({ length: 8 }, (_, index) => tx({ externalId: `tr:${index}` })),
    };
    const line = formatDryRunAccountLine(plan, summarizeAccountSyncPlan(plan.transactions));
    expect(line).toContain("(+3 more external_id values)");
  });

  it("describes a non-empty plan without credentials", () => {
    const plan = {
      brokerSource: "scalable-capital" as const,
      owner: "operator-b",
      lunchMoneyAssetId: 42,
      transactions: [tx()],
    };
    const line = formatDryRunAccountLine(plan, summarizeAccountSyncPlan(plan.transactions));
    expect(line).toContain("manual account 42");
    expect(line).toContain("external_id preview");
    expect(line).not.toMatch(/pin|phone/i);
  });
});
