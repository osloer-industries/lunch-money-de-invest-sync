import { describe, expect, it, vi } from "vitest";
import type { SetupFilesystem } from "../setup/types.js";
import { runCategoriesCli } from "./run-categories-cli.js";
import type { SyncConfig } from "../shared/config.js";
import { stubCategoriesCliClient } from "../test-support/lunch-money-stubs.js";
import { assertDefined } from "../shared/assert.js";

const config: SyncConfig = {
  lunchMoneyApiKey: "k",
  sharedCardLast4: [],
  tradeRepublicProfiles: [],
  scalableCapitalProfiles: [],
  categoryMap: { deposit: 9 },
  tagMap: {},
};

function filesystem(): SetupFilesystem {
  return {
    exists: () => true,
    readText: () => JSON.stringify({ categoryMap: config.categoryMap, tagMap: config.tagMap }),
    writeText: vi.fn(),
    chmod: vi.fn(),
  };
}

describe("categories list --json", () => {
  it("writes mapping json to stdout", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runCategoriesCli(["list", "--json"], {
      filesystem: filesystem(),
      readConfig: () => config,
      createClient: () =>
        stubCategoriesCliClient({
          categories: { getAll: vi.fn().mockResolvedValue([{ id: 9, name: "Transfer" }]) },
        }),
    });
    const line = String(stdout.mock.calls[0]?.[0]);
    expect(line).toContain('"canonicalType":"deposit"');
    stdout.mockRestore();
  });

  it("lists lunch money catalog as json", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runCategoriesCli(["list-lunch-money", "--json"], {
      filesystem: filesystem(),
      readConfig: () => config,
      createClient: () =>
        stubCategoriesCliClient({
          categories: {
            getAll: vi
              .fn()
              .mockResolvedValue([
                {
                  id: 1,
                  name: "Income",
                  is_income: true,
                  exclude_from_budget: false,
                  exclude_from_totals: false,
                },
              ]),
          },
          tags: { getAll: vi.fn().mockResolvedValue([{ id: 2, name: "bank" }]) },
        }),
    });
    const firstStdout = assertDefined(stdout.mock.calls[0]?.[0], "stdout json line");
    const parsed: unknown = JSON.parse(String(firstStdout));
    expect(parsed).toMatchObject({ tags: expect.any(Array) });
    if (typeof parsed !== "object" || parsed === null || !("tags" in parsed) || !Array.isArray(parsed.tags)) {
      throw new Error("expected tags array in stdout json");
    }
    expect(parsed.tags).toHaveLength(1);
    stdout.mockRestore();
  });
});