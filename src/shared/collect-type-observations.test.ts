import { describe, expect, it, vi } from "vitest";

const fetchTradeRepublicEventsForProfile = vi.hoisted(() => vi.fn());
const fetchScalableSummariesForProfile = vi.hoisted(() => vi.fn());

vi.mock("./broker-profile-transport.js", () => ({
  fetchTradeRepublicEventsForProfile,
  fetchScalableSummariesForProfile,
}));

import { collectTypeObservations } from "./collect-type-observations.js";

describe("collectTypeObservations", () => {
  it("merges observations from configured brokers", async () => {
    fetchTradeRepublicEventsForProfile.mockResolvedValue([
      {
        id: "evt-1",
        timestamp: "2026-01-01T00:00:00Z",
        title: "Buy",
        amount: { currency: "EUR", value: -10 },
        eventType: "TRADE_BUY",
      },
    ]);
    fetchScalableSummariesForProfile.mockResolvedValue([
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
