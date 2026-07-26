import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "./types.js";
import { isCashMovement, mapTradeRepublicEvent, mapTradeRepublicEvents } from "./mapper.js";

function event(overrides: Partial<TimelineEvent["data"]> = {}): TimelineEvent {
  return {
    type: "timelineTransaction",
    data: {
      id: "evt-1",
      timestamp: Date.UTC(2026, 6, 1),
      title: "Grocery Store",
      body: "Card payment",
      cashChangeAmount: -12.5,
      ...overrides,
    },
  };
}

describe("isCashMovement", () => {
  it("is true for a nonzero cashChangeAmount", () => {
    expect(isCashMovement(event({ cashChangeAmount: -5 }))).toBe(true);
    expect(isCashMovement(event({ cashChangeAmount: 5 }))).toBe(true);
  });

  it("is false for an informational event with no cash change", () => {
    expect(isCashMovement(event({ cashChangeAmount: 0 }))).toBe(false);
  });
});

describe("mapTradeRepublicEvent", () => {
  it("maps a cash movement to a canonical transaction", () => {
    const tx = mapTradeRepublicEvent(event());
    expect(tx).toEqual({
      externalId: "trade-republic:evt-1",
      date: "2026-07-01",
      amount: -12.5,
      currency: "eur",
      payee: "Grocery Store",
      notes: "Card payment",
      source: "trade-republic",
    });
  });

  it("returns null for an informational event", () => {
    expect(mapTradeRepublicEvent(event({ cashChangeAmount: 0 }))).toBeNull();
  });

  it("omits notes when body is empty", () => {
    const tx = mapTradeRepublicEvent(event({ body: "" }));
    expect(tx?.notes).toBeUndefined();
  });
});

describe("mapTradeRepublicEvents", () => {
  it("filters out informational events while mapping the rest", () => {
    const events = [event({ id: "a", cashChangeAmount: -1 }), event({ id: "b", cashChangeAmount: 0 })];
    const result = mapTradeRepublicEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0]?.externalId).toBe("trade-republic:a");
  });
});
