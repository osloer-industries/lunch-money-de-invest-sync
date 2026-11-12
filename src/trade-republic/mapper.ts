import type { CanonicalTransaction } from "../shared/transaction.js";
import type { PytrTimelineEvent } from "./types.js";

const SAVEBACK_TAG = "saveback";

const SAVEBACK_EVENT_TYPES = new Set(["benefits_saveback_execution"]);

/** TR saveback events sometimes use long PAYMENT-SERVICE-* event type strings. */
function isSavebackEventType(eventType: string | null | undefined): boolean {
  if (!eventType) {
    return false;
  }
  if (SAVEBACK_EVENT_TYPES.has(eventType)) {
    return true;
  }
  return eventType.startsWith("PAYMENT-SERVICE-IN-PAYMENT-DIRECT-");
}

export function isCashMovement(event: PytrTimelineEvent): boolean {
  if (event.deleted === true) {
    return false;
  }
  const value = event.amount?.value;
  return typeof value === "number" && value !== 0;
}

function parseUtcCalendarDate(isoTimestamp: string): string {
  const normalized = isoTimestamp.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis)) {
    throw new Error(`Trade Republic event timestamp is not parseable: ${isoTimestamp}`);
  }
  return new Date(millis).toISOString().slice(0, 10);
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
  if (!isCashMovement(event)) {
    return null;
  }
  const amount = event.amount!.value;
  const tags = isSavebackEventType(event.eventType) ? [SAVEBACK_TAG] : undefined;
  const notes = buildNotes(event);
  return {
    externalId: `trade-republic:${event.id}`,
    date: parseUtcCalendarDate(event.timestamp),
    amount,
    currency: "eur",
    payee: event.title,
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
