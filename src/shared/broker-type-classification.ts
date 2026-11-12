import type { CanonicalType, TypeObservation } from "./canonical-type.js";
import { flatMapClassified } from "./flat-map-classified.js";
import { keywordTypeRule, matchCanonicalTypeFromRules } from "./keyword-type-rules.js";
import { utcCalendarDateFromIsoTimestamp } from "./utc-calendar-date.js";
import { tradeRepublicEventCalendarDate } from "../trade-republic/event-calendar-date.js";
import { isSavebackEventType } from "../trade-republic/saveback.js";
import type { PytrTimelineEvent } from "../trade-republic/types.js";
import type { ScTransactionSummary } from "../scalable-capital/types.js";

const TR_EVENT_TYPE_RULES = [
  keywordTypeRule(["DIVIDEND"], "dividend"),
  keywordTypeRule(["INTEREST"], "interest"),
  keywordTypeRule(["SAVINGS_PLAN", "SPARPLAN"], "savings-plan"),
  keywordTypeRule(["BUY", "PURCHASE"], "buy"),
  keywordTypeRule(["SELL"], "sell"),
  keywordTypeRule(["DEPOSIT", "INCOMING_TRANSFER"], "deposit"),
  keywordTypeRule(["WITHDRAW", "OUTGOING_TRANSFER"], "withdrawal"),
  keywordTypeRule(["TRANSFER"], "transfer"),
  keywordTypeRule(["FEE", "COMMISSION"], "fee"),
  keywordTypeRule(["TAX", "KAPITALERTRAG", "SOLI"], "tax"),
] as const;

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

const SC_CASH_KEYWORDS = [
  keywordTypeRule(["dividend"], "dividend"),
  keywordTypeRule(["interest", "zins"], "interest"),
  keywordTypeRule(["deposit", "einzahl"], "deposit"),
  keywordTypeRule(["withdraw", "auszahl"], "withdrawal"),
  keywordTypeRule(["transfer"], "transfer"),
  keywordTypeRule(["fee", "gebühr", "commission"], "fee"),
  keywordTypeRule(["tax", "steuer", "soli"], "tax"),
] as const;

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
    const savings = matchCanonicalTypeFromRules(text, [keywordTypeRule(["savings", "sparplan"], "savings-plan")]);
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
