import { describe, expect, it, vi } from "vitest";
import type { SyncConfig } from "../shared/config.js";
import { runDryRunCollection } from "./collect.js";

describe("runDryRunCollection", () => {
  it("throws when account filter matches nothing", async () => {
    await expect(
      runDryRunCollection(
        {
          lunchMoneyApiKey: "lm_test",
          sharedCardLast4: [],
          categoryMap: {},
          tagMap: {},
          tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }],
          scalableCapitalProfiles: [],
        },
        { transactions: { create: vi.fn(), getAll: vi.fn() } },
        { collectTradeRepublic: vi.fn(), collectScalableCapital: vi.fn() },
        { includeBrokers: new Set(["trade-republic"]), owners: ["missing"] },
      ),
    ).rejects.toThrow(/No profiles matched/);
  });

  it("returns structured summary without logging", async () => {
    const config: SyncConfig = {
      lunchMoneyApiKey: "lm_test",
      sharedCardLast4: [],
      categoryMap: { deposit: 5 },
      tagMap: {},
      tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }],
      scalableCapitalProfiles: [],
    };
    const client = {
      transactions: {
        create: vi.fn(),
        getAll: vi.fn().mockResolvedValue({ transactions: [], hasMore: false }),
      },
      categories: {
        getAll: vi.fn().mockResolvedValue([{ id: 5, name: "Cash" }]),
      },
    };
    const collectors = {
      collectTradeRepublic: vi.fn().mockResolvedValue([
        {
          externalId: "trade-republic:evt-1",
          date: "2024-01-01",
          amount: 100,
          currency: "eur" as const,
          payee: "Bank transfer",
          canonicalType: "deposit" as const,
          source: "trade-republic" as const,
        },
      ]),
      collectScalableCapital: vi.fn(),
    };

    const summary = await runDryRunCollection(
      config,
      client,
      collectors,
      { includeBrokers: new Set(["trade-republic"]), owners: [], since: "2024-06-01" },
    );

    expect(summary.profiles).toHaveLength(1);
    expect(summary.profiles[0]?.wouldInsert).toBe(0);
    expect(collectors.collectTradeRepublic).toHaveBeenCalledOnce();
  });
});