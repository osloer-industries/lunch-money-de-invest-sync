import { describe, expect, it } from "vitest";
import { parseSharedCardLast4Input } from "./shared-card-input.js";

describe("parseSharedCardLast4Input", () => {
  it("parses comma-separated digits", () => {
    expect(parseSharedCardLast4Input("1234, 5678")).toEqual(["1234", "5678"]);
  });

  it("still accepts JSON arrays", () => {
    expect(parseSharedCardLast4Input('["1234"]')).toEqual(["1234"]);
  });
});
