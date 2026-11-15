/**
 * Parses a broker-reported decimal that may be a JSON number, a plain string (`1234.56`) or a
 * localized string (`1.234,56`, `1,234.56`, `12,5`). When both separators appear, the last one is
 * the decimal separator; a single kind of separator repeated more than once is a thousands
 * separator; otherwise it is the decimal separator. Returns null when the value is not numeric.
 */
export function parseBrokerDecimal(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const compact = value.replaceAll(/[\s']/g, "");
  if (!/^[+-]?[\d.,]+$/.test(compact) || !/\d/.test(compact)) {
    return null;
  }
  const parsed = Number(normalizeSeparators(compact));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSeparators(text: string): string {
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  if (lastDot !== -1 && lastComma !== -1) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    return text.replaceAll(thousands, "").replace(decimal, ".");
  }
  const separator = lastDot === -1 ? "," : ".";
  const count = text.split(separator).length - 1;
  if (count > 1) {
    return text.replaceAll(separator, "");
  }
  return separator === "," ? text.replace(",", ".") : text;
}

/** Formats a balance for operator-facing log lines, e.g. `1,234.56 EUR`. */
export function formatMoney(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${formatted} ${currency.toUpperCase()}`;
}
