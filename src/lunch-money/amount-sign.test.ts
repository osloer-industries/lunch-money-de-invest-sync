import { describe, expect, it } from "vitest";
import type { CanonicalTransaction } from "../shared/transaction.js";
import { toCurrency } from "../shared/transaction.js";
import { classifyScalableSummary } from "../shared/broker-type-classification.js";
import type { PytrTimelineEvent } from "../trade-republic/types.js";
import { mapTradeRepublicEvent } from "../trade-republic/mapper.js";
import { mapScalableCapitalTransaction } from "../scalable-capital/mapper.js";
import type { ScalableCapitalTransaction } from "../scalable-capital/types.js";
import { toInsertPayload, toLunchMoneyV2Amount } from "./upsert.js";

function v2AmountFromCanonical(tx: CanonicalTransaction): number {
  const tagIds = new Map((tx.tags ?? []).map((name, index) => [name, index + 1]));
  const raw = toInsertPayload([tx], 1, tagIds).transactions[0]?.amount;
  return typeof raw === "number" ? raw : Number(raw);
}

function trEvent(
  eventType: string,
  value: number,
  overrides: Partial<PytrTimelineEvent> = {},
): PytrTimelineEvent {
  return {
    id: `tr-${eventType}`,
    timestamp: "2026-07-01T12:00:00.000Z",
    title: "Synthetic payee",
    amount: { currency: "EUR", value, fractionDigits: 2 },
    eventType,
    ...overrides,
  };
}

function scCash(
  description: string,
  amount: number,
  overrides: Partial<ScalableCapitalTransaction> = {},
): ScalableCapitalTransaction {
  return {
    id: `sc-${description.replace(/\s+/g, "-").toLowerCase()}`,
    date: "2026-07-01T10:00:00Z",
    type: "BrokerCashTransaction",
    description,
    amount,
    currency: "EUR",
    ...overrides,
  };
}

describe("toLunchMoneyV2Amount", () => {
  it("maps canonical outflows to positive v2 debits and inflows to negative v2 credits", () => {
    expect(toLunchMoneyV2Amount(-50)).toBe(50);
    expect(toLunchMoneyV2Amount(50)).toBe(-50);
  });
});

describe("Trade Republic mapper → Lunch Money v2 insert amount", () => {
  const cases: Array<{
    readonly label: string;
    readonly event: PytrTimelineEvent;
    readonly expectedV2: number;
  }> = [
    { label: "buy", event: trEvent("TRADE_BUY", -50), expectedV2: 50 },
    { label: "sell", event: trEvent("TRADE_SELL", 90), expectedV2: -90 },
    { label: "savings-plan", event: trEvent("SAVINGS_PLAN_EXECUTION", -25), expectedV2: 25 },
    { label: "deposit", event: trEvent("INCOMING_TRANSFER", 200), expectedV2: -200 },
    { label: "withdrawal", event: trEvent("OUTGOING_TRANSFER", -75), expectedV2: 75 },
    { label: "dividend", event: trEvent("DIVIDEND_PAYMENT", 12), expectedV2: -12 },
    { label: "interest", event: trEvent("INTEREST_PAYMENT", 3.5), expectedV2: -3.5 },
    { label: "fee", event: trEvent("ACCOUNT_FEE", -2), expectedV2: 2 },
    { label: "tax", event: trEvent("CAPITAL_GAINS_TAX", -8), expectedV2: 8 },
    {
      label: "saveback",
      event: trEvent("benefits_saveback_execution", -5),
      expectedV2: 5,
    },
    {
      label: "card spend",
      event: trEvent("CARD_TRANSACTION", -12.5, { title: "Synthetic store", subtitle: "Card payment" }),
      expectedV2: 12.5,
    },
  ];

  it.each(cases)("$label", ({ event, expectedV2 }) => {
    const mapped = mapTradeRepublicEvent(event);
    expect(mapped).not.toBeNull();
    expect(v2AmountFromCanonical(mapped!)).toBe(expectedV2);
  });
});

describe("Scalable Capital mapper → Lunch Money v2 insert amount", () => {
  const cases: Array<{
    readonly label: string;
    readonly row: ScalableCapitalTransaction;
    readonly expectedV2: number;
  }> = [
    { label: "deposit", row: scCash("Deposit", 50), expectedV2: -50 },
    { label: "withdrawal", row: scCash("Auszahlung", -80), expectedV2: 80 },
    { label: "dividend", row: scCash("Dividend payment", 11), expectedV2: -11 },
    { label: "interest", row: scCash("Interest zins", 1.25), expectedV2: -1.25 },
    { label: "fee", row: scCash("Custody fee", -1), expectedV2: 1 },
    { label: "tax", row: scCash("Capital gains tax", -4), expectedV2: 4 },
    { label: "transfer", row: scCash("SEPA transfer", -100), expectedV2: 100 },
  ];

  it.each(cases)("$label", ({ row, expectedV2 }) => {
    const mapped = mapScalableCapitalTransaction(row);
    expect(mapped).not.toBeNull();
    expect(v2AmountFromCanonical(mapped!)).toBe(expectedV2);
  });
});

/**
 * Security buy/sell/savings-plan rows are synced as cash movements. These helpers build the
 * canonical shape from classification fixture amounts so v2 sign conversion stays covered.
 */
function canonicalFromScalableSummary(
  id: string,
  description: string,
  amount: string,
  summaryType: string,
): CanonicalTransaction {
  const observed = classifyScalableSummary({
    id,
    summary_type: summaryType,
    description,
    amount,
    currency: "EUR",
    last_event_datetime: "2026-01-01T00:00:00Z",
  });
  expect(observed).not.toBeNull();
  return {
    externalId: `scalable-capital:${id}`,
    date: observed!.date,
    amount: observed!.amount,
    currency: toCurrency(observed!.currency),
    payee: observed!.payee,
    canonicalType: observed!.canonicalType,
    source: "scalable-capital",
  };
}

describe("Scalable Capital security summaries → Lunch Money v2 insert amount", () => {
  it("buy outflow is sent as a positive v2 amount when canonical amount is negative", () => {
    const tx = canonicalFromScalableSummary("buy-1", "Buy ETF", "-100", "BrokerSecurityTransactionSummary");
    expect(tx.canonicalType).toBe("buy");
    expect(v2AmountFromCanonical(tx)).toBe(100);
  });

  it("sell inflow is sent as a negative v2 amount when canonical amount is positive", () => {
    const tx = canonicalFromScalableSummary("sell-1", "Sell ETF", "90", "BrokerSecurityTransactionSummary");
    expect(tx.canonicalType).toBe("sell");
    expect(v2AmountFromCanonical(tx)).toBe(-90);
  });

  it("savings-plan outflow is sent as a positive v2 amount when canonical amount is negative", () => {
    const tx = canonicalFromScalableSummary(
      "sp-1",
      "Sparplan ETF",
      "-25",
      "BrokerSecurityTransactionSummary",
    );
    expect(tx.canonicalType).toBe("savings-plan");
    expect(v2AmountFromCanonical(tx)).toBe(25);
  });
});