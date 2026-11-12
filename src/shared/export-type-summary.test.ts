import { describe, expect, it } from "vitest";
import { buildTypeSummaryFromGroups, serializeTypeSummaryFromGroups } from "./export-type-summary.js";

describe("export-type-summary", () => {
  it("serialises anonymised groups", () => {
    const json = serializeTypeSummaryFromGroups([
      {
        canonicalType: "deposit",
        brokerSubtype: "BrokerCashTransactionSummary",
        source: "scalable-capital",
        count: 2,
        sample: {
          canonicalType: "deposit",
          brokerSubtype: "BrokerCashTransactionSummary",
          source: "scalable-capital",
          amount: 100,
          currency: "eur",
          payee: "Secret Payee",
          date: "2026-03-01",
        },
      },
    ]);
    const doc = JSON.parse(json);
    expect(doc.version).toBe(1);
    expect(doc.groups[0].example.payee).toBe("[counterparty]");
    expect(buildTypeSummaryFromGroups([]).groups).toEqual([]);
  });
});
