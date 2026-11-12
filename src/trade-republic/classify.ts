import type { CanonicalType, TypeObservation } from "../shared/canonical-type.js";
import {
  normalizeIsoOffsetWithoutColon,
  utcCalendarDateFromIsoTimestamp,
} from "../shared/utc-calendar-date.js";
import type { PytrTimelineEvent } from "./types.js";

const SAVEBACK_EVENT_TYPES = new Set(["benefits_saveback_execution"]);

function isSavebackEventType(eventType: string | null | undefined): boolean {
  if (!eventType) {
    return false;
  }
  if (SAVEBACK_EVENT_TYPES.has(eventType)) {
    return true;
  }
  return eventType.startsWith("PAYMENT-SERVICE-IN-PAYMENT-DIRECT-");
}

const EVENT_TYPE_RULES: ReadonlyArray<{ readonly needles: readonly string[]; readonly type: CanonicalType }> = [
  { needles: ["DIVIDEND"], type: "dividend" },
  { needles: ["INTEREST"], type: "interest" },
  { needles: ["SAVINGS_PLAN", "SPARPLAN"], type: "savings-plan" },
  { needles: ["BUY", "PURCHASE"], type: "buy" },
  { needles: ["SELL"], type: "sell" },
  { needles: ["DEPOSIT", "INCOMING_TRANSFER"], type: "deposit" },
  { needles: ["WITHDRAW", "OUTGOING_TRANSFER"], type: "withdrawal" },
  { needles: ["TRANSFER"], type: "transfer" },
  { needles: ["FEE", "COMMISSION"], type: "fee" },
  { needles: ["TAX", "KAPITALERTRAG", "SOLI"], type: "tax" },
];

function includesAny(text: string, needles: readonly string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function classifyEventType(eventType: string | null | undefined): CanonicalType {
  if (isSavebackEventType(eventType)) {
    return "saveback";
  }
  const normalized = eventType?.trim().toUpperCase() ?? "";
  for (const rule of EVENT_TYPE_RULES) {
    if (includesAny(normalized, rule.needles)) {
      return rule.type;
    }
  }
  return "unknown";
}

function observationDate(timestamp: string): string {
  return utcCalendarDateFromIsoTimestamp(
    normalizeIsoOffsetWithoutColon(timestamp),
    "Trade Republic event",
  );
}

export function classifyTradeRepublicEvent(event: PytrTimelineEvent): TypeObservation | null {
  if (event.deleted === true) {
    return null;
  }
  const amount = event.amount?.value;
  if (typeof amount !== "number" || amount === 0) {
    return null;
  }
  const eventType = event.eventType?.trim() || "unknown";
  const canonicalType = classifyEventType(eventType);
  const subtitle = event.subtitle?.trim();
  return {
    canonicalType,
    brokerSubtype: eventType,
    source: "trade-republic",
    amount,
    currency: event.amount?.currency?.toLowerCase() ?? "eur",
    payee: event.title,
    ...(subtitle && canonicalType !== "saveback" ? { notes: subtitle } : {}),
    date: observationDate(event.timestamp),
  };
}

export function observeTradeRepublicEvents(events: readonly PytrTimelineEvent[]): TypeObservation[] {
  return events.flatMap((event) => {
    const row = classifyTradeRepublicEvent(event);
    return row ? [row] : [];
  });
}
