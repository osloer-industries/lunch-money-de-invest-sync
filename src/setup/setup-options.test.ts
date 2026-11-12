import { describe, expect, it } from "vitest";
import { parseSetupCliOptions } from "./setup-options.js";

describe("parseSetupCliOptions", () => {
  it("parses non-interactive broker flags", () => {
    const options = parseSetupCliOptions([
      "--non-interactive",
      "--trade-republic",
      "--owner",
      "operator-a",
      "--lunch-money-asset-id",
      "42",
    ]);
    expect(options.nonInteractive).toBe(true);
    expect(options.tradeRepublic).toBe(true);
    expect(options.owner).toBe("operator-a");
    expect(options.lunchMoneyAssetId).toBe(42);
  });

  it("returns help when requested", () => {
    expect(parseSetupCliOptions(["-h"]).help).toBe(true);
  });

  it("rejects a non-integer lunch money asset id", () => {
    expect(() => parseSetupCliOptions(["--lunch-money-asset-id", "nope"])).toThrow(/integer/);
  });
});
