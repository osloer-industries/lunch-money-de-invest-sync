import { describe, expect, it } from "vitest";
import { filterSyncConfig, parseSyncCliOptions } from "./sync-options.js";

describe("parseSyncCliOptions", () => {
  it("defaults to running all brokers and accounts", () => {
    const options = parseSyncCliOptions([]);
    expect(options.brokers).toEqual([]);
    expect(options.owners).toEqual([]);
    expect(options.dryRun).toBe(false);
  });

  it("accepts multiple broker flags", () => {
    const options = parseSyncCliOptions(["--broker", "trade-republic", "--broker", "scalable-capital"]);
    expect(options.brokers).toEqual(["trade-republic", "scalable-capital"]);
  });

  it("parses broker, account, and dry-run flags", () => {
    const options = parseSyncCliOptions([
      "--broker",
      "trade-republic",
      "--account",
      "operator-a",
      "--dry-run",
    ]);
    expect(options.brokers).toEqual(["trade-republic"]);
    expect(options.owners).toEqual(["operator-a"]);
    expect(options.dryRun).toBe(true);
  });

  it("rejects unknown flags", () => {
    expect(() => parseSyncCliOptions(["--nope"])).toThrow(/Invalid sync arguments/);
  });

  it("rejects unknown broker names", () => {
    expect(() => parseSyncCliOptions(["--broker", "other"])).toThrow(/Unknown broker/);
  });

  it("rejects an empty --account value", () => {
    expect(() => parseSyncCliOptions(["--account", "   "])).toThrow(/non-empty owner/);
  });

  it("returns help when requested", () => {
    const options = parseSyncCliOptions(["--help"]);
    expect(options.help).toBe(true);
  });
});

describe("filterSyncConfig", () => {
  it("returns every profile when no owner filter is set", () => {
    const profiles = [{ owner: "operator-a" }, { owner: "operator-b" }];
    expect(filterSyncConfig(profiles, [])).toHaveLength(2);
  });

  it("throws when no profile matches the owner filter", () => {
    expect(() => filterSyncConfig([{ owner: "operator-a" }], ["missing"])).toThrow(/No profiles matched/);
  });

  it("filters to a single owner", () => {
    expect(filterSyncConfig([{ owner: "operator-a" }, { owner: "operator-b" }], ["operator-b"])).toEqual([
      { owner: "operator-b" },
    ]);
  });
});
