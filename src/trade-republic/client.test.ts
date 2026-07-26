import { describe, expect, it, vi } from "vitest";
import { fetchTradeRepublicTimeline } from "./client.js";
import type { TradeRepublicTransport } from "./client.js";

function fakeTransport(oneShotResult: unknown): TradeRepublicTransport {
  let connectedListener: (() => void) | undefined;
  return {
    connect: vi.fn(() => {
      // simulate the async 'connected' event firing right after connect()
      queueMicrotask(() => connectedListener?.());
    }),
    disconnect: vi.fn(),
    login: vi.fn().mockResolvedValue(undefined),
    oneShot: vi.fn().mockResolvedValue({ payload: oneShotResult }),
    once: vi.fn((_event, listener) => {
      connectedListener = listener;
    }),
  };
}

describe("fetchTradeRepublicTimeline", () => {
  it("connects, logs in, fetches the timeline, and validates the response", async () => {
    const transport = fakeTransport({
      data: [
        {
          type: "timelineTransaction",
          data: {
            id: "evt-1",
            timestamp: 1751328000000,
            title: "Grocery Store",
            body: "Card payment",
            cashChangeAmount: -12.5,
          },
        },
      ],
    });

    const events = await fetchTradeRepublicTimeline(transport, { phoneNumber: "+490000000000", pin: "0000" });

    expect(transport.login).toHaveBeenCalledWith("+490000000000", "0000");
    expect(transport.oneShot).toHaveBeenCalledWith("timeline", {});
    expect(events).toHaveLength(1);
    expect(events[0]?.data.id).toBe("evt-1");
    expect(transport.disconnect).toHaveBeenCalled();
  });

  it("disconnects even if login throws", async () => {
    const transport = fakeTransport({ data: [] });
    transport.login = vi.fn().mockRejectedValue(new Error("bad pin"));

    await expect(
      fetchTradeRepublicTimeline(transport, { phoneNumber: "+490000000000", pin: "wrong" }),
    ).rejects.toThrow("bad pin");
    expect(transport.disconnect).toHaveBeenCalled();
  });

  it("throws a clear error when the timeline response doesn't match the expected shape", async () => {
    const transport = fakeTransport({ unexpected: "shape" });
    await expect(
      fetchTradeRepublicTimeline(transport, { phoneNumber: "+490000000000", pin: "0000" }),
    ).rejects.toThrow(/didn't match the expected shape/);
  });
});
