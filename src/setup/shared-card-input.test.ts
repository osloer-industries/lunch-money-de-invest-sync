import { describe, expect, it } from "vitest";
import { parseSharedCardLast4Input } from "./shared-card-input.js";

describe("parseSharedCardLast4Input", () => {
  it("parses comma-separated digits", () => {
    expect(parseSharedCardLast4Input("1234, 5678")).toEqual(["1234", "5678"]);
  });

  it("still accepts JSON arrays of digits", () => {
    expect(parseSharedCardLast4Input('["1234"]')).toEqual(["1234"]);
  });

  it("rejects values that are not exactly 4 digits", () => {
    expect(() => parseSharedCardLast4Input("abcd")).toThrow(/4 digits/);
    expect(() => parseSharedCardLast4Input("12ab")).toThrow(/4 digits/);
    expect(() => parseSharedCardLast4Input("123")).toThrow(/4 digits/);
    expect(() => parseSharedCardLast4Input("12345")).toThrow(/4 digits/);
    expect(() => parseSharedCardLast4Input('["12ab"]')).toThrow(/4 digits/);
  });
});
