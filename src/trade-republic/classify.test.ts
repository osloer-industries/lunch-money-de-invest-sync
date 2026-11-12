import { describe, expect, it } from "vitest";
import type { PytrTimelineEvent } from "./types.js";
import { classifyTradeRepublicEvent, observeTradeRepublicEvents } from "../shared/broker-type-classification.js";

function event(overrides: Partial<PytrTimelineEvent> = {}): PytrTimelineEvent {
  return {
    id: "evt-1",
    timestamp: "2026-07-01T12:00:00.000Z",
    title: "Synthetic ETF",
    amount: { currency: "EUR", value: -50, fractionDigits: 2 },
    eventType: "TRADE_BUY",
    ...overrides,
  };
}

describe("classifyTradeRepublicEvent", () => {
  it("classifies saveback events", () => {
    const row = classifyTradeRepublicEvent(
      event({ eventType: "benefits_saveback_execution", amount: { currency: "EUR", value: -5 } }),
    );
    expect(row?.canonicalType).toBe("saveback");
  });

  it("classifies dividend, interest, and transfer strings", () => {
    expect(classifyTradeRepublicEvent(event({ eventType: "DIVIDEND_PAYMENT" }))?.canonicalType).toBe(
      "dividend",
    );
    expect(classifyTradeRepublicEvent(event({ eventType: "INTEREST_PAYMENT" }))?.canonicalType).toBe(
      "interest",
    );
    expect(classifyTradeRepublicEvent(event({ eventType: "INCOMING_TRANSFER" }))?.canonicalType).toBe(
      "deposit",
    );
    expect(classifyTradeRepublicEvent(event({ eventType: "OUTGOING_TRANSFER" }))?.canonicalType).toBe(
      "withdrawal",
    );
    expect(classifyTradeRepublicEvent(event({ eventType: "INTERNAL_TRANSFER" }))?.canonicalType).toBe(
      "transfer",
    );
    expect(classifyTradeRepublicEvent(event({ eventType: "TRADE_SELL" }))?.canonicalType).toBe("sell");
    expect(classifyTradeRepublicEvent(event({ eventType: "SAVINGS_PLAN_EXECUTION" }))?.canonicalType).toBe(
      "savings-plan",
    );
    expect(classifyTradeRepublicEvent(event({ eventType: "ACCOUNT_FEE" }))?.canonicalType).toBe("fee");
    expect(classifyTradeRepublicEvent(event({ eventType: "CAPITAL_GAINS_TAX" }))?.canonicalType).toBe("tax");
    expect(classifyTradeRepublicEvent(event({ eventType: "CARD_TRANSACTION" }))?.canonicalType).toBe("unknown");
  });

  it("skips zero-amount informational rows", () => {
    expect(classifyTradeRepublicEvent(event({ amount: { currency: "EUR", value: 0 } }))).toBeNull();
    expect(classifyTradeRepublicEvent(event({ deleted: true }))).toBeNull();
  });
});

describe("observeTradeRepublicEvents", () => {
  it("returns one observation per cash movement", () => {
    const rows = observeTradeRepublicEvents([
      event({ id: "a" }),
      event({ id: "b", amount: { currency: "EUR", value: 0 } }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.canonicalType).toBe("buy");
  });
});
