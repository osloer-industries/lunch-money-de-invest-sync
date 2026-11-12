import { describe, expect, it } from "vitest";
import type { ScalableCapitalTransaction } from "./types.js";
import {
  isCashMovement,
  mapScalableCapitalTransaction,
  mapScalableCapitalTransactions,
  utcCalendarDateFromEventTimestamp,
} from "./mapper.js";

function transaction(overrides: Partial<ScalableCapitalTransaction> = {}): ScalableCapitalTransaction {
  return {
    id: "sc-1",
    date: "2026-07-01T10:00:00Z",
    type: "BrokerCashTransaction",
    description: "SEPA transfer",
    amount: -100,
    currency: "EUR",
    ...overrides,
  };
}

describe("isCashMovement", () => {
  it("is true for cash transactions", () => {
    expect(isCashMovement(transaction({ type: "BrokerCashTransaction" }))).toBe(true);
  });

  it("is false for security trades", () => {
    expect(isCashMovement(transaction({ type: "BrokerSecurityTransaction" }))).toBe(false);
  });
});

describe("utcCalendarDateFromEventTimestamp", () => {
  it("uses the UTC calendar day even when the timestamp carries a positive offset", () => {
    expect(utcCalendarDateFromEventTimestamp("2026-07-02T00:30:00+02:00")).toBe("2026-07-01");
  });

  it("throws when the timestamp is not parseable", () => {
    expect(() => utcCalendarDateFromEventTimestamp("not-a-date")).toThrow(/not valid ISO-8601/);
  });
});

describe("mapScalableCapitalTransaction", () => {
  it("maps a cash transaction to a canonical transaction", () => {
    const tx = mapScalableCapitalTransaction(transaction());
    expect(tx).toEqual({
      externalId: "scalable-capital:sc-1",
      date: "2026-07-01",
      amount: -100,
      currency: "eur",
      payee: "SEPA transfer",
      canonicalType: "transfer",
      source: "scalable-capital",
    });
  });

  it("returns null for a security trade", () => {
    expect(mapScalableCapitalTransaction(transaction({ type: "BrokerSecurityTransaction" }))).toBeNull();
  });

  it("falls back to a generic payee when the description is empty", () => {
    const tx = mapScalableCapitalTransaction(transaction({ description: "" }));
    expect(tx?.payee).toBe("Scalable Capital");
  });

  it("rejects a malformed currency code rather than passing it through", () => {
    expect(() => mapScalableCapitalTransaction(transaction({ currency: "€€" }))).toThrow(
      /Not a valid 3-letter currency code/,
    );
  });
});

describe("mapScalableCapitalTransactions", () => {
  it("filters out non-cash transactions while mapping the rest", () => {
    const result = mapScalableCapitalTransactions([
      transaction({ id: "a", type: "BrokerCashTransaction" }),
      transaction({ id: "b", type: "BrokerSecurityTransaction" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.externalId).toBe("scalable-capital:a");
  });
});
