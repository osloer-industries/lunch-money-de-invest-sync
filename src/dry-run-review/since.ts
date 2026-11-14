import type { CanonicalTransaction } from "../shared/transaction.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses and validates an inclusive sync start date (UTC calendar day). */
export function parseSinceDate(raw: string): string {
  const trimmed = raw.trim();
  if (!ISO_DATE.test(trimmed)) {
    throw new Error(`--since must be YYYY-MM-DD, got "${raw}"`);
  }
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`--since is not a valid date: "${raw}"`);
  }
  return trimmed;
}

export function filterTransactionsSince(
  transactions: readonly CanonicalTransaction[],
  since: string,
): CanonicalTransaction[] {
  const start = parseSinceDate(since);
  return transactions.filter((tx) => tx.date >= start);
}

/** Whole days from `since` through `today` (inclusive), for pytr `--last_days`. */
export function computePytrLastDays(since: string, today: string): number {
  const startMs = Date.parse(`${parseSinceDate(since)}T00:00:00.000Z`);
  const todayMs = Date.parse(`${parseSinceDate(today)}T00:00:00.000Z`);
  if (todayMs < startMs) {
    return 1;
  }
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.floor((todayMs - startMs) / dayMs) + 1);
}