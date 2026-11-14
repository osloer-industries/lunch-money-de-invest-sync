import type { CanonicalType } from "../shared/canonical-type.js";
import type { SuggestedCategory } from "./category-defaults.js";

export interface SetupCategoryRow {
  readonly id: number;
  readonly name: string;
  readonly is_income: boolean;
  readonly exclude_from_budget: boolean;
  readonly exclude_from_totals: boolean;
  readonly is_group: boolean;
  readonly group_id?: number | null;
}

const TRANSFER_CANONICAL_TYPES = new Set<CanonicalType>(["deposit", "withdrawal", "transfer"]);

function nameMatches(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function transferCategoryMissingExclusionFlags(category: SetupCategoryRow): boolean {
  return !category.exclude_from_budget || !category.exclude_from_totals;
}

/** Prefer Lunch Money's default transfer category when it already exists. */
export function findTransferCategoryCandidate(
  categories: readonly SetupCategoryRow[],
): SetupCategoryRow | undefined {
  const nonGroups = categories.filter((category) => !category.is_group);
  const paymentTransfer = nonGroups.find((category) => nameMatches(category.name, "Payment, Transfer"));
  if (paymentTransfer) {
    return paymentTransfer;
  }
  const transferOnly = nonGroups.find((category) => nameMatches(category.name, "Transfer"));
  if (transferOnly) {
    return transferOnly;
  }
  return nonGroups.find(
    (category) =>
      !category.is_income &&
      category.exclude_from_budget &&
      category.exclude_from_totals &&
      category.name.toLowerCase().includes("transfer"),
  );
}

export function categoryFlagsMatchTemplate(
  category: SetupCategoryRow,
  template: SuggestedCategory,
): boolean {
  return (
    category.is_income === template.is_income &&
    category.exclude_from_budget === template.exclude_from_budget &&
    category.exclude_from_totals === template.exclude_from_totals
  );
}

export function findSuggestedCategoryMatch(
  categories: readonly SetupCategoryRow[],
  suggestion: SuggestedCategory,
  canonicalType: CanonicalType,
): { category: SetupCategoryRow | undefined; warnedMissingExclusion: boolean } {
  if (TRANSFER_CANONICAL_TYPES.has(canonicalType)) {
    const transfer = findTransferCategoryCandidate(categories);
    if (transfer) {
      return {
        category: transfer,
        warnedMissingExclusion: transferCategoryMissingExclusionFlags(transfer),
      };
    }
  }
  const exact = categories.find((category) => !category.is_group && nameMatches(category.name, suggestion.name));
  if (exact) {
    const warnedMissingExclusion =
      (suggestion.exclude_from_budget && !exact.exclude_from_budget) ||
      (suggestion.exclude_from_totals && !exact.exclude_from_totals);
    return { category: exact, warnedMissingExclusion };
  }
  const category: SetupCategoryRow | undefined = undefined;
  return { category, warnedMissingExclusion: false };
}