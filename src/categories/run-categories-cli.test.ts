import { describe, expect, it, vi } from "vitest";
import type { SetupFilesystem } from "../setup/types.js";
import { runCategoriesCli } from "./run-categories-cli.js";
import type { SyncConfig } from "../shared/config.js";

const config: SyncConfig = {
  lunchMoneyApiKey: "k",
  sharedCardLast4: [],
  tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 42 }],
  scalableCapitalProfiles: [],
  categoryMap: { deposit: 9 },
  tagMap: { deposit: ["bank"] },
};

function filesystem(): SetupFilesystem {
  return {
    exists: () => true,
    readText: () =>
      JSON.stringify({
        tradeRepublicProfiles: config.tradeRepublicProfiles,
        categoryMap: config.categoryMap,
        tagMap: config.tagMap,
      }),
    writeText: vi.fn(),
    chmod: vi.fn(),
  };
}

describe("runCategoriesCli", () => {
  it("lists mappings", async () => {
    const logger = vi.fn();
    await runCategoriesCli(["list"], {
      filesystem: filesystem(),
      readConfig: () => config,
      createClient: () =>
        ({
          categories: { getAll: vi.fn().mockResolvedValue([{ id: 9, name: "Transfer" }]) },
        }) as never,
      logger,
    });
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("deposit"));
  });

  it("dry-run reapply reports planned updates", async () => {
    const logger = vi.fn();
    const mappedTx = {
      externalId: "trade-republic:evt-1",
      date: "2026-01-01",
      amount: 1,
      currency: "eur" as const,
      payee: "Broker",
      canonicalType: "deposit" as const,
      source: "trade-republic" as const,
      categoryId: 9,
      tags: ["bank"],
    };
    await runCategoriesCli(["reapply", "--dry-run"], {
      filesystem: filesystem(),
      readConfig: () => config,
      createClient: () =>
        ({
          tags: {
            getAll: vi.fn().mockResolvedValue([{ id: 2, name: "bank" }]),
            create: vi.fn(),
          },
          transactions: {
            getAll: vi.fn().mockResolvedValue({
              transactions: [
                {
                  id: 7,
                  external_id: "trade-republic:evt-1",
                  category_id: 1,
                  tag_ids: [],
                },
              ],
              hasMore: false,
            }),
          },
        }) as never,
      collectors: {
        collectTradeRepublic: vi.fn().mockResolvedValue([mappedTx]),
        collectScalableCapital: vi.fn().mockResolvedValue([]),
      },
      logger,
    });
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("Dry-run"));
  });

  it("applies reapply updates when confirmed", async () => {
    const logger = vi.fn();
    const updateMany = vi.fn().mockResolvedValue({});
    const mappedTx = {
      externalId: "trade-republic:evt-1",
      date: "2026-01-01",
      amount: 1,
      currency: "eur" as const,
      payee: "Broker",
      canonicalType: "deposit" as const,
      source: "trade-republic" as const,
      categoryId: 9,
      tags: ["bank"],
    };
    await runCategoriesCli(["reapply"], {
      filesystem: filesystem(),
      readConfig: () => config,
      confirmReapply: vi.fn().mockResolvedValue(true),
      createClient: () =>
        ({
          tags: {
            getAll: vi.fn().mockResolvedValue([{ id: 2, name: "bank" }]),
            create: vi.fn(),
          },
          transactions: {
            getAll: vi.fn().mockResolvedValue({
              transactions: [
                {
                  id: 7,
                  external_id: "trade-republic:evt-1",
                  category_id: 1,
                  tag_ids: [],
                },
              ],
              hasMore: false,
            }),
            updateMany,
          },
        }) as never,
      collectors: {
        collectTradeRepublic: vi.fn().mockResolvedValue([mappedTx]),
        collectScalableCapital: vi.fn().mockResolvedValue([]),
      },
      logger,
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("Updated 1"));
  });

  it("lists mappings when categories cannot be loaded", async () => {
    const logger = vi.fn();
    await runCategoriesCli(["list"], {
      filesystem: filesystem(),
      readConfig: () => config,
      createClient: () =>
        ({
          categories: { getAll: vi.fn().mockRejectedValue(new Error("offline")) },
        }) as never,
      logger,
    });
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("Lunch Money connection"));
  });

  it("reports when every transaction already matches", async () => {
    const logger = vi.fn();
    await runCategoriesCli(["reapply"], {
      filesystem: filesystem(),
      readConfig: () => config,
      confirmReapply: vi.fn(),
      createClient: () =>
        ({
          tags: { getAll: vi.fn().mockResolvedValue([{ id: 2, name: "bank" }]) },
          transactions: {
            getAll: vi.fn().mockResolvedValue({
              transactions: [
                { id: 7, external_id: "trade-republic:evt-1", category_id: 9, tag_ids: [2] },
              ],
              hasMore: false,
            }),
          },
        }) as never,
      collectors: {
        collectTradeRepublic: vi.fn().mockResolvedValue([
          {
            externalId: "trade-republic:evt-1",
            date: "2026-01-01",
            amount: 1,
            currency: "eur",
            payee: "Broker",
            canonicalType: "deposit",
            source: "trade-republic",
            categoryId: 9,
            tags: ["bank"],
          },
        ]),
        collectScalableCapital: vi.fn().mockResolvedValue([]),
      },
      logger,
    });
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("Nothing to update"));
  });

  it("cancels apply when confirmation is declined", async () => {
    const logger = vi.fn();
    const updateMany = vi.fn();
    await runCategoriesCli(["reapply"], {
      filesystem: filesystem(),
      readConfig: () => config,
      confirmReapply: vi.fn().mockResolvedValue(false),
      createClient: () =>
        ({
          tags: {
            getAll: vi.fn().mockResolvedValue([{ id: 2, name: "bank" }]),
          },
          transactions: {
            getAll: vi.fn().mockResolvedValue({
              transactions: [
                { id: 7, external_id: "trade-republic:evt-1", category_id: 1, tag_ids: [] },
              ],
              hasMore: false,
            }),
            updateMany,
          },
        }) as never,
      collectors: {
        collectTradeRepublic: vi.fn().mockResolvedValue([
          {
            externalId: "trade-republic:evt-1",
            date: "2026-01-01",
            amount: 1,
            currency: "eur",
            payee: "Broker",
            canonicalType: "deposit",
            source: "trade-republic",
            categoryId: 9,
            tags: ["bank"],
          },
        ]),
        collectScalableCapital: vi.fn().mockResolvedValue([]),
      },
      logger,
    });
    expect(updateMany).not.toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith("Re-apply cancelled.");
  });
});