import { describe, expect, it } from "vitest";
import type { ScalableCapitalTransaction } from "./types.js";
import {
  isCashMovement,
  isSecurityTrade,
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
    expect(isSecurityTrade(transaction({ type: "BrokerSecurityTransaction" }))).toBe(true);
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

  it("returns null for unsupported transaction types", () => {
    expect(mapScalableCapitalTransaction(transaction({ type: "BrokerCryptoTransaction" }))).toBeNull();
  });

  it("returns null for zero-amount rows", () => {
    expect(mapScalableCapitalTransaction(transaction({ type: "BrokerSecurityTransaction", amount: 0 }))).toBeNull();
  });

  it.each([
    { label: "buy (negative amount)", side: "BUY", amount: -50, type: "buy", expected: -50 },
    { label: "buy (positive amount)", side: "BUY", amount: 50, type: "buy", expected: -50 },
    { label: "sell (positive amount)", side: "SELL", amount: 80, type: "sell", expected: 80 },
    { label: "sell (negative amount)", side: "SELL", amount: -80, type: "sell", expected: 80 },
  ])("maps a security $label as a cash movement with the trade-direction sign", ({ side, amount, type, expected }) => {
    const tx = mapScalableCapitalTransaction(
      transaction({ id: "trade-1", type: "BrokerSecurityTransaction", description: "Example ETF", side, amount }),
    );
    expect(tx).toEqual({
      externalId: "scalable-capital:trade-1",
      date: "2026-07-01",
      amount: expected,
      currency: "eur",
      payee: "Example ETF",
      canonicalType: type,
      source: "scalable-capital",
    });
  });

  it("maps a savings-plan execution as an outflow typed savings-plan", () => {
    const tx = mapScalableCapitalTransaction(
      transaction({
        type: "BrokerSecurityTransaction",
        description: "Example ETF",
        securityTransactionType: "SAVINGS_PLAN",
        side: "BUY",
        amount: 25,
      }),
    );
    expect(tx).toMatchObject({ canonicalType: "savings-plan", amount: -25 });
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
  it("maps cash rows and security trades with stable external ids and drops other types", () => {
    const rows = [
      transaction({ id: "a", type: "BrokerCashTransaction" }),
      transaction({ id: "b", type: "BrokerSecurityTransaction", side: "BUY" }),
      transaction({ id: "c", type: "BrokerCryptoTransaction" }),
    ];
    const first = mapScalableCapitalTransactions(rows);
    expect(first.map((tx) => tx.externalId)).toEqual(["scalable-capital:a", "scalable-capital:b"]);
    // Re-running a sync produces the same external ids, so Lunch Money skips them as duplicates.
    expect(mapScalableCapitalTransactions(rows)).toEqual(first);
  });
});
