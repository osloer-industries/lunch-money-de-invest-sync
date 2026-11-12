import { describe, expect, it } from "vitest";
import { parsePromptPositiveInt } from "./parse-prompt-id.js";

describe("parsePromptPositiveInt", () => {
  it("returns ids that pass validation", () => {
    const id = parsePromptPositiveInt("42", {
      entityLabel: "Category id",
      exists: (value) => value === 42,
    });
    expect(id).toBe(42);
  });

  it("rejects non-integers", () => {
    expect(() =>
      parsePromptPositiveInt("nope", {
        entityLabel: "Manual account id",
        exists: () => true,
      }),
    ).toThrow(/positive integer/);
  });

  it("rejects unknown ids", () => {
    expect(() =>
      parsePromptPositiveInt("7", {
        entityLabel: "Category id",
        exists: () => false,
      }),
    ).toThrow(/was not returned/);
  });
});
