import { z } from "zod";

export function parseSharedCardLast4Input(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [];
  }
  if (trimmed.startsWith("[")) {
    const parsed: unknown = JSON.parse(trimmed);
    return z.array(z.string().length(4)).parse(parsed);
  }
  const tokens = trimmed
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return z.array(z.string().length(4)).parse(tokens);
}
