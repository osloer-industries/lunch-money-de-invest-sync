import { describe, expect, it, vi } from "vitest";
import type { CanonicalTransaction } from "./shared/transaction.js";
import type { SyncConfig } from "./shared/config.js";
import {
  createDryRunNoOpClient,
  parseSyncCliArgs,
  runSync,
  type BrokerCollectors,
  type LunchMoneySyncClient,
} from "./sync.js";

function tx(overrides: Partial<CanonicalTransaction> = {}): CanonicalTransaction {
  return {
    externalId: "id-1",
    date: "2026-07-01",
    amount: -10,
    currency: "eur",
    payee: "Supermarket",
    source: "trade-republic",
    ...overrides,
  };
}

function fakeClient(): LunchMoneySyncClient {
  return {
    tags: {
      getAll: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 1, name: "shared" }),
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
    tradeRepublicProfiles: [],
    scalableCapitalProfiles: [],
    ...overrides,
  };
}

function manualAccountIdsFromCreates(client: LunchMoneySyncClient): number[] {
  const create = client.transactions.create as ReturnType<typeof vi.fn>;
  return create.mock.calls.flatMap((call) => {
    const body = call[0] as { transactions: Array<{ manual_account_id: number }> };
    return body.transactions.map((row) => row.manual_account_id);
  });
}

describe("createDryRunNoOpClient", () => {
  it("returns empty Lunch Money API results", async () => {
    const client = createDryRunNoOpClient();
    await expect(client.tags.getAll()).resolves.toEqual([]);
    await expect(client.transactions.create({} as never)).resolves.toEqual({
      transactions: [],
      skipped_duplicates: [],
    });
  });
});

describe("parseSyncCliArgs", () => {
  it("enables dry-run when --dry-run is present", () => {
    expect(parseSyncCliArgs(["--dry-run"])).toEqual({ dryRun: true });
  });

  it("rejects unknown flags", () => {
    expect(() => parseSyncCliArgs(["--force"])).toThrow(/Unknown option/);
  });
});

describe("runSync", () => {
  it("syncs each configured trade republic profile to its Lunch Money asset", async () => {
    const client = fakeClient();
    const collectors: BrokerCollectors = {
      collectTradeRepublic: vi.fn().mockResolvedValue([tx({ notes: "card 1234" })]),
      collectScalableCapital: vi.fn(),
    };
    const config = baseConfig({
      tradeRepublicProfiles: [
        {
          owner: "me",
          phoneNumber: "+49123",
          pin: "1234",
          lunchMoneyAssetId: 1,
        },
      ],
    });

    await runSync(config, client, collectors, () => {});

    expect(collectors.collectTradeRepublic).toHaveBeenCalledTimes(1);
    expect(collectors.collectScalableCapital).not.toHaveBeenCalled();
    expect(client.transactions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        transactions: [expect.objectContaining({ manual_account_id: 1, tag_ids: [1] })],
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
      scalableCapitalProfiles: [
        { owner: "operator-b", proxyUrl: "http://localhost:3141", lunchMoneyAssetId: 2 },
      ],
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
        { owner: "me", phoneNumber: "+1", pin: "1", lunchMoneyAssetId: 9 },
      ],
    });
    const logger = vi.fn();

    await runSync(config, client, collectors, logger);

    expect(logger).toHaveBeenCalledWith(expect.stringContaining("trade-republic:me"));
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

  it("logs a dry-run completion summary", async () => {
    const client = fakeClient();
    const collectors: BrokerCollectors = {
      collectTradeRepublic: vi.fn().mockResolvedValue([tx()]),
      collectScalableCapital: vi.fn().mockResolvedValue([]),
    };
    const config = baseConfig({
      tradeRepublicProfiles: [
        { owner: "a", phoneNumber: "+1", pin: "1", lunchMoneyAssetId: 1 },
      ],
      scalableCapitalProfiles: [
        { owner: "b", proxyUrl: "http://127.0.0.1:3141", lunchMoneyAssetId: 2 },
      ],
    });
    const logger = vi.fn();

    await runSync(config, client, collectors, logger, { dryRun: true });

    expect(logger).toHaveBeenCalledWith(expect.stringContaining("[dry-run] complete"));
  });

  it("in dry-run mode collects broker data but does not write to Lunch Money", async () => {
    const client = fakeClient();
    const collectors: BrokerCollectors = {
      collectTradeRepublic: vi.fn().mockResolvedValue([tx()]),
      collectScalableCapital: vi.fn(),
    };
    const config = baseConfig({
      tradeRepublicProfiles: [
        { owner: "operator-b", phoneNumber: "+490000000002", pin: "0001", lunchMoneyAssetId: 55 },
      ],
    });
    const logger = vi.fn();

    await runSync(config, client, collectors, logger, { dryRun: true });

    expect(collectors.collectTradeRepublic).toHaveBeenCalledTimes(1);
    expect(client.tags.getAll).not.toHaveBeenCalled();
    expect(client.transactions.create).not.toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("[dry-run]"));
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("manual account 55"));
  });

  it("does not touch Lunch Money assets outside this operator config", async () => {
    const client = fakeClient();
    const collectorsForOperatorA: BrokerCollectors = {
      collectTradeRepublic: vi.fn().mockResolvedValue([tx({ externalId: "a-1" })]),
      collectScalableCapital: vi.fn(),
    };
    const collectorsForOperatorB: BrokerCollectors = {
      collectTradeRepublic: vi.fn(),
      collectScalableCapital: vi.fn().mockResolvedValue([tx({ source: "scalable-capital", externalId: "b-1" })]),
    };

    await runSync(
      baseConfig({
        tradeRepublicProfiles: [
          { owner: "operator-a", phoneNumber: "+490000000001", pin: "0000", lunchMoneyAssetId: 10 },
        ],
      }),
      client,
      collectorsForOperatorA,
      () => {},
    );

    await runSync(
      baseConfig({
        scalableCapitalProfiles: [
          { owner: "operator-b", proxyUrl: "http://127.0.0.1:3142", lunchMoneyAssetId: 20 },
        ],
      }),
      client,
      collectorsForOperatorB,
      () => {},
    );

    expect(manualAccountIdsFromCreates(client)).toEqual([10, 20]);
    expect(manualAccountIdsFromCreates(client)).not.toContain(99);
  });

  it("second run with duplicates inserts nothing new", async () => {
    const client = fakeClient();
    (client.transactions.create as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ transactions: [{ id: 1 }], skipped_duplicates: [] })
      .mockResolvedValueOnce({
        transactions: [],
        skipped_duplicates: [
          { reason: "duplicate_external_id", request_transaction: { external_id: "id-1" } },
        ],
      });

    const collectors: BrokerCollectors = {
      collectTradeRepublic: vi.fn().mockResolvedValue([tx()]),
      collectScalableCapital: vi.fn(),
    };
    const config = baseConfig({
      tradeRepublicProfiles: [
        { owner: "operator-b", phoneNumber: "+490000000002", pin: "0001", lunchMoneyAssetId: 55 },
      ],
    });
    const logger = vi.fn();

    await runSync(config, client, collectors, logger);
    await runSync(config, client, collectors, logger);

    expect(client.transactions.create).toHaveBeenCalledTimes(2);
    expect(logger).toHaveBeenLastCalledWith(
      expect.stringContaining("inserted 0, skipped 1 duplicate"),
    );
  });
});
