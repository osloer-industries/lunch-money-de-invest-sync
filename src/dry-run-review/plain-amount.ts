import type { Currency } from "@lunch-money/lunch-money-js-v2";

const CURRENCY_SYMBOLS: Partial<Record<Currency, string>> = {
  eur: "€",
  usd: "$",
  gbp: "£",
};

function formatMoneyMajorUnits(absAmount: number, currency: Currency): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  const formatted = absAmount.toFixed(2);
  if (symbol) {
    return `${symbol}${formatted}`;
  }
  return `${formatted} ${currency.toUpperCase()}`;
}

/**
 * Describes a canonical signed amount in plain language (negative = out, positive = in).
 * Uses the transaction currency, not Lunch Money v2 signs.
 */
export function formatPlainCanonicalAmount(amount: number, currency: Currency): string {
  const label = formatMoneyMajorUnits(Math.abs(amount), currency);
  if (amount < 0) {
    return `${label} out`;
  }
  if (amount > 0) {
    return `${label} in`;
  }
  return label;
}