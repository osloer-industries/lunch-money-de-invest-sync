import type { CanonicalTransaction } from "../shared/transaction.js";
import type { PytrTimelineEvent } from "./types.js";
import { classifyTradeRepublicEvent } from "./classify.js";
import { tradeRepublicEventCalendarDate } from "./event-calendar-date.js";
import { isSavebackEventType } from "./saveback.js";

const SAVEBACK_TAG = "saveback";

export function isCashMovement(event: PytrTimelineEvent): boolean {
  if (event.deleted === true) {
    return false;
  }
  const value = event.amount?.value;
  return typeof value === "number" && value !== 0;
}

function buildNotes(event: PytrTimelineEvent): string | undefined {
  const parts: string[] = [];
  const subtitle = event.subtitle?.trim();
  if (subtitle) {
    parts.push(subtitle);
  }
  const eventType = event.eventType?.trim();
  if (eventType && !isSavebackEventType(eventType)) {
    parts.push(eventType);
  }
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join(" — ");
}

export function mapTradeRepublicEvent(event: PytrTimelineEvent): CanonicalTransaction | null {
  const observed = classifyTradeRepublicEvent(event);
  if (!observed || !isCashMovement(event)) {
    return null;
  }
  const tags = isSavebackEventType(event.eventType) ? [SAVEBACK_TAG] : undefined;
  const notes = buildNotes(event);
  return {
    externalId: `trade-republic:${event.id}`,
    date: tradeRepublicEventCalendarDate(event.timestamp),
    amount: observed.amount,
    currency: "eur",
    payee: event.title,
    canonicalType: observed.canonicalType,
    ...(notes ? { notes } : {}),
    ...(tags ? { tags } : {}),
    source: "trade-republic",
  };
}

export function mapTradeRepublicEvents(events: readonly PytrTimelineEvent[]): CanonicalTransaction[] {
  return events
    .map(mapTradeRepublicEvent)
    .filter((tx): tx is CanonicalTransaction => tx !== null);
}
