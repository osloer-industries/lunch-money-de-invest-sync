import { TradeRepublicApi } from "trade-republic-api";
import { timelineResponseSchema, type TimelineEvent, type TradeRepublicCredentials } from "./types.js";

/**
 * Narrow slice of `trade-republic-api`'s `TradeRepublicApi` that the sync needs, so tests
 * can pass a fake instead of opening a real WebSocket connection.
 *
 * Note: `login()` on the real implementation blocks on a CLI prompt for the SMS 2FA code
 * sent to your phone — this only works for an interactive run. See README for why
 * unattended/cron sync needs a device-pairing flow (e.g. pytr's) instead.
 */
export interface TradeRepublicTransport {
  connect(): void;
  disconnect(): void;
  login(phoneNumber: string, pin: string): Promise<void>;
  oneShot<T>(type: string, payload: unknown): Promise<{ payload: T }>;
  once(event: "connected", listener: () => void): void;
}

export function createTradeRepublicTransport(): TradeRepublicTransport {
  return new TradeRepublicApi();
}

function waitForConnection(transport: TradeRepublicTransport): Promise<void> {
  return new Promise((resolve) => {
    transport.once("connected", resolve);
    transport.connect();
  });
}

export async function fetchTradeRepublicTimeline(
  transport: TradeRepublicTransport,
  credentials: TradeRepublicCredentials,
): Promise<TimelineEvent[]> {
  try {
    await waitForConnection(transport);
    await transport.login(credentials.phoneNumber, credentials.pin);
    const message = await transport.oneShot<unknown>("timeline", {});
    const parsed = timelineResponseSchema.safeParse(message.payload);
    if (!parsed.success) {
      throw new Error(
        `Trade Republic timeline response didn't match the expected shape: ${parsed.error.message}`,
      );
    }
    return parsed.data.data;
  } finally {
    transport.disconnect();
  }
}
