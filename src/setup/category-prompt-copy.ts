import type { SuggestedCategory } from "./category-defaults.js";
import type { CanonicalType } from "../shared/canonical-type.js";

export interface CategoryTraitFields {
  readonly name: string;
  readonly is_income: boolean;
  readonly exclude_from_budget: boolean;
  readonly exclude_from_totals: boolean;
}

export function describeCategoryTraits(suggestion: CategoryTraitFields): string {
  const traits: string[] = [];
  if (suggestion.is_income) {
    traits.push("counts as income");
  }
  if (suggestion.exclude_from_budget) {
    traits.push("hidden from budget");
  }
  if (suggestion.exclude_from_totals) {
    traits.push("hidden from totals");
  }
  return traits.length > 0 ? traits.join(", ") : "standard expense";
}

export function formatCreateCategoryConfirm(suggestion: SuggestedCategory): string {
  return `Create category "${suggestion.name}" (${describeCategoryTraits(suggestion)})?`;
}

export function formatCategoryFlagMismatch(category: CategoryTraitFields, template: CategoryTraitFields): string {
  return `  Note: "${category.name}" is set as ${describeCategoryTraits(category)}; the suggested template is ${describeCategoryTraits(template)}.`;
}

const SOURCE_LABELS: Record<string, string> = {
  "trade-republic": "Trade Republic",
  "scalable-capital": "Scalable Capital",
};

const TYPE_LABELS: Partial<Record<CanonicalType, string>> = {
  buy: "Stock purchases",
  sell: "Stock sales",
  deposit: "Deposits",
  withdrawal: "Withdrawals",
  transfer: "Transfers",
  dividend: "Dividends",
  interest: "Interest",
  "savings-plan": "Savings plans",
  saveback: "Saveback",
  unknown: "Unclassified cash events",
};

export function formatTypeGroupHeading(
  source: string,
  canonicalType: CanonicalType,
  count: number,
): string {
  const broker = SOURCE_LABELS[source] ?? source;
  const type = TYPE_LABELS[canonicalType] ?? canonicalType.replaceAll("-", " ");
  return `\n${broker} · ${type} · ${count} similar transaction(s)`;
}