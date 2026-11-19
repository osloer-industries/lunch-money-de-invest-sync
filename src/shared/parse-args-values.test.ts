import { describe, expect, it } from "vitest";
import { booleanArg, optionalStringArg, stringListArg } from "./parse-args-values.js";

describe("parse-args-values", () => {
  it("reads boolean flags", () => {
    expect(booleanArg({ dry: true }, "dry")).toBe(true);
    expect(booleanArg({ dry: false }, "dry")).toBe(false);
    expect(booleanArg({}, "dry")).toBe(false);
  });

  it("reads optional strings", () => {
    expect(optionalStringArg({ name: "x" }, "name")).toBe("x");
    expect(optionalStringArg({ name: 1 }, "name")).toBeUndefined();
    expect(optionalStringArg({}, "name")).toBeUndefined();
  });

  it("collects string list options", () => {
    expect(stringListArg({ map: ["a", "b"] }, "map")).toEqual(["a", "b"]);
    expect(stringListArg({ map: ["a", 2, "c"] }, "map")).toEqual(["a", "c"]);
    expect(stringListArg({ map: "solo" }, "map")).toEqual([]);
    expect(stringListArg({}, "map")).toEqual([]);
  });
});