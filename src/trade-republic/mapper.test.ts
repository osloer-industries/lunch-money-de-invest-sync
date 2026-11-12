import { describe, expect, it } from "vitest";
import type { PytrTimelineEvent } from "./types.js";
import { isCashMovement, mapTradeRepublicEvent, mapTradeRepublicEvents } from "./mapper.js";

function event(overrides: Partial<PytrTimelineEvent> = {}): PytrTimelineEvent {
  return {
    id: "evt-1",
    timestamp: "2026-07-01T12:00:00.000+0000",
    title: "Grocery Store",
    subtitle: "Card payment",
    amount: {
      currency: "EUR",
      value: -12.5,
      fractionDigits: 2,
    },
    eventType: "CARD_TRANSACTION",
    ...overrides,
  };
}

describe("isCashMovement", () => {
  it("is true for a nonzero amount", () => {
    expect(isCashMovement(event({ amount: { currency: "EUR", value: -5 } }))).toBe(true);
    expect(isCashMovement(event({ amount: { currency: "EUR", value: 5 } }))).toBe(true);
  });

  it("is false for informational events and deleted rows", () => {
    expect(isCashMovement(event({ amount: { currency: "EUR", value: 0 } }))).toBe(false);
    expect(isCashMovement(event({ amount: undefined, eventType: "ADDRESS_CHANGED" }))).toBe(false);
    expect(isCashMovement(event({ deleted: true, amount: { currency: "EUR", value: -1 } }))).toBe(false);
  });
});

describe("mapTradeRepublicEvent", () => {
  it("maps a cash movement to a canonical transaction with a UTC calendar date", () => {
    const tx = mapTradeRepublicEvent(event());
    expect(tx).toEqual({
      externalId: "trade-republic:evt-1",
      date: "2026-07-01",
      amount: -12.5,
      currency: "eur",
      payee: "Grocery Store",
      canonicalType: "unknown",
      notes: "Card payment — CARD_TRANSACTION",
      source: "trade-republic",
    });
  });

  it("tags PAYMENT-SERVICE saveback variants", () => {
    const tx = mapTradeRepublicEvent(
      event({
        eventType: "PAYMENT-SERVICE-IN-PAYMENT-DIRECT-SAVINGS",
        amount: { currency: "EUR", value: -3 },
      }),
    );
    expect(tx?.tags).toEqual(["saveback"]);
  });

  it("tags saveback as a single row", () => {
    const tx = mapTradeRepublicEvent(
      event({
        id: "saveback-1",
        title: "Example ETF",
        subtitle: "Saveback",
        eventType: "benefits_saveback_execution",
        amount: { currency: "EUR", value: -15 },
      }),
    );
    expect(tx).toMatchObject({
      externalId: "trade-republic:saveback-1",
      amount: -15,
      tags: ["saveback"],
    });
  });

  it("throws when timestamp cannot be parsed", () => {
    expect(() => mapTradeRepublicEvent(event({ timestamp: "not-a-date" }))).toThrow(/timestamp/);
  });

  it("omits notes when subtitle and event type are absent", () => {
    const tx = mapTradeRepublicEvent(
      event({ subtitle: "", eventType: undefined, amount: { currency: "EUR", value: -1 } }),
    );
    expect(tx?.notes).toBeUndefined();
  });

  it("returns null for an informational event", () => {
    expect(mapTradeRepublicEvent(event({ amount: { currency: "EUR", value: 0 } }))).toBeNull();
  });
});

describe("mapTradeRepublicEvents", () => {
  it("filters out informational events while mapping the rest", () => {
    const events = [
      event({ id: "a", amount: { currency: "EUR", value: -1 } }),
      event({ id: "b", amount: { currency: "EUR", value: 0 } }),
    ];
    const result = mapTradeRepublicEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0]?.externalId).toBe("trade-republic:a");
  });
});
