import { describe, expect, it, vi } from "vitest";

const fetchTradeRepublicTimeline = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const createDefaultPytrCliRunner = vi.hoisted(() => vi.fn(() => ({})));

vi.mock("../trade-republic/client.js", () => ({
  fetchTradeRepublicTimeline,
  createDefaultPytrCliRunner,
}));

import { fetchTradeRepublicEventsForProfile } from "./broker-profile-transport.js";

describe("fetchTradeRepublicEventsForProfile", () => {
  it("forwards loginEvents into the fetch context", async () => {
    const loginEvents = vi.fn();
    await fetchTradeRepublicEventsForProfile({ owner: "operator-a", lunchMoneyAssetId: 1 }, { loginEvents });
    expect(fetchTradeRepublicTimeline).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      { loginEvents },
    );
  });
});