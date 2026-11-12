import { describe, expect, it } from "vitest";
import { isDuplicateAssetDisplayName, isLunchMoneyUnauthorized } from "./lunch-money-errors.js";

describe("lunch-money-errors", () => {
  it("detects unauthorized errors", () => {
    expect(isLunchMoneyUnauthorized(new Error("Unauthorized"))).toBe(true);
    expect(isLunchMoneyUnauthorized(new Error("HTTP 401"))).toBe(true);
  });

  it("detects duplicate asset names", () => {
    expect(isDuplicateAssetDisplayName(new Error("ASSET_DISPLAY_NAME_ALREADY_EXISTS"))).toBe(true);
  });
});
