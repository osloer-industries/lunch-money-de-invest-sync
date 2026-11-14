import { describe, expect, it } from "vitest";
import { SUGGESTED_CATEGORIES, SUGGESTED_TAGS } from "./category-defaults.js";
import { formatGroupLabel, groupTypesForCategoryPrompts, parseTagList } from "./run-category-mapping.js";

describe("category defaults", () => {
  it("suggests plain budget Income for interest and dividend", () => {
    expect(SUGGESTED_CATEGORIES.interest).toEqual({
      name: "Income",
      is_income: true,
      exclude_from_budget: false,
      exclude_from_totals: false,
    });
    expect(SUGGESTED_CATEGORIES.dividend).toBe(SUGGESTED_CATEGORIES.interest);
  });

  it("suggests the transfer category for unknown", () => {
    expect(SUGGESTED_CATEGORIES.unknown).toBe(SUGGESTED_CATEGORIES.transfer);
    expect(SUGGESTED_CATEGORIES.unknown?.name).toBe("Payment, Transfer");
  });

  it("keeps Investment tax and leaves Saveback without a silent default", () => {
    expect(SUGGESTED_CATEGORIES.tax?.name).toBe("Investment tax");
    expect(SUGGESTED_CATEGORIES.saveback).toBeUndefined();
  });

  it("only suggests tags that add information beyond the category", () => {
    expect(Object.values(SUGGESTED_TAGS).flat()).not.toContain("investment");
    expect(SUGGESTED_TAGS).toEqual({
      dividend: ["dividend"],
      interest: ["interest"],
      saveback: ["saveback"],
      unknown: ["needs-review"],
    });
  });
});

describe("groupTypesForCategoryPrompts", () => {
  it("asks once per suggested category and keeps standalone types on their own", () => {
    const groups = groupTypesForCategoryPrompts([
      "savings-plan",
      "buy",
      "sell",
      "interest",
      "dividend",
      "unknown",
      "transfer",
      "deposit",
      "withdrawal",
      "saveback",
      "fee",
      "tax",
      "buy",
    ]);
    expect(groups.map((group) => group.types.join("+"))).toEqual([
      "buy+savings-plan+sell",
      "deposit+transfer+withdrawal",
      "dividend+interest",
      "fee",
      "saveback",
      "tax",
      "unknown",
    ]);
    const income = groups.find((group) => group.types.includes("interest"));
    expect([...(income?.suggestedTags ?? [])]).toEqual([
      ["dividend", ["dividend"]],
      ["interest", ["interest"]],
    ]);
  });

  it("rejects non-canonical types", () => {
    expect(() => groupTypesForCategoryPrompts(["bogus" as never])).toThrow();
  });

  it("labels single and grouped types", () => {
    expect(formatGroupLabel(["fee"])).toBe('type "fee"');
    expect(formatGroupLabel(["buy", "sell"])).toBe('types "buy", "sell"');
  });
});

describe("parseTagList", () => {
  it("splits on commas, trims, and treats blank as no tags", () => {
    expect(parseTagList(" a, b ,, ")).toEqual(["a", "b"]);
    expect(parseTagList("")).toEqual([]);
    expect(parseTagList("   ")).toEqual([]);
    expect(parseTagList(undefined)).toEqual([]);
    expect(parseTagList(null)).toEqual([]);
  });
});
