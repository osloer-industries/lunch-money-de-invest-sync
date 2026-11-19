import { describe, expect, it } from "vitest";
import { harnessSelectAnswer } from "./harness-select.js";

const choices = [
  { value: "yes" as const, name: "Yes" },
  { value: "no" as const, name: "No" },
];

describe("harnessSelectAnswer", () => {
  it("returns empty string when no configured answer", async () => {
    await expect(harnessSelectAnswer(choices, undefined)).resolves.toBe("");
  });

  it("returns the matching choice value", async () => {
    await expect(harnessSelectAnswer(choices, "no")).resolves.toBe("no");
  });

  it("returns configured string when it is not among choices", async () => {
    await expect(harnessSelectAnswer(choices, "999")).resolves.toBe("999");
  });
});