import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CanonicalType } from "./canonical-type.js";
import {
  classifyScalableSummary,
  classifyTradeRepublicEvent,
  isCanceledTradeRepublicEvent,
  observeTradeRepublicEvents,
} from "./broker-type-classification.js";
import { mapTradeRepublicEvents } from "../trade-republic/mapper.js";
import { pytrAllEventsSchema, type PytrTimelineEvent } from "../trade-republic/types.js";
import { mapScalableCapitalTransaction } from "../scalable-capital/mapper.js";
import type { ScTransactionSummary } from "../scalable-capital/types.js";

function trEvent(overrides: Partial<PytrTimelineEvent> = {}): PytrTimelineEvent {
  return {
    id: "evt-1",
    timestamp: "2026-01-01T10:00:00.000+0000",
    title: "Example",
    amount: { currency: "EUR", value: -100, fractionDigits: 2 },
    eventType: "UNLISTED",
    ...overrides,
  };
}

function trType(eventType: string, value: number, subtitle?: string): CanonicalType | undefined {
  return classifyTradeRepublicEvent(
    trEvent({ eventType, amount: { currency: "EUR", value }, ...(subtitle ? { subtitle } : {}) }),
  )?.canonicalType;
}

describe("Trade Republic event types observed on a real account history", () => {
  it.each<[string, number, string | undefined, CanonicalType]>([
    ["PAYMENT_INBOUND", 100, undefined, "deposit"],
    ["TRADING_SAVINGSPLAN_EXECUTED", -50, "Sparplan ausgeführt", "savings-plan"],
    ["SSP_CORPORATE_ACTION_CASH", 10, "Bardividende", "dividend"],
    ["BANK_TRANSACTION_INCOMING", 200, undefined, "deposit"],
    ["BANK_TRANSACTION_OUTGOING", -300, "Gesendet", "withdrawal"],
    ["TRADING_TRADE_EXECUTED", -100, "Kauforder", "buy"],
    ["ORDER_EXECUTED", -100, "Kauforder", "buy"],
    ["TRADE_INVOICE", -100, "Kauforder", "buy"],
    ["CREDIT", 5, "Dividende", "dividend"],
    ["PAYMENT_OUTBOUND", -400, undefined, "withdrawal"],
    // Already correct before this change — kept as regressions.
    ["SAVINGS_PLAN_EXECUTED", -50, undefined, "savings-plan"],
    ["SAVINGS_PLAN_INVOICE_CREATED", -50, undefined, "savings-plan"],
    ["INTEREST_PAYOUT", 1, undefined, "interest"],
    ["INTEREST_PAYOUT_CREATED", 1, undefined, "interest"],
    ["PRE_DETERMINED_TAX_BASE", -1, undefined, "tax"],
    ["TAX_REFUND", 1, undefined, "tax"],
  ])("%s (%d, %s) → %s", (eventType, value, subtitle, expected) => {
    expect(trType(eventType, value, subtitle)).toBe(expected);
  });

  it("matches exact subtypes case-insensitively", () => {
    expect(trType("payment_inbound", 100)).toBe("deposit");
  });
});

describe("Trade Republic buy/sell disambiguation for order subtypes", () => {
  it.each<[string, number, string | undefined, CanonicalType]>([
    ["TRADE_INVOICE", 100, "Verkaufsorder", "sell"],
    ["ORDER_EXECUTED", 100, "Limit Verkauf-Order neu abgerechnet", "sell"],
    ["TRADING_TRADE_EXECUTED", 100, "Limit-Sell-Order", "sell"],
    ["TRADING_TRADE_EXECUTED", -100, "Limit-Buy-Order", "buy"],
    ["TRADE_INVOICE", -1, "Round up", "buy"],
    ["TRADE_INVOICE", -50, "Sparplan ausgeführt", "savings-plan"],
    // No subtitle hint: canonical sign decides (inflow = sell, outflow = buy).
    ["ORDER_EXECUTED", 100, undefined, "sell"],
    ["ORDER_EXECUTED", -100, undefined, "buy"],
    ["TRADE_CORRECTED", 100, "Unrecognised text", "sell"],
  ])("%s (%d, %s) → %s", (eventType, value, subtitle, expected) => {
    expect(trType(eventType, value, subtitle)).toBe(expected);
  });
});

describe("Trade Republic corporate-action cash", () => {
  it.each<[string, number, string | undefined, CanonicalType]>([
    ["SSP_CORPORATE_ACTION_CASH", 10, "Dividende Wahlweise", "dividend"],
    ["SSP_CORPORATE_ACTION_INVOICE_CASH", 10, undefined, "dividend"],
    ["SSP_CORPORATE_ACTION_CASH", -2, "Vorabpauschale", "tax"],
    ["SSP_CORPORATE_ACTION_CASH", 2, "Vorabpauschale", "tax"],
    ["SSP_CORPORATE_ACTION_CASH", -2, undefined, "tax"],
  ])("%s (%d, %s) → %s", (eventType, value, subtitle, expected) => {
    expect(trType(eventType, value, subtitle)).toBe(expected);
  });
});

describe("Trade Republic rule-order regressions", () => {
  it("never lets SAVINGSPLAN (no underscore) fall into buy", () => {
    expect(trType("TRADING_SAVINGSPLAN_SOMETHING_NEW", -50)).toBe("savings-plan");
  });

  it("keeps deposit vs withdrawal for unlisted inbound/outbound subtypes instead of generic transfer", () => {
    expect(trType("PAYMENT_INBOUND_NEW_METHOD", 100)).toBe("deposit");
    expect(trType("PAYMENT_OUTBOUND_NEW_METHOD", -100)).toBe("withdrawal");
    expect(trType("BANK_TRANSACTION_INCOMING_INSTANT", 100)).toBe("deposit");
    expect(trType("BANK_TRANSACTION_OUTGOING_INSTANT", -100)).toBe("withdrawal");
    expect(trType("INTERNAL_TRANSFER", -100)).toBe("transfer");
  });

  it("keeps saveback ahead of the exact table and unknown for unrelated subtypes", () => {
    expect(trType("benefits_saveback_execution", -5)).toBe("saveback");
    expect(trType("CARD_TRANSACTION", -12)).toBe("unknown");
  });
});

describe("Trade Republic declined / cancelled rows", () => {
  it("skips rows with a structured CANCELED status (top-level or detail header)", () => {
    expect(classifyTradeRepublicEvent(trEvent({ eventType: "BANK_TRANSACTION_INCOMING", status: "CANCELED" }))).toBeNull();
    expect(classifyTradeRepublicEvent(trEvent({ status: "cancelled" }))).toBeNull();
    expect(
      classifyTradeRepublicEvent(
        trEvent({ details: { sections: [{ type: "header", data: { status: "canceled" } }] } }),
      ),
    ).toBeNull();
  });

  it("keeps rows whose only signal is free text such as 'Abgelehnt'", () => {
    expect(trType("BANK_TRANSACTION_INCOMING", 200, "Abgelehnt")).toBe("deposit");
  });

  it.each<[unknown]>([
    [undefined],
    [null],
    ["not an object"],
    [{}],
    [{ sections: "nope" }],
    [{ sections: [null, { type: "table" }] }],
    [{ sections: [{ type: "header" }] }],
    [{ sections: [{ type: "header", data: null }] }],
    [{ sections: [{ type: "header", data: { status: "executed" } }] }],
  ])("does not treat details %j as cancelled", (details) => {
    expect(isCanceledTradeRepublicEvent({ status: "EXECUTED", details })).toBe(false);
  });
});

describe("anonymised Trade Republic classification fixture", () => {
  const fixturePath = path.join(import.meta.dirname, "..", "trade-republic", "fixtures", "classification-events.json");
  const events = pytrAllEventsSchema.parse(JSON.parse(readFileSync(fixturePath, "utf8")));
  const expected: Record<string, CanonicalType> = {
    "evt-payment-inbound": "deposit",
    "evt-savingsplan": "savings-plan",
    "evt-corporate-cash": "dividend",
    "evt-bank-incoming": "deposit",
    "evt-bank-incoming-declined-text": "deposit",
    "evt-bank-outgoing": "withdrawal",
    "evt-trading-trade-buy": "buy",
    "evt-order-buy": "buy",
    "evt-trade-invoice-buy": "buy",
    "evt-trade-invoice-sell": "sell",
    "evt-credit": "dividend",
    "evt-payment-outbound": "withdrawal",
  };

  it("classifies every row and drops only structurally cancelled ones", () => {
    const observed = Object.fromEntries(
      events.map((event) => [event.id, classifyTradeRepublicEvent(event)?.canonicalType ?? null]),
    );
    expect(observed).toEqual({
      ...expected,
      "evt-bank-incoming-canceled": null,
      "evt-order-canceled-header": null,
    });
  });

  it("agrees between sync (mapper) and category-mapping observations", () => {
    const synced = mapTradeRepublicEvents(events).map((tx) => [tx.externalId.replace("trade-republic:", ""), tx.canonicalType]);
    const observed = observeTradeRepublicEvents(events).map((row, index) => [synced[index]?.[0], row.canonicalType]);
    expect(synced).toEqual(Object.entries(expected));
    expect(observed).toEqual(synced);
  });
});

function scCash(overrides: Partial<ScTransactionSummary> = {}): ScTransactionSummary {
  return {
    id: "tx-1",
    summary_type: "BrokerCashTransactionSummary",
    currency: "EUR",
    last_event_datetime: "2026-01-01T00:00:00Z",
    description: "",
    amount: "100",
    ...overrides,
  };
}

describe("Scalable Capital cash rows", () => {
  it.each<[string | undefined, string, string, CanonicalType]>([
    // Structured cash_transaction_type wins over text.
    ["DEPOSIT", "Gesendet mit an external bank", "100", "deposit"],
    ["WITHDRAWAL", "Auszahlung", "-100", "withdrawal"],
    ["CASH_TRANSFER_IN", "Interne Überweisung", "100", "transfer"],
    ["CASH_TRANSFER_OUT", "Interne Überweisung", "-100", "transfer"],
    ["cash transfer in", "anything", "100", "transfer"],
    ["DISTRIBUTION", "", "5", "dividend"],
    ["INTEREST", "", "1", "interest"],
    ["FEE", "", "-1", "fee"],
    ["TAX", "", "-1", "tax"],
    ["TAX_RETURN", "", "1", "tax"],
    // Text fallback when the structured field is missing or unrecognised.
    [undefined, "Interne Überweisung", "100", "transfer"],
    [undefined, "Interne Überweisung", "-100", "transfer"],
    ["SOMETHING_NEW", "Interne Überweisung", "-100", "transfer"],
    [undefined, "Gesendet mit an external bank", "100", "deposit"],
    [undefined, "Gesendet mit an external bank", "-100", "withdrawal"],
    [undefined, "SEPA Überweisung", "100", "deposit"],
    [undefined, "Deposit", "50", "deposit"],
    [undefined, "Misc adjustment", "3", "unknown"],
  ])("cash_transaction_type=%s, %s (%s) → %s", (cashType, description, amount, expected) => {
    expect(
      classifyScalableSummary(scCash({ description, amount, ...(cashType ? { cash_transaction_type: cashType } : {}) }))
        ?.canonicalType,
    ).toBe(expected);
  });

  it("handles decomposed umlauts in descriptions", () => {
    expect(classifyScalableSummary(scCash({ description: "Interne Überweisung".normalize("NFD") }))?.canonicalType).toBe(
      "transfer",
    );
  });

  it("agrees between sync (mapper) and category-mapping observations", () => {
    const tx = mapScalableCapitalTransaction({
      id: "tx-1",
      date: "2026-01-01T00:00:00Z",
      type: "BrokerCashTransaction",
      description: "Interne Überweisung",
      amount: 100,
      currency: "EUR",
      cashTransactionType: "DEPOSIT",
    });
    const observed = classifyScalableSummary(
      scCash({ description: "Interne Überweisung", amount: "100", cash_transaction_type: "DEPOSIT" }),
    );
    expect(tx?.canonicalType).toBe("deposit");
    expect(observed?.canonicalType).toBe(tx?.canonicalType);
  });
});

function scSecurity(overrides: Partial<ScTransactionSummary>): ScTransactionSummary {
  return scCash({ summary_type: "BrokerSecurityTransactionSummary", description: "Example ETF", ...overrides });
}

describe("Scalable Capital security rows", () => {
  it.each<[Partial<ScTransactionSummary>, CanonicalType]>([
    [{ side: "SELL" }, "sell"],
    [{ side: "BUY" }, "buy"],
    [{ side: "BUY", description: "Sell-side text but structured BUY" }, "buy"],
    [{ side: "BUY", description: "Sparplan Example ETF" }, "savings-plan"],
    [{ side: "BUY", security_transaction_type: "SAVINGS_PLAN" }, "savings-plan"],
    [{ description: "Sell Example ETF" }, "sell"],
    [{ description: "Example ETF" }, "buy"],
  ])("%j → %s", (overrides, expected) => {
    expect(classifyScalableSummary(scSecurity(overrides))?.canonicalType).toBe(expected);
  });
});
