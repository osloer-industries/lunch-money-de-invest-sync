import { describe, expect, it } from "vitest";
import { assertDefined } from "./assert.js";

describe("assertDefined", () => {
  it("returns the value when it is present", () => {
    expect(assertDefined("ok", "field")).toBe("ok");
    expect(assertDefined(0, "zero")).toBe(0);
  });

  it("throws when value is null or undefined", () => {
    expect(() => assertDefined(null, "missing")).toThrow("missing is required");
    expect(() => assertDefined(undefined, "absent")).toThrow("absent is required");
  });
});