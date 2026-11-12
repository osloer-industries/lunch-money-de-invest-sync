import { describe, expect, it } from "vitest";
import { matchCanonicalTypeFromRules } from "./keyword-type-rules.js";

describe("matchCanonicalTypeFromRules", () => {
  it("returns the first matching canonical type", () => {
    expect(
      matchCanonicalTypeFromRules("DEPOSIT incoming", [{ needles: ["DEPOSIT"], type: "deposit" }], (value) =>
        value.toUpperCase(),
      ),
    ).toBe("deposit");
    expect(matchCanonicalTypeFromRules("misc", [{ needles: ["DEPOSIT"], type: "deposit" }])).toBeNull();
  });
});
