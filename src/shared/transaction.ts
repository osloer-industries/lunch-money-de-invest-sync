import type { Currency } from "@lunch-money/lunch-money-js-v2";

/** Canonical shape every broker mapper normalizes into before it reaches Lunch Money. */
export interface CanonicalTransaction {
  /** Stable id from the source broker; used as Lunch Money's external_id for dedup. */
  externalId: string;
  /** ISO 8601 date, e.g. "2026-07-01". */
  date: string;
  /** Signed amount in the account's currency major unit (negative = outflow). */
  amount: number;
  currency: Currency;
  payee: string;
  notes?: string;
  tags?: string[];
  source: BrokerSource;
}

export type BrokerSource = "trade-republic" | "scalable-capital";

/** One person's brokerage account, mapped to a Lunch Money manual asset. */
export interface SyncTarget {
  owner: string;
  lunchMoneyAssetId: number;
}

/**
 * Structurally validates a broker's currency code before it's trusted as a Lunch Money
 * `Currency` literal (a 150+ member union we don't want to duplicate here). Actual
 * membership is still enforced by the Lunch Money API at insert time.
 */
export function toCurrency(code: string): Currency {
  const lower = code.toLowerCase();
  if (!/^[a-z]{3}$/.test(lower)) {
    throw new Error(`Not a valid 3-letter currency code: "${code}"`);
  }
  return lower as Currency;
}
