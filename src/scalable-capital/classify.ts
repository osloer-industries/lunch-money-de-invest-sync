import type { CanonicalType, TypeObservation } from "../shared/canonical-type.js";
import { includesAny } from "../shared/includes-any.js";
import { utcCalendarDateFromIsoTimestamp } from "../shared/utc-calendar-date.js";
import type { ScTransactionSummary } from "./types.js";

const CASH_KEYWORDS: ReadonlyArray<{ readonly needles: readonly string[]; readonly type: CanonicalType }> = [
  { needles: ["dividend"], type: "dividend" },
  { needles: ["interest", "zins"], type: "interest" },
  { needles: ["deposit", "einzahl"], type: "deposit" },
  { needles: ["withdraw", "auszahl"], type: "withdrawal" },
  { needles: ["transfer"], type: "transfer" },
  { needles: ["fee", "gebühr", "commission"], type: "fee" },
  { needles: ["tax", "steuer", "soli"], type: "tax" },
];

function classifyDescription(description: string, summaryType: string): CanonicalType {
  const text = description.toLowerCase();
  if (summaryType === "BrokerSecurityTransactionSummary") {
    if (text.includes("sell")) {
      return "sell";
    }
    if (includesAny(text, ["savings", "sparplan"])) {
      return "savings-plan";
    }
    return "buy";
  }
  for (const rule of CASH_KEYWORDS) {
    if (includesAny(text, rule.needles)) {
      return rule.type;
    }
  }
  return "unknown";
}

function parseAmount(value: string | number | null | undefined): number | null {
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
  const amount = parseAmount(item.amount);
  if (amount === null || amount === 0) {
    return null;
  }
  const canonicalType = classifyDescription(description, summaryType);
  return {
    canonicalType,
    brokerSubtype: summaryType,
    source: "scalable-capital",
    amount,
    currency: (item.currency?.trim() || "EUR").toLowerCase(),
    payee: description || "Scalable Capital",
    date: utcCalendarDateFromIsoTimestamp(item.last_event_datetime, "Scalable Capital event"),
  };
}

export function observeScalableSummaries(items: readonly ScTransactionSummary[]): TypeObservation[] {
  return items.flatMap((item) => {
    const row = classifyScalableSummary(item);
    return row ? [row] : [];
  });
}
