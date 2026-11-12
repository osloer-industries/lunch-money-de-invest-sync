import type { CanonicalType, TypeObservation } from "../shared/canonical-type.js";
import { flatMapClassified } from "../shared/flat-map-classified.js";
import { includesAny } from "../shared/includes-any.js";
import { tradeRepublicEventCalendarDate } from "./event-calendar-date.js";
import { isSavebackEventType } from "./saveback.js";
import type { PytrTimelineEvent } from "./types.js";

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
    date: tradeRepublicEventCalendarDate(event.timestamp),
  };
}

export function observeTradeRepublicEvents(events: readonly PytrTimelineEvent[]): TypeObservation[] {
  return flatMapClassified(events, classifyTradeRepublicEvent);
}
