import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chdir, cwd } from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, readConfigFromDisk, resolveConfigFilePath } from "./config.js";

const validRaw = {
  lunchMoneyApiKey: "lm_test_key",
  sharedCardLast4: ["1234"],
  tradeRepublicProfiles: [
    {
      owner: "me",
      phoneNumber: "+490000000000",
      pin: "0000",
      lunchMoneyAssetId: 1,
    },
  ],
  scalableCapitalProfiles: [
    {
      owner: "secondary",
      proxyUrl: "http://localhost:8000",
      lunchMoneyAssetId: 2,
    },
  ],
};

describe("loadConfig", () => {
  it("parses a fully populated config", () => {
    const config = loadConfig(validRaw);
    expect(config.tradeRepublicProfiles).toHaveLength(1);
    expect(config.scalableCapitalProfiles[0]?.owner).toBe("secondary");
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

  it("rejects cloud metadata proxy URLs", () => {
    expect(() =>
      loadConfig({
        ...validRaw,
        scalableCapitalProfiles: [
          {
            owner: "me",
            proxyUrl: "http://169.254.169.254/",
            lunchMoneyAssetId: 1,
          },
        ],
      }),
    ).toThrow(/must not target 169.254.169.254/);
  });
});

describe("resolveConfigFilePath", () => {
  it("allows config.json in the working directory", () => {
    expect(resolveConfigFilePath("config.json")).toBe(path.join(path.resolve(cwd()), "config.json"));
  });

  it("rejects path traversal outside the working directory", () => {
    expect(() => resolveConfigFilePath("/etc/config.json")).toThrow(/working directory/);
    expect(() => resolveConfigFilePath("../config.json")).toThrow(/working directory/);
  });
});

describe("readConfigFromDisk", () => {
  const originalApiKey = process.env["LUNCH_MONEY_API_KEY"];
  const originalCwd = cwd();

  afterEach(() => {
    chdir(originalCwd);
    if (originalApiKey === undefined) {
      delete process.env["LUNCH_MONEY_API_KEY"];
    } else {
      process.env["LUNCH_MONEY_API_KEY"] = originalApiKey;
    }
  });

  it("loads profiles from disk and injects the API key from the environment", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lm-sync-config-"));
    chdir(dir);
    writeFileSync(
      "config.json",
      JSON.stringify({
        sharedCardLast4: ["1234"],
        tradeRepublicProfiles: validRaw.tradeRepublicProfiles,
      }),
    );
    process.env["LUNCH_MONEY_API_KEY"] = "lm_from_env";

    const config = readConfigFromDisk();
    expect(config.lunchMoneyApiKey).toBe("lm_from_env");
    expect(config.tradeRepublicProfiles).toHaveLength(1);
  });

  it("ignores unexpected JSON keys such as __proto__", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lm-sync-config-"));
    chdir(dir);
    writeFileSync(
      "config.json",
      '{"__proto__":{"polluted":true},"sharedCardLast4":[],"tradeRepublicProfiles":[]}',
    );
    process.env["LUNCH_MONEY_API_KEY"] = "lm_from_env";

    expect(() => readConfigFromDisk()).not.toThrow();
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it("rejects invalid JSON", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lm-sync-config-"));
    chdir(dir);
    writeFileSync("config.json", "{not-json");

    expect(() => readConfigFromDisk()).toThrow(/invalid JSON/);
  });
});
