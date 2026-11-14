import { describe, expect, it } from "vitest";
import {
  findSuggestedCategoryMatch,
  findTransferCategoryCandidate,
  transferCategoryMissingExclusionFlags,
  type SetupCategoryRow,
} from "./category-matching.js";
import { SUGGESTED_CATEGORIES } from "./category-defaults.js";

function row(overrides: Partial<SetupCategoryRow> & Pick<SetupCategoryRow, "id" | "name">): SetupCategoryRow {
  return {
    is_income: false,
    exclude_from_budget: true,
    exclude_from_totals: true,
    is_group: false,
    group_id: null,
    ...overrides,
  };
}

describe("category-matching", () => {
  it("prefers Payment, Transfer over a bare Transfer name", () => {
    const categories = [
      row({ id: 1, name: "Transfer", exclude_from_budget: false, exclude_from_totals: false }),
      row({ id: 2, name: "Payment, Transfer" }),
    ];
    expect(findTransferCategoryCandidate(categories)?.id).toBe(2);
  });

  it("matches deposit suggestions to existing Payment, Transfer", () => {
    const categories = [row({ id: 42, name: "Payment, Transfer" })];
    const suggestion = SUGGESTED_CATEGORIES.deposit;
    expect(suggestion).toBeDefined();
    const { category, warnedMissingExclusion } = findSuggestedCategoryMatch(
      categories,
      suggestion!,
      "deposit",
    );
    expect(category?.id).toBe(42);
    expect(warnedMissingExclusion).toBe(false);
  });

  it("falls back to a Transfer-named category when Payment, Transfer is absent", () => {
    const categories = [row({ id: 7, name: "Transfer" })];
    expect(findTransferCategoryCandidate(categories)?.id).toBe(7);
  });

  it("recognises other excluded transfer-like category names", () => {
    const categories = [row({ id: 8, name: "Internal transfer" })];
    expect(findTransferCategoryCandidate(categories)?.id).toBe(8);
  });

  it("matches non-transfer suggestions by exact name", () => {
    const categories = [
      row({
        id: 10,
        name: "Investment income",
        is_income: true,
        exclude_from_budget: false,
        exclude_from_totals: false,
      }),
    ];
    const suggestion = SUGGESTED_CATEGORIES.dividend;
    expect(suggestion).toBeDefined();
    const { category, warnedMissingExclusion } = findSuggestedCategoryMatch(
      categories,
      suggestion!,
      "dividend",
    );
    expect(category?.id).toBe(10);
    expect(warnedMissingExclusion).toBe(false);
  });

  it("warns when a matched transfer category lacks exclusion flags", () => {
    const categories = [
      row({ id: 3, name: "Payment, Transfer", exclude_from_budget: false, exclude_from_totals: true }),
    ];
    const suggestion = SUGGESTED_CATEGORIES.transfer;
    expect(suggestion).toBeDefined();
    const { warnedMissingExclusion } = findSuggestedCategoryMatch(categories, suggestion!, "transfer");
    expect(warnedMissingExclusion).toBe(true);
    expect(transferCategoryMissingExclusionFlags(categories[0]!)).toBe(true);
  });
});