const ISIN_PATTERN = /\b[A-Z]{2}[A-Z0-9]{10}\b/g;
const IBAN_PATTERN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

export function bucketAmount(amount: number): string {
  let sign: string;
  if (amount < 0) {
    sign = "outflow";
  } else if (amount > 0) {
    sign = "inflow";
  } else {
    sign = "zero";
  }
  const magnitude = Math.abs(amount);
  if (magnitude < 10) {
    return `${sign}-under-10`;
  }
  if (magnitude < 100) {
    return `${sign}-10-to-99`;
  }
  if (magnitude < 1000) {
    return `${sign}-100-to-999`;
  }
  return `${sign}-1000-plus`;
}

function isEmailToken(token: string): boolean {
  if (token.length === 0) {
    return false;
  }
  let at = -1;
  for (let index = 0; index < token.length; index += 1) {
    const char = token[index];
    if (char === undefined) {
      return false;
    }
    if (char === "@") {
      if (at >= 0) {
        return false;
      }
      at = index;
      continue;
    }
    if (char <= " " || char === "\u007f") {
      return false;
    }
  }
  if (at <= 0) {
    return false;
  }
  const domain = token.slice(at + 1);
  const dot = domain.indexOf(".");
  return dot > 0 && dot < domain.length - 1;
}

function hasExplicitUtcOffset(dateText: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(dateText.trimEnd());
}

/** YYYY-MM for anonymised exports; calendar month is derived in UTC, not the host timezone. */
export function monthOnlyDate(isoDate: string): string {
  if (isoDate.length >= 7 && /^\d{4}-\d{2}/.test(isoDate)) {
    return isoDate.slice(0, 7);
  }
  const parsed = Date.parse(isoDate);
  if (!Number.isFinite(parsed)) {
    return "unknown-month";
  }
  const instant = new Date(parsed);
  if (hasExplicitUtcOffset(isoDate)) {
    return instant.toISOString().slice(0, 7);
  }
  const utcMillis = Date.UTC(instant.getFullYear(), instant.getMonth(), instant.getDate());
  return new Date(utcMillis).toISOString().slice(0, 7);
}

export function redactSensitiveText(text: string): string {
  return text
    .replace(ISIN_PATTERN, "[isin]")
    .replace(IBAN_PATTERN, "[iban]")
    .replace(UUID_PATTERN, "[id]")
    .replace(/\b\d{10,}\b/g, "[id]")
    .split(/(\s+)/)
    .map((part) => (isEmailToken(part) ? "[email]" : part))
    .join("");
}

export interface AnonymizedTypeExample {
  readonly canonicalType: string;
  readonly brokerSubtype: string;
  readonly source: string;
  readonly amountBucket: string;
  readonly currency: string;
  readonly payee: string;
  readonly notes?: string;
  readonly month: string;
}

export function anonymizeTypeExample(input: {
  canonicalType: string;
  brokerSubtype: string;
  source: string;
  amount: number;
  currency: string;
  payee: string;
  notes?: string;
  date: string;
}): AnonymizedTypeExample {
  return {
    canonicalType: input.canonicalType,
    brokerSubtype: redactSensitiveText(input.brokerSubtype),
    source: input.source,
    amountBucket: bucketAmount(input.amount),
    currency: input.currency.toLowerCase(),
    payee: "[counterparty]",
    ...(input.notes ? { notes: redactSensitiveText(input.notes) } : {}),
    month: monthOnlyDate(input.date),
  };
}
