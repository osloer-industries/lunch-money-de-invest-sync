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

  it("parses optional balance tracking account ids", () => {
    const options = parseSetupCliOptions([
      "--trade-republic-holdings-account-id",
      "5",
      "--scalable-holdings-account-id",
      "6",
      "--scalable-savings-account-id",
      "7",
    ]);
    expect(options).toMatchObject({
      tradeRepublicHoldingsAccountId: 5,
      scalableHoldingsAccountId: 6,
      scalableSavingsAccountId: 7,
    });
    expect(parseSetupCliOptions([]).scalableSavingsAccountId).toBeNull();
    expect(() => parseSetupCliOptions(["--scalable-savings-account-id", "x"])).toThrow(/positive integer/);
  });

  it("returns help when requested", () => {
    expect(parseSetupCliOptions(["-h"]).help).toBe(true);
  });

  it("parses categories and export-type-summary flags", () => {
    const options = parseSetupCliOptions(["--categories", "--export-type-summary", "out.json"]);
    expect(options.categories).toBe(true);
    expect(options.exportTypeSummary).toBe("out.json");
  });

  it("parses per-broker manual account ids", () => {
    const options = parseSetupCliOptions([
      "--non-interactive",
      "--trade-republic",
      "--scalable-capital",
      "--owner",
      "operator-a",
      "--trade-republic-asset-id",
      "3",
      "--scalable-asset-id",
      "4",
    ]);
    expect(options.tradeRepublicAssetId).toBe(3);
    expect(options.scalableAssetId).toBe(4);
  });

  it("rejects a non-integer lunch money asset id", () => {
    expect(() => parseSetupCliOptions(["--lunch-money-asset-id", "nope"])).toThrow(/integer/);
  });
});
