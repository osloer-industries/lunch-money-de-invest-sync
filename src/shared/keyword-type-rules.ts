import type { CanonicalType } from "./canonical-type.js";
import { includesAny } from "./includes-any.js";

export type KeywordTypeRule = { readonly needles: readonly string[]; readonly type: CanonicalType };

export function keywordTypeRule(needles: readonly string[], type: CanonicalType): KeywordTypeRule {
  return { needles, type };
}

export function matchCanonicalTypeFromRules(
  text: string,
  rules: readonly KeywordTypeRule[],
  normalize: (value: string) => string = (value) => value,
): CanonicalType | null {
  const normalized = normalize(text);
  for (const rule of rules) {
    if (includesAny(normalized, rule.needles)) {
      return rule.type;
    }
  }
  return null;
}
