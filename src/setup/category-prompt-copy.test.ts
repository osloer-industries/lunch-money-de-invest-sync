import { describe, expect, it } from "vitest";
import {
  formatCreateCategoryConfirm,
  formatCategoryFlagMismatch,
  formatTypeGroupHeading,
} from "./category-prompt-copy.js";

describe("category prompt copy", () => {
  it("describes category traits without internal field names", () => {
    const text = formatCreateCategoryConfirm({
      name: "Income",
      is_income: true,
      exclude_from_budget: false,
      exclude_from_totals: false,
    });
    expect(text).toMatch(/counts as income/);
    expect(text).not.toMatch(/is_income=/);
  });

  it("formats mismatch warnings in plain language", () => {
    const line = formatCategoryFlagMismatch(
      { name: "A", is_income: false, exclude_from_budget: true, exclude_from_totals: true },
      { name: "B", is_income: true, exclude_from_budget: false, exclude_from_totals: false },
    );
    expect(line).toContain("hidden from budget");
    expect(line).toContain("counts as income");
  });

  it("formats type group headings for operators", () => {
    const heading = formatTypeGroupHeading("trade-republic", "deposit", 3);
    expect(heading).toContain("Trade Republic");
    expect(heading).toContain("Deposits");
    expect(heading).not.toContain("canonicalType");
  });
});