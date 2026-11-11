import { describe, expect, it, vi } from "vitest";
import type { CanonicalTransaction } from "./shared/transaction.js";
import type { SyncConfig } from "./shared/config.js";
import { runSync, type BrokerCollectors, type LunchMoneySyncClient } from "./sync.js";

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
          owner: "operator-a",
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
        { owner: "operator-a", phoneNumber: "+1", pin: "1", lunchMoneyAssetId: 9 },
      ],
    });
    const logger = vi.fn();

    await runSync(config, client, collectors, logger);

    expect(logger).toHaveBeenCalledWith(expect.stringContaining("trade-republic:operator-a"));
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
