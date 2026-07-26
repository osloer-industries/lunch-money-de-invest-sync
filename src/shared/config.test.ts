import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const validRaw = {
  lunchMoneyApiKey: "lm_test_key",
  sharedCardLast4: ["1234"],
  tradeRepublicProfiles: [
    {
      owner: "me",
      phoneNumber: "+491234567",
      pin: "1234",
      lunchMoneyAssetId: 1,
    },
  ],
  scalableCapitalProfiles: [
    {
      owner: "wife",
      proxyUrl: "http://localhost:8000",
      lunchMoneyAssetId: 2,
    },
  ],
};

describe("loadConfig", () => {
  it("parses a fully populated config", () => {
    const config = loadConfig(validRaw);
    expect(config.tradeRepublicProfiles).toHaveLength(1);
    expect(config.scalableCapitalProfiles[0]?.owner).toBe("wife");
  });

  it("defaults optional arrays to empty", () => {
    const config = loadConfig({ lunchMoneyApiKey: "lm_test_key" });
    expect(config.tradeRepublicProfiles).toEqual([]);
    expect(config.scalableCapitalProfiles).toEqual([]);
    expect(config.sharedCardLast4).toEqual([]);
  });

  it("rejects a missing Lunch Money API key", () => {
    expect(() => loadConfig({ ...validRaw, lunchMoneyApiKey: undefined })).toThrow();
  });

  it("rejects a shared card entry that isn't exactly 4 digits", () => {
    expect(() => loadConfig({ ...validRaw, sharedCardLast4: ["12"] })).toThrow();
  });

  it("rejects a trade republic profile missing a pin", () => {
    const { pin: _pin, ...profileWithoutPin } = validRaw.tradeRepublicProfiles[0]!;
    expect(() =>
      loadConfig({
        ...validRaw,
        tradeRepublicProfiles: [profileWithoutPin],
      }),
    ).toThrow();
  });
});
