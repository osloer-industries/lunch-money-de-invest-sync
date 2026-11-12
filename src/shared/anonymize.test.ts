import { describe, expect, it } from "vitest";
import { anonymizeTypeExample, bucketAmount, monthOnlyDate, redactSensitiveText } from "./anonymize.js";

describe("anonymize", () => {
  it("buckets amounts without exposing exact values", () => {
    expect(bucketAmount(-12.5)).toBe("outflow-10-to-99");
    expect(bucketAmount(1500)).toBe("inflow-1000-plus");
  });

  it("redacts sensitive tokens", () => {
    expect(redactSensitiveText("Transfer to DE89370400440532013000")).toContain("[iban]");
    expect(redactSensitiveText("ISIN DE0005933931")).toContain("[isin]");
  });

  it("handles invalid dates in monthOnlyDate", () => {
    expect(monthOnlyDate("2026-03")).toBe("2026-03");
    expect(monthOnlyDate("not-a-date")).toBe("unknown-month");
    expect(monthOnlyDate("February 1, 2026")).toBe("2026-02");
  });

  it("anonymises example rows for export", () => {
    const row = anonymizeTypeExample({
      canonicalType: "deposit",
      brokerSubtype: "BrokerCashTransactionSummary",
      source: "scalable-capital",
      amount: 100,
      currency: "EUR",
      payee: "Operator Payee",
      notes: "DE0005933931",
      date: "2026-03-10",
    });
    expect(row.payee).toBe("[counterparty]");
    expect(row.month).toBe("2026-03");
    expect(row.notes).toContain("[isin]");
  });
});
