import { describe, expect, it, vi } from "vitest";

const fetchTradeRepublicTimeline = vi.hoisted(() => vi.fn());
const createDefaultPytrCliRunner = vi.hoisted(() => vi.fn());
const fetchAllScalableTransactionSummaries = vi.hoisted(() => vi.fn());
const createDefaultScCliRunner = vi.hoisted(() => vi.fn());

vi.mock("../trade-republic/client.js", () => ({
  fetchTradeRepublicTimeline,
  createDefaultPytrCliRunner,
}));

vi.mock("../scalable-capital/client.js", () => ({
  fetchAllScalableTransactionSummaries,
  createDefaultScCliRunner,
}));

import { collectTypeObservations } from "./collect-type-observations.js";

describe("collectTypeObservations", () => {
  it("merges observations from configured brokers", async () => {
    fetchTradeRepublicTimeline.mockResolvedValue([
      {
        id: "evt-1",
        timestamp: "2026-01-01T00:00:00Z",
        title: "Buy",
        amount: { currency: "EUR", value: -10 },
        eventType: "TRADE_BUY",
      },
    ]);
    fetchAllScalableTransactionSummaries.mockResolvedValue([
      {
        id: "tx-1",
        summary_type: "BrokerCashTransactionSummary",
        description: "Deposit",
        amount: "20",
        currency: "EUR",
        last_event_datetime: "2026-01-02T00:00:00Z",
      },
    ]);
    const rows = await collectTypeObservations({
      lunchMoneyApiKey: "k",
      sharedCardLast4: [],
      tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }],
      scalableCapitalProfiles: [{ owner: "operator-b", lunchMoneyAssetId: 2 }],
      categoryMap: {},
      tagMap: {},
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.canonicalType).toSorted()).toEqual(["buy", "deposit"]);
  });
});
