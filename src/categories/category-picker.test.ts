import { describe, expect, it } from "vitest";
import { buildSingleTypeCategoryChoices, parseCategoryChoice, REMOVE_MAPPING, SKIP_CATEGORY } from "./category-picker.js";

describe("category-picker", () => {
  const groupedRows = [
    {
      id: 11,
      name: "Investments",
      is_group: false,
      group_id: 99,
      is_income: false,
      exclude_from_budget: true,
      exclude_from_totals: true,
    },
    {
      id: 99,
      name: "Groups",
      is_group: true,
      group_id: null,
      is_income: false,
      exclude_from_budget: false,
      exclude_from_totals: false,
    },
  ];

  const rows = [
    {
      id: 10,
      name: "Investments",
      is_group: false,
      group_id: null,
      is_income: false,
      exclude_from_budget: true,
      exclude_from_totals: true,
    },
    {
      id: 99,
      name: "Groups",
      is_group: true,
      group_id: null,
      is_income: false,
      exclude_from_budget: false,
      exclude_from_totals: false,
    },
  ];

  it("parses skip, remove, and valid ids", () => {
    expect(parseCategoryChoice(SKIP_CATEGORY, rows)).toBeUndefined();
    expect(parseCategoryChoice(REMOVE_MAPPING, rows)).toBeNull();
    expect(parseCategoryChoice("10", rows)).toBe(10);
  });

  it("rejects category group ids", () => {
    expect(() => parseCategoryChoice("99", rows)).toThrow(/category group/);
  });

  it("labels grouped categories with their parent", () => {
    const choices = buildSingleTypeCategoryChoices("buy", groupedRows);
    expect(choices.some((choice) => choice.name.includes("Groups"))).toBe(true);
  });

  it("includes remove and skip in choices", () => {
    const choices = buildSingleTypeCategoryChoices("buy", rows);
    expect(choices.some((choice) => choice.value === REMOVE_MAPPING)).toBe(true);
    expect(choices.some((choice) => choice.value === SKIP_CATEGORY)).toBe(true);
  });
});