import { describe, expect, it } from "vitest";
import { readResumedProfiles } from "./resume-config.js";
import type { SetupFilesystem } from "./types.js";

describe("readResumedProfiles", () => {
  it("returns empty lists when config is missing", () => {
    const fs: SetupFilesystem = {
      exists: () => false,
      readText: () => null,
      writeText: async () => {},
      chmod: async () => {},
    };
    expect(readResumedProfiles(fs)).toEqual({ tradeRepublicProfiles: [], scalableCapitalProfiles: [] });
  });

  it("loads valid partial config", () => {
    const fs: SetupFilesystem = {
      exists: () => true,
      readText: () =>
        JSON.stringify({
          tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 3, pytrCommand: ["pytr"] }],
        }),
      writeText: async () => {},
      chmod: async () => {},
    };
    const resumed = readResumedProfiles(fs);
    expect(resumed.tradeRepublicProfiles).toHaveLength(1);
    expect(resumed.tradeRepublicProfiles[0]?.owner).toBe("operator-a");
  });

  it("ignores invalid config", () => {
    const fs: SetupFilesystem = {
      exists: () => true,
      readText: () => "{ not json",
      writeText: async () => {},
      chmod: async () => {},
    };
    expect(readResumedProfiles(fs)).toEqual({ tradeRepublicProfiles: [], scalableCapitalProfiles: [] });
  });
});
