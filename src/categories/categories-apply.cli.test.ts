import { describe, expect, it, vi } from "vitest";
import type { SetupFilesystem } from "../setup/types.js";
import { runCategoriesCli } from "./run-categories-cli.js";
import type { SyncConfig } from "../shared/config.js";

const config: SyncConfig = {
  lunchMoneyApiKey: "k",
  sharedCardLast4: [],
  tradeRepublicProfiles: [],
  scalableCapitalProfiles: [],
  categoryMap: {},
  tagMap: {},
};

function filesystem(writeText = vi.fn()): SetupFilesystem {
  return {
    exists: () => true,
    readText: () => JSON.stringify({ categoryMap: {}, tagMap: {} }),
    writeText,
    chmod: vi.fn(),
  };
}

describe("categories apply", () => {
  it("skips write when mapping is unchanged", async () => {
    const writeText = vi.fn();
    const fs = filesystem(writeText);
    fs.readText = () => JSON.stringify({ categoryMap: { deposit: 9 }, tagMap: {} });
    await runCategoriesCli(["apply", "--non-interactive", "--map", "deposit=9", "--json"], {
      filesystem: fs,
      readConfig: () => ({ ...config, categoryMap: { deposit: 9 } }),
      createClient: () => ({}) as never,
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("applies --map idempotently", async () => {
    const writeText = vi.fn();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runCategoriesCli(["apply", "--non-interactive", "--map", "deposit=9", "--json"], {
      filesystem: filesystem(writeText),
      readConfig: () => config,
      createClient: () => ({}) as never,
    });
    expect(writeText).toHaveBeenCalled();
    expect(stdout.mock.calls.some((call) => String(call[0]).includes('"changed":true'))).toBe(true);
    stdout.mockRestore();
  });
});