import type { InsertTransactionsResponse } from "@lunch-money/lunch-money-js-v2";
import type { BrokerBalanceSnapshot } from "../shared/broker-balances.js";
import type { SyncConfig } from "../shared/config.js";
import type { CanonicalTransaction } from "../shared/transaction.js";
import type { ManualAccountBalanceApi } from "../lunch-money/manual-account-balance.js";
import type { TagsApi } from "../lunch-money/client.js";
import type { DryRunCollectionClient } from "./collect.js";

export type ParityDryRunClient = DryRunCollectionClient & TagsApi & ManualAccountBalanceApi;

/** Shared broker + Lunch Money fake data for terminal vs JSON dry-run parity tests. */
export const parityTradeRepublicTransactions: readonly CanonicalTransaction[] = [
  {
    externalId: "trade-republic:dep-1",
    date: "2024-02-01",
    amount: 250,
    currency: "eur",
    payee: "Bank transfer in",
    canonicalType: "deposit",
    source: "trade-republic",
  },
  {
    externalId: "trade-republic:buy-1",
    date: "2024-02-02",
    amount: -120,
    currency: "eur",
    payee: "MSCI World",
    canonicalType: "buy",
    source: "trade-republic",
  },
  {
    externalId: "trade-republic:unk-1",
    date: "2024-02-03",
    amount: -15,
    currency: "eur",
    payee: "Mystery fee",
    canonicalType: "unknown",
    source: "trade-republic",
  },
];

export const parityScalableCapitalTransactions: readonly CanonicalTransaction[] = [
  {
    externalId: "scalable-capital:dep-1",
    date: "2024-02-10",
    amount: 100,
    currency: "eur",
    payee: "Incoming",
    canonicalType: "deposit",
    source: "scalable-capital",
  },
  {
    externalId: "scalable-capital:unk-1",
    date: "2024-02-11",
    amount: -30,
    currency: "eur",
    payee: "Unmapped row",
    canonicalType: "fee",
    source: "scalable-capital",
  },
  {
    externalId: "scalable-capital:unk-2",
    date: "2024-02-12",
    amount: -20,
    currency: "eur",
    payee: "Another unmapped",
    canonicalType: "tax",
    source: "scalable-capital",
  },
];

export const parityTradeRepublicBalances: BrokerBalanceSnapshot = {
  holdings: { ok: true, value: 12_500.75, currency: "eur" },
  cash: { ok: true, value: 42.1, currency: "eur" },
  savings: { ok: true, value: 800, currency: "eur" },
  notes: ["Overnight rate updated"],
};

export const parityScalableCapitalBalances: BrokerBalanceSnapshot = {
  holdings: { ok: true, value: 5_000, currency: "eur" },
  cash: { ok: true, value: 12.5, currency: "eur" },
  savings: { ok: true, value: 200, currency: "eur" },
  notes: [],
};

const emptyInsertResponse = {
  transactions: [],
  skipped_duplicates: [],
} satisfies InsertTransactionsResponse;

export function paritySyncConfig(): SyncConfig {
  return {
    lunchMoneyApiKey: "lm_test",
    sharedCardLast4: [],
    categoryMap: { deposit: 11 },
    tagMap: {},
    tradeRepublicProfiles: [{ owner: "operator-tr", lunchMoneyAssetId: 101 }],
    scalableCapitalProfiles: [{ owner: "operator-sc", lunchMoneyAssetId: 202 }],
  };
}

export function parityDryRunCollectionClient(): DryRunCollectionClient {
  return {
    categories: {
      getAll: () =>
        Promise.resolve([
          { id: 11, name: "Transfer" },
          { id: 22, name: "Investments" },
        ]),
    },
    transactions: {
      getAll: () => Promise.resolve({ transactions: [], hasMore: false }),
      create: () => Promise.resolve(emptyInsertResponse),
    },
  };
}

/** Wider stub for `runSync` / CLI tests (structural superset of the dry-run client). */
export function parityDryRunClient(): ParityDryRunClient {
  const base = parityDryRunCollectionClient();
  return {
    ...base,
    tags: {
      getAll: () => Promise.resolve([]),
      create: (data) => Promise.resolve({ id: 1, name: data.name }),
    },
    manualAccounts: {
      get: () => Promise.resolve({ balance: "0", currency: "eur" }),
      update: () => Promise.resolve({}),
    },
  };
}

export function parityDryRunCollectors() {
  return {
    collectTradeRepublic: () => Promise.resolve([...parityTradeRepublicTransactions]),
    collectScalableCapital: () => Promise.resolve([...parityScalableCapitalTransactions]),
    readTradeRepublicBalances: () => Promise.resolve(parityTradeRepublicBalances),
    readScalableCapitalBalances: () => Promise.resolve(parityScalableCapitalBalances),
  };
}