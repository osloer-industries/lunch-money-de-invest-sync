import type { CanonicalType, TypeObservation } from "./canonical-type.js";
import { flatMapClassified } from "./flat-map-classified.js";
import { includesAny } from "./includes-any.js";
import { keywordTypeRule, matchCanonicalTypeFromRules } from "./keyword-type-rules.js";
import { utcCalendarDateFromIsoTimestamp } from "./utc-calendar-date.js";
import { tradeRepublicEventCalendarDate } from "../trade-republic/event-calendar-date.js";
import { isSavebackEventType } from "../trade-republic/saveback.js";
import type { PytrTimelineEvent } from "../trade-republic/types.js";
import type { ScTransactionSummary } from "../scalable-capital/types.js";

/**
 * Exact Trade Republic `eventType` → canonical type. Checked before the keyword fallbacks so a
 * known subtype never depends on substring order (e.g. `TRADING_SAVINGSPLAN_EXECUTED` must not
 * fall into `buy`, and `BANK_TRANSACTION_*` / `PAYMENT_*` keep their deposit vs withdrawal
 * direction). Subtypes mapped to `"trade"` / `"corporate-cash"` are disambiguated by subtitle and
 * amount sign in {@link resolveTradeRepublicSpecial}.
 */
type TrExactType = CanonicalType | "trade" | "corporate-cash";

const TR_EXACT_EVENT_TYPES: ReadonlyMap<string, TrExactType> = new Map<string, TrExactType>([
  // Cash in
  ["PAYMENT_INBOUND", "deposit"],
  ["PAYMENT_INBOUND_APPLE_PAY", "deposit"],
  ["PAYMENT_INBOUND_GOOGLE_PAY", "deposit"],
  ["PAYMENT_INBOUND_CREDIT_CARD", "deposit"],
  ["PAYMENT_INBOUND_SEPA_DIRECT_DEBIT", "deposit"],
  ["BANK_TRANSACTION_INCOMING", "deposit"],
  ["INCOMING_TRANSFER", "deposit"],
  ["INCOMING_TRANSFER_DELEGATION", "deposit"],
  ["ACCOUNT_TRANSFER_INCOMING", "deposit"],
  // Cash out
  ["PAYMENT_OUTBOUND", "withdrawal"],
  ["BANK_TRANSACTION_OUTGOING", "withdrawal"],
  ["OUTGOING_TRANSFER", "withdrawal"],
  ["OUTGOING_TRANSFER_DELEGATION", "withdrawal"],
  // Savings plans
  ["TRADING_SAVINGSPLAN_EXECUTED", "savings-plan"],
  ["SAVINGS_PLAN_EXECUTED", "savings-plan"],
  ["SAVINGS_PLAN_INVOICE_CREATED", "savings-plan"],
  // Orders (buy vs sell decided by subtitle, then amount sign)
  ["TRADING_TRADE_EXECUTED", "trade"],
  ["ORDER_EXECUTED", "trade"],
  ["TRADE_INVOICE", "trade"],
  ["TRADE_CORRECTED", "trade"],
  // Income
  ["SSP_CORPORATE_ACTION_CASH", "corporate-cash"],
  ["SSP_CORPORATE_ACTION_INVOICE_CASH", "corporate-cash"],
  ["CREDIT", "dividend"],
  ["INTEREST_PAYOUT", "interest"],
  ["INTEREST_PAYOUT_CREATED", "interest"],
  // Tax
  ["PRE_DETERMINED_TAX_BASE", "tax"],
  ["TAX_REFUND", "tax"],
  ["SSP_TAX_CORRECTION", "tax"],
  ["SSP_TAX_CORRECTION_INVOICE", "tax"],
  ["TAX_CORRECTION", "tax"],
]);

/** Substring fallbacks for subtypes not listed in {@link TR_EXACT_EVENT_TYPES}; order matters. */
const TR_EVENT_TYPE_RULES = [
  keywordTypeRule(["DIVIDEND"], "dividend"),
  keywordTypeRule(["INTEREST"], "interest"),
  keywordTypeRule(["SAVINGS_PLAN", "SAVINGSPLAN", "SPARPLAN"], "savings-plan"),
  keywordTypeRule(["BUY", "PURCHASE"], "buy"),
  keywordTypeRule(["SELL"], "sell"),
  keywordTypeRule(["DEPOSIT", "INCOMING_TRANSFER", "INBOUND", "INCOMING"], "deposit"),
  keywordTypeRule(["WITHDRAW", "OUTGOING_TRANSFER", "OUTBOUND", "OUTGOING"], "withdrawal"),
  keywordTypeRule(["TRANSFER"], "transfer"),
  keywordTypeRule(["FEE", "COMMISSION"], "fee"),
  keywordTypeRule(["TAX", "KAPITALERTRAG", "SOLI"], "tax"),
] as const;

/** Subtitle hints for order rows; sell is checked first because "Verkaufsorder" contains "kauf". */
const TR_TRADE_SUBTITLE_RULES = [
  keywordTypeRule(["sparplan", "savings plan"], "savings-plan"),
  keywordTypeRule(["verkauf", "sell"], "sell"),
  keywordTypeRule(["kauf", "buy", "round up"], "buy"),
] as const;

const TR_CANCELED_STATUSES = new Set(["canceled", "cancelled"]);

function isCanceledStatus(value: unknown): boolean {
  return typeof value === "string" && TR_CANCELED_STATUSES.has(value.trim().toLowerCase());
}

function headerSectionStatus(details: unknown): unknown {
  if (typeof details !== "object" || details === null) {
    return undefined;
  }
  const sections: unknown = Reflect.get(details, "sections");
  if (!Array.isArray(sections)) {
    return undefined;
  }
  const header: unknown = sections.find(
    (section: unknown) => typeof section === "object" && section !== null && Reflect.get(section, "type") === "header",
  );
  if (typeof header !== "object" || header === null) {
    return undefined;
  }
  const data: unknown = Reflect.get(header, "data");
  return typeof data === "object" && data !== null ? Reflect.get(data, "status") : undefined;
}

/**
 * Trade Republic marks cancelled/declined timeline rows with `status: "CANCELED"` (or the detail
 * header's `data.status`). pytr's own exporter ignores exactly these rows, so they never moved cash
 * and are not synced. Free-text subtitles (e.g. "Abgelehnt") are deliberately not used here.
 */
export function isCanceledTradeRepublicEvent(event: Pick<PytrTimelineEvent, "status" | "details">): boolean {
  return isCanceledStatus(event.status) || isCanceledStatus(headerSectionStatus(event.details));
}

function resolveTradeRepublicSpecial(
  kind: "trade" | "corporate-cash",
  subtitle: string,
  amount: number,
): CanonicalType {
  const text = subtitle.toLowerCase();
  if (kind === "trade") {
    // Canonical sign convention at this point: negative = outflow (buy), positive = inflow (sell).
    return matchCanonicalTypeFromRules(text, TR_TRADE_SUBTITLE_RULES) ?? (amount > 0 ? "sell" : "buy");
  }
  if (text.includes("dividend")) {
    return "dividend";
  }
  // Non-dividend corporate-action cash (e.g. "Vorabpauschale") or a debit is a tax booking.
  return amount > 0 && !text.includes("vorabpauschale") ? "dividend" : "tax";
}

function classifyTradeRepublicEventType(
  eventType: string | null | undefined,
  subtitle = "",
  amount = 0,
): CanonicalType {
  if (isSavebackEventType(eventType)) {
    return "saveback";
  }
  const normalized = eventType?.trim().toUpperCase() ?? "";
  const exact = TR_EXACT_EVENT_TYPES.get(normalized);
  if (exact === "trade" || exact === "corporate-cash") {
    return resolveTradeRepublicSpecial(exact, subtitle, amount);
  }
  if (exact) {
    return exact;
  }
  return matchCanonicalTypeFromRules(normalized, TR_EVENT_TYPE_RULES) ?? "unknown";
}

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

export function classifyTradeRepublicEvent(event: PytrTimelineEvent): TypeObservation | null {
  if (event.deleted === true || isCanceledTradeRepublicEvent(event)) {
    return null;
  }
  const amount = event.amount?.value;
  if (typeof amount !== "number" || amount === 0) {
    return null;
  }
  const eventType = event.eventType?.trim() || "unknown";
  const subtitle = event.subtitle?.trim();
  const canonicalType = classifyTradeRepublicEventType(eventType, subtitle, amount);
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

/**
 * Structured `cash_transaction_type` from the Scalable CLI (`cashTransactionType` in the backend
 * summary). Values follow the CLI's `--type-filter` vocabulary; unknown values fall back to text.
 */
const SC_CASH_TRANSACTION_TYPES: ReadonlyMap<string, CanonicalType> = new Map<string, CanonicalType>([
  ["DEPOSIT", "deposit"],
  ["WITHDRAWAL", "withdrawal"],
  ["CASH_TRANSFER_IN", "transfer"],
  ["CASH_TRANSFER_OUT", "transfer"],
  ["TRANSFER_IN", "transfer"],
  ["TRANSFER_OUT", "transfer"],
  ["DISTRIBUTION", "dividend"],
  ["REINVESTMENT_DISTRIBUTION", "dividend"],
  ["INTEREST", "interest"],
  ["FEE", "fee"],
  ["TAX", "tax"],
  ["TAX_RETURN", "tax"],
]);

/** Movement between the operator's own Scalable cash and portfolio — never a deposit/withdrawal. */
const SC_INTERNAL_TRANSFER_NEEDLES = ["interne überweisung", "internal transfer", "interner übertrag"] as const;

const SC_CASH_KEYWORDS = [
  keywordTypeRule(["dividend", "ausschüttung", "distribution"], "dividend"),
  keywordTypeRule(["interest", "zins"], "interest"),
  keywordTypeRule(["deposit", "einzahl"], "deposit"),
  keywordTypeRule(["withdraw", "auszahl"], "withdrawal"),
  keywordTypeRule(["transfer"], "transfer"),
  keywordTypeRule(["fee", "gebühr", "commission"], "fee"),
  keywordTypeRule(["tax", "steuer", "soli"], "tax"),
] as const;

/** Bank transfers whose text does not say the direction (e.g. "Gesendet mit <bank>"); sign decides. */
const SC_BANK_TRANSFER_NEEDLES = ["überweisung", "gesendet", "bank transfer", "sepa"] as const;

function normalizeScEnum(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replaceAll(/[\s-]+/g, "_");
}

function classifyScalableSecurity(text: string, item: ScTransactionSummary): CanonicalType {
  if (normalizeScEnum(item.security_transaction_type) === "SAVINGS_PLAN") {
    return "savings-plan";
  }
  const side = normalizeScEnum(item.side);
  // Structured side wins; text is only consulted for "sell" when the side is missing.
  if (side === "SELL" || (side !== "BUY" && text.includes("sell"))) {
    return "sell";
  }
  return includesAny(text, ["savings", "sparplan"]) ? "savings-plan" : "buy";
}

function classifyScalableCash(text: string, item: ScTransactionSummary, amount: number): CanonicalType {
  const structured = SC_CASH_TRANSACTION_TYPES.get(normalizeScEnum(item.cash_transaction_type));
  if (structured) {
    return structured;
  }
  if (includesAny(text, SC_INTERNAL_TRANSFER_NEEDLES)) {
    return "transfer";
  }
  const keyword = matchCanonicalTypeFromRules(text, SC_CASH_KEYWORDS);
  if (keyword) {
    return keyword;
  }
  if (includesAny(text, SC_BANK_TRANSFER_NEEDLES)) {
    // Canonical sign convention: positive = money entering the broker account.
    return amount > 0 ? "deposit" : "withdrawal";
  }
  return "unknown";
}

function classifyScalableItem(
  description: string,
  summaryType: string,
  item: ScTransactionSummary,
  amount: number,
): CanonicalType {
  const text = description.normalize("NFC").toLowerCase();
  if (summaryType === "BrokerSecurityTransactionSummary") {
    return classifyScalableSecurity(text, item);
  }
  return classifyScalableCash(text, item, amount);
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
  const canonicalType = classifyScalableItem(description, summaryType, item, amount);
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
