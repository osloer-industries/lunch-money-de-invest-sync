import type { CanonicalType, TypeObservation } from "./canonical-type.js";
import { flatMapClassified } from "./flat-map-classified.js";
import { matchCanonicalTypeFromRules, type KeywordTypeRule } from "./keyword-type-rules.js";
import { utcCalendarDateFromIsoTimestamp } from "./utc-calendar-date.js";
import { tradeRepublicEventCalendarDate } from "../trade-republic/event-calendar-date.js";
import { isSavebackEventType } from "../trade-republic/saveback.js";
import type { PytrTimelineEvent } from "../trade-republic/types.js";
import type { ScTransactionSummary } from "../scalable-capital/types.js";

const TR_EVENT_TYPE_RULES: readonly KeywordTypeRule[] = [
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

function typeObservation(row: {
  canonicalType: CanonicalType;
  brokerSubtype: string;
  source: TypeObservation["source"];
  amount: number;
  currency: string;
  payee: string;
  date: string;
  notes?: string;
}): TypeObservation {
  const { notes, ...rest } = row;
  return notes ? { ...rest, notes } : rest;
}

const SC_CASH_KEYWORDS: readonly KeywordTypeRule[] = [
  { needles: ["dividend"], type: "dividend" },
  { needles: ["interest", "zins"], type: "interest" },
  { needles: ["deposit", "einzahl"], type: "deposit" },
  { needles: ["withdraw", "auszahl"], type: "withdrawal" },
  { needles: ["transfer"], type: "transfer" },
  { needles: ["fee", "gebühr", "commission"], type: "fee" },
  { needles: ["tax", "steuer", "soli"], type: "tax" },
];

function classifyTradeRepublicEventType(eventType: string | null | undefined): CanonicalType {
  if (isSavebackEventType(eventType)) {
    return "saveback";
  }
  const normalized = eventType?.trim().toUpperCase() ?? "";
  return matchCanonicalTypeFromRules(normalized, TR_EVENT_TYPE_RULES) ?? "unknown";
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
  const canonicalType = classifyTradeRepublicEventType(eventType);
  const subtitle = event.subtitle?.trim();
  return typeObservation({
    canonicalType,
    brokerSubtype: eventType,
    source: "trade-republic",
    amount,
    currency: event.amount?.currency?.toLowerCase() ?? "eur",
    payee: event.title,
    date: tradeRepublicEventCalendarDate(event.timestamp),
    ...(subtitle && canonicalType !== "saveback" ? { notes: subtitle } : {}),
  });
}

export function observeTradeRepublicEvents(events: readonly PytrTimelineEvent[]): TypeObservation[] {
  return flatMapClassified(events, classifyTradeRepublicEvent);
}

function classifyScalableDescription(description: string, summaryType: string): CanonicalType {
  const text = description.toLowerCase();
  if (summaryType === "BrokerSecurityTransactionSummary") {
    if (text.includes("sell")) {
      return "sell";
    }
    const savings = matchCanonicalTypeFromRules(text, [{ needles: ["savings", "sparplan"], type: "savings-plan" }]);
    if (savings) {
      return savings;
    }
    return "buy";
  }
  return matchCanonicalTypeFromRules(text, SC_CASH_KEYWORDS) ?? "unknown";
}

function parseScalableAmount(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function classifyScalableSummary(item: ScTransactionSummary): TypeObservation | null {
  if (item.is_cancellation === true) {
    return null;
  }
  if (!item.last_event_datetime) {
    return null;
  }
  const summaryType = item.summary_type?.trim() || "unknown";
  const description = item.description?.trim() || summaryType;
  const amount = parseScalableAmount(item.amount);
  if (amount === null || amount === 0) {
    return null;
  }
  const canonicalType = classifyScalableDescription(description, summaryType);
  return typeObservation({
    canonicalType,
    brokerSubtype: summaryType,
    source: "scalable-capital",
    amount,
    currency: (item.currency?.trim() || "EUR").toLowerCase(),
    payee: description || "Scalable Capital",
    date: utcCalendarDateFromIsoTimestamp(item.last_event_datetime, "Scalable Capital event"),
  });
}

export function observeScalableSummaries(items: readonly ScTransactionSummary[]): TypeObservation[] {
  return flatMapClassified(items, classifyScalableSummary);
}
