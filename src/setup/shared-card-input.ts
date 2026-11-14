import { z } from "zod";

const last4Digits = z.string().regex(/^\d{4}$/, "shared card last-4 must be exactly 4 digits");

export function parseSharedCardLast4Input(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [];
  }
  if (trimmed.startsWith("[")) {
    const parsed: unknown = JSON.parse(trimmed);
    return z.array(last4Digits).parse(parsed);
  }
  const tokens = trimmed
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return z.array(last4Digits).parse(tokens);
}
