import type { CanonicalType } from "../shared/canonical-type.js";
import { SUGGESTED_CATEGORIES } from "../setup/category-defaults.js";
import {
  findSuggestedCategoryMatch,
  type SetupCategoryRow,
} from "../setup/category-matching.js";
import { parsePromptPositiveInt } from "../setup/parse-prompt-id.js";
import type { PromptChoice } from "../setup/types.js";

export const SKIP_CATEGORY = "__skip__";
export const REMOVE_MAPPING = "__remove__";

function formatCategoryPickerLabel(
  category: SetupCategoryRow,
  categoryRows: readonly SetupCategoryRow[],
): string {
  if (category.group_id === null || category.group_id === undefined) {
    return category.name;
  }
  const parent = categoryRows.find((row) => row.id === category.group_id);
  return parent ? `${parent.name} → ${category.name}` : category.name;
}

export function buildSingleTypeCategoryChoices(
  canonicalType: CanonicalType,
  categoryRows: readonly SetupCategoryRow[],
): PromptChoice[] {
  const suggestion = SUGGESTED_CATEGORIES[canonicalType];
  const match = suggestion
    ? findSuggestedCategoryMatch(categoryRows, suggestion, canonicalType).category
    : undefined;
  const skipChoice: PromptChoice = { name: "Leave category unset", value: SKIP_CATEGORY };
  const removeChoice: PromptChoice = { name: "Remove saved category for this type", value: REMOVE_MAPPING };
  const rest = categoryRows
    .filter((category) => !category.is_group && category.id !== match?.id)
    .map((category) => ({
      name: formatCategoryPickerLabel(category, categoryRows),
      value: String(category.id),
    }));
  const leading: PromptChoice[] = [];
  if (match) {
    leading.push({
      name: `${formatCategoryPickerLabel(match, categoryRows)} (suggested)`,
      value: String(match.id),
    });
  }
  leading.push(skipChoice, removeChoice);
  return [...leading, ...rest];
}

export function parseCategoryChoice(
  choice: string,
  categoryRows: readonly SetupCategoryRow[],
): number | null | undefined {
  if (choice === SKIP_CATEGORY) {
    return undefined;
  }
  if (choice === REMOVE_MAPPING) {
    return null;
  }
  const id = parsePromptPositiveInt(choice, {
    entityLabel: "Category id",
    exists: (candidate) => categoryRows.some((category) => category.id === candidate),
  });
  const picked = categoryRows.find((category) => category.id === id);
  if (picked?.is_group) {
    throw new Error("That id is a category group — pick a child category, not the group.");
  }
  return id;
}