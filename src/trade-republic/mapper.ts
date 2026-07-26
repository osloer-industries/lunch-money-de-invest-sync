import type { CanonicalTransaction } from "../shared/transaction.js";
import type { TimelineEvent } from "./types.js";

/**
 * Trade Republic's timeline mixes real cash movements (card spend, transfers, interest,
 * savings-plan executions, ...) with purely informational events (document uploads, price
 * alerts, ...). There's no documented `type` enum to filter on, so we use the one signal
 * that reliably distinguishes them: a nonzero `cashChangeAmount`.
 */
export function isCashMovement(event: TimelineEvent): boolean {
  return event.data.cashChangeAmount !== 0;
}

export function mapTradeRepublicEvent(event: TimelineEvent): CanonicalTransaction | null {
  if (!isCashMovement(event)) {
    return null;
  }
  return {
    externalId: `trade-republic:${event.data.id}`,
    date: new Date(event.data.timestamp).toISOString().slice(0, 10),
    amount: event.data.cashChangeAmount,
    currency: "eur",
    payee: event.data.title,
    ...(event.data.body ? { notes: event.data.body } : {}),
    source: "trade-republic",
  };
}

export function mapTradeRepublicEvents(events: readonly TimelineEvent[]): CanonicalTransaction[] {
  return events
    .map(mapTradeRepublicEvent)
    .filter((tx): tx is CanonicalTransaction => tx !== null);
}
