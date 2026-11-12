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
      owner: "operator-a",
      lunchMoneyAssetId: 1,
      pytrCommand: ["pytr"],
    },
  ],
  scalableCapitalProfiles: [
    {
      owner: "operator-b",
      lunchMoneyAssetId: 2,
      portfolioId: "portfolio-operator-a",
    },
  ],
};

describe("loadConfig", () => {
  it("parses a fully populated config", () => {
    const config = loadConfig(validRaw);
    expect(config.tradeRepublicProfiles).toHaveLength(1);
    expect(config.scalableCapitalProfiles[0]?.owner).toBe("operator-b");
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

  it("accepts optional trade republic pytr profile fields", () => {
    const config = loadConfig({
      ...validRaw,
      tradeRepublicProfiles: [
        {
          owner: "operator-a",
          lunchMoneyAssetId: 1,
          pytrCommand: ["uvx", "pytr"],
          pytrHome: "/tmp/operator-a/.pytr",
          loginV2: true,
          wafTokenMode: "playwright",
          account: "acct-1",
          pytrMinVersion: "0.4.10",
        },
      ],
    });
    expect(config.tradeRepublicProfiles[0]?.pytrMinVersion).toBe("0.4.10");
  });

  it("rejects removed trade republic credential fields", () => {
    expect(() =>
      loadConfig({
        ...validRaw,
        tradeRepublicProfiles: [
          {
            owner: "operator-a",
            phoneNumber: "+490000000000",
            pin: "sync-test-pin",
            lunchMoneyAssetId: 1,
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects removed scalable capital proxy fields", () => {
    expect(() =>
      loadConfig({
        ...validRaw,
        scalableCapitalProfiles: [
          {
            owner: "operator-a",
            proxyUrl: "http://127.0.0.1:3141",
            lunchMoneyAssetId: 1,
          },
        ],
      }),
    ).toThrow();
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
