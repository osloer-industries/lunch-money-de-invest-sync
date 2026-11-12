import { describe, expect, it, vi } from "vitest";
import type { CanonicalTransaction } from "./shared/transaction.js";
import type { SyncConfig } from "./shared/config.js";
import { createLiveCollectors, runSync, runSyncCli, type BrokerCollectors, type LunchMoneySyncClient } from "./sync.js";

const fetchAllScalableCapitalTransactions = vi.hoisted(() => vi.fn());
const createDefaultScCliRunner = vi.hoisted(() => vi.fn(() => ({})));
const fetchTradeRepublicTimeline = vi.hoisted(() => vi.fn());
const createDefaultPytrCliRunner = vi.hoisted(() => vi.fn(() => ({})));
const collectTypeObservations = vi.hoisted(() => vi.fn());
const writeFileMock = vi.hoisted(() => vi.fn());

vi.mock("./scalable-capital/client.js", () => ({
  fetchAllScalableCapitalTransactions,
  createDefaultScCliRunner,
}));

vi.mock("./trade-republic/client.js", () => ({
  fetchTradeRepublicTimeline,
  createDefaultPytrCliRunner,
}));

vi.mock("./shared/collect-type-observations.js", () => ({
  collectTypeObservations,
}));

vi.mock("node:fs/promises", () => ({
  writeFile: writeFileMock,
}));

function tx(overrides: Partial<CanonicalTransaction> = {}): CanonicalTransaction {
  return {
    externalId: "id-1",
    date: "2026-07-01",
    amount: -10,
    currency: "eur",
    payee: "Supermarket",
    canonicalType: "unknown",
    source: "trade-republic",
    ...overrides,
  };
}

function fakeClient(): LunchMoneySyncClient {
  let nextTagId = 1;
  return {
    tags: {
      getAll: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async ({ name }: { name: string }) => ({
        id: nextTagId++,
        name,
      })),
    },
    transactions: {
      create: vi.fn().mockResolvedValue({ transactions: [{ id: 1 }], skipped_duplicates: [] }),
    },
  } as unknown as LunchMoneySyncClient;
}

function baseConfig(overrides: Partial<SyncConfig> = {}): SyncConfig {
  return {
    lunchMoneyApiKey: "lm_test",
    sharedCardLast4: ["1234"],
    categoryMap: {},
    tagMap: {},
    tradeRepublicProfiles: [],
    scalableCapitalProfiles: [],
    ...overrides,
  };
}

describe("runSync", () => {
  it("syncs each configured trade republic profile to its Lunch Money asset", async () => {
    const client = fakeClient();
    const collectors: BrokerCollectors = {
      collectTradeRepublic: vi.fn().mockResolvedValue([tx({ notes: "card 1234" })]),
      collectScalableCapital: vi.fn(),
    };
    const config = baseConfig({
      tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }],
    });

    await runSync(config, client, collectors, () => {});

    expect(collectors.collectTradeRepublic).toHaveBeenCalledTimes(1);
    expect(collectors.collectScalableCapital).not.toHaveBeenCalled();
    expect(client.transactions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        transactions: [
          expect.objectContaining({ manual_account_id: 1, tag_ids: [1, 2], category_id: null }),
        ],
      }),
    );
  });

  it("applies categoryMap and tagMap before upserting", async () => {
    const client = fakeClient();
    const collectors: BrokerCollectors = {
      collectTradeRepublic: vi.fn().mockResolvedValue([tx({ canonicalType: "deposit" })]),
      collectScalableCapital: vi.fn(),
    };
    const config = baseConfig({
      tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }],
      categoryMap: { deposit: 55 },
      tagMap: { deposit: ["investment"] },
    });
    await runSync(config, client, collectors, () => {});
    expect(client.transactions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        transactions: [
          expect.objectContaining({
            category_id: 55,
            tag_ids: [1],
          }),
        ],
      }),
    );
  });

  it("syncs each configured scalable capital profile independently", async () => {
    const client = fakeClient();
    const collectors: BrokerCollectors = {
      collectTradeRepublic: vi.fn(),
      collectScalableCapital: vi.fn().mockResolvedValue([tx({ source: "scalable-capital" })]),
    };
    const config = baseConfig({
      scalableCapitalProfiles: [{ owner: "operator-b", lunchMoneyAssetId: 2 }],
    });

    await runSync(config, client, collectors, () => {});

    expect(collectors.collectScalableCapital).toHaveBeenCalledTimes(1);
    expect(client.transactions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        transactions: [expect.objectContaining({ manual_account_id: 2 })],
      }),
    );
  });

  it("logs a summary line per synced account", async () => {
    const client = fakeClient();
    const collectors: BrokerCollectors = {
      collectTradeRepublic: vi.fn().mockResolvedValue([tx()]),
      collectScalableCapital: vi.fn(),
    };
    const config = baseConfig({
      tradeRepublicProfiles: [
        { owner: "operator-a", lunchMoneyAssetId: 9 },
      ],
    });
    const logger = vi.fn();

    await runSync(config, client, collectors, logger);

    expect(logger).toHaveBeenCalledWith(expect.stringContaining("trade-republic:operator-a"));
  });

  it("wires the live trade republic collector to the pytr CLI transport", async () => {
    fetchTradeRepublicTimeline.mockResolvedValue([
      {
        id: "evt-1",
        timestamp: "2026-07-01T12:00:00.000+0000",
        title: "Merchant",
        amount: { currency: "EUR", value: -5 },
      },
    ]);
    const collectors = createLiveCollectors();
    const mapped = await collectors.collectTradeRepublic({ owner: "operator-a", lunchMoneyAssetId: 1 });
    expect(mapped[0]?.externalId).toBe("trade-republic:evt-1");
    expect(fetchTradeRepublicTimeline).toHaveBeenCalled();
  });

  it("forwards optional pytr profile fields to the transport", async () => {
    fetchTradeRepublicTimeline.mockResolvedValue([]);
    const collectors = createLiveCollectors();
    await collectors.collectTradeRepublic({
      owner: "operator-a",
      lunchMoneyAssetId: 1,
      pytrCommand: ["uvx", "pytr"],
      pytrHome: "/data/operator-a/.pytr",
      loginV2: true,
      wafTokenMode: "playwright",
      account: "acct-1",
      pytrMinVersion: "0.4.10",
    });
    expect(fetchTradeRepublicTimeline).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        pytrCommand: ["uvx", "pytr"],
        pytrHome: "/data/operator-a/.pytr",
        loginV2: true,
        wafTokenMode: "playwright",
        account: "acct-1",
        pytrMinVersion: "0.4.10",
      }),
    );
  });

  it("wires the live scalable collector to the CLI transport", async () => {
    fetchAllScalableCapitalTransactions.mockResolvedValue([
      {
        id: "tx-cash-1",
        date: "2026-03-10T10:00:00Z",
        type: "BrokerCashTransaction",
        description: "Deposit",
        amount: 10,
        currency: "EUR",
      },
    ]);
    const collectors = createLiveCollectors();
    const mapped = await collectors.collectScalableCapital({
      owner: "operator-a",
      lunchMoneyAssetId: 3,
      portfolioId: "portfolio-operator-a",
    });
    expect(mapped[0]?.externalId).toBe("scalable-capital:tx-cash-1");
    expect(fetchAllScalableCapitalTransactions).toHaveBeenCalled();
  });

  it("dry-run uses GET preview and skips inserts", async () => {
    const client = fakeClient();
    client.transactions.getAll = vi.fn().mockResolvedValue({ transactions: [], hasMore: false });
    const collectors: BrokerCollectors = {
      collectTradeRepublic: vi.fn().mockResolvedValue([tx()]),
      collectScalableCapital: vi.fn(),
    };
    const logger = vi.fn();
    const config = baseConfig({
      tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }],
    });
    await runSync(config, client, collectors, logger, {
      includeBrokers: new Set(["trade-republic"]),
      owners: [],
      dryRun: true,
    });
    expect(client.transactions.create).not.toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("dry-run"));
  });

  it("logs duplicate preview lines during dry-run", async () => {
    const client = fakeClient();
    client.transactions.getAll = vi
      .fn()
      .mockResolvedValue({ transactions: [{ external_id: "trade-republic:evt-1" }], hasMore: false });
    const logger = vi.fn();
    await runSync(
      baseConfig({ tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }] }),
      client,
      {
        collectTradeRepublic: vi.fn().mockResolvedValue([tx({ externalId: "trade-republic:evt-1" }), tx()]),
        collectScalableCapital: vi.fn(),
      },
      logger,
      { includeBrokers: new Set(["trade-republic"]), owners: [], dryRun: true },
    );
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("="));
  });

  it("throws when --account matches no profiles for the selected broker", async () => {
    const client = fakeClient();
    await expect(
      runSyncCli(
        ["--broker", "scalable-capital", "--account", "operator-a"],
        {
          readConfig: () =>
            baseConfig({
              tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }],
              scalableCapitalProfiles: [],
            }),
          createClient: () => client as never,
          collectors: { collectTradeRepublic: vi.fn(), collectScalableCapital: vi.fn() },
        },
      ),
    ).rejects.toThrow(/No profiles matched/);
  });

  it("throws when --account matches no configured profiles", async () => {
    const client = fakeClient();
    await expect(
      runSync(
        baseConfig({ tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }] }),
        client,
        { collectTradeRepublic: vi.fn(), collectScalableCapital: vi.fn() },
        vi.fn(),
        { includeBrokers: new Set(["trade-republic"]), owners: ["missing"], dryRun: false },
      ),
    ).rejects.toThrow(/No profiles matched/);
  });

  it("combines --broker and --account filters", async () => {
    const client = fakeClient();
    const collectors: BrokerCollectors = {
      collectTradeRepublic: vi.fn().mockResolvedValue([tx()]),
      collectScalableCapital: vi.fn(),
    };
    await runSyncCli(
      ["--broker", "trade-republic", "--account", "operator-a"],
      {
        readConfig: () =>
          baseConfig({
            tradeRepublicProfiles: [
              { owner: "operator-a", lunchMoneyAssetId: 1 },
              { owner: "operator-b", lunchMoneyAssetId: 2 },
            ],
          }),
        createClient: () => client as never,
        collectors,
        logger: () => {},
      },
    );
    expect(collectors.collectTradeRepublic).toHaveBeenCalledOnce();
  });

  it("limits sync to scalable capital when --broker scalable-capital", async () => {
    const client = fakeClient();
    const collectors: BrokerCollectors = {
      collectTradeRepublic: vi.fn(),
      collectScalableCapital: vi.fn().mockResolvedValue([tx({ source: "scalable-capital" })]),
    };
    await runSyncCli(["--broker", "scalable-capital"], {
      readConfig: () =>
        baseConfig({
          tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }],
          scalableCapitalProfiles: [{ owner: "operator-b", lunchMoneyAssetId: 2 }],
        }),
      createClient: () => client as never,
      collectors,
      logger: () => {},
    });
    expect(collectors.collectTradeRepublic).not.toHaveBeenCalled();
    expect(collectors.collectScalableCapital).toHaveBeenCalled();
  });

  it("runSyncCli prints help without touching brokers", async () => {
    const logger = vi.fn();
    await runSyncCli(["--help"], { logger, readConfig: () => baseConfig() });
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("--dry-run"));
  });

  it("writes export-type-summary before syncing when requested", async () => {
    collectTypeObservations.mockResolvedValue([
      {
        canonicalType: "deposit",
        brokerSubtype: "BrokerCashTransactionSummary",
        source: "scalable-capital",
        amount: 1,
        currency: "eur",
        payee: "Deposit",
        date: "2026-01-01",
      },
    ]);
    writeFileMock.mockResolvedValue(undefined);
    const client = fakeClient();
    const logger = vi.fn();
    await runSyncCli(["--export-type-summary", "types.json"], {
      readConfig: () =>
        baseConfig({ scalableCapitalProfiles: [{ owner: "operator-b", lunchMoneyAssetId: 2 }] }),
      createClient: () => client as never,
      collectors: { collectTradeRepublic: vi.fn().mockResolvedValue([]), collectScalableCapital: vi.fn().mockResolvedValue([]) },
      logger,
    });
    expect(writeFileMock).toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("types.json"));
  });

  it("runSyncCli rejects unknown flags", async () => {
    await expect(runSyncCli(["--nope"], { readConfig: () => baseConfig() })).rejects.toThrow(
      /Invalid sync arguments/,
    );
  });

  it("does nothing and logs nothing when no profiles are configured", async () => {
    const client = fakeClient();
    const collectors: BrokerCollectors = {
      collectTradeRepublic: vi.fn(),
      collectScalableCapital: vi.fn(),
    };
    const logger = vi.fn();

    await runSync(baseConfig(), client, collectors, logger);

    expect(logger).not.toHaveBeenCalled();
    expect(client.transactions.create).not.toHaveBeenCalled();
  });
});
