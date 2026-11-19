import { vi } from "vitest";
import type { LunchMoneyClient } from "@lunch-money/lunch-money-js-v2";
import type { CategoriesCliClient } from "../categories/categories-cli-client.js";
import type { TagsApi } from "../lunch-money/client.js";
import type { ManualAccountBalanceApi } from "../lunch-money/manual-account-balance.js";
import type { TransactionsApi } from "../lunch-money/upsert.js";
import type { CategoryMappingSetupClient } from "../setup/types.js";

export type { LunchMoneySetupClientOverrides, CategoryMappingSetupClientOverrides } from "./setup-client-stubs.js";
import { stubCategoryMappingClient } from "./setup-client-stubs.js";

export {
  stubCategoryMappingClient,
  stubLunchMoneySetupClient,
} from "./setup-client-stubs.js";

const unimplemented = (method: string): (() => never) => {
  return () => {
    throw new Error(`${method} was not stubbed for this test`);
  };
};

function stubCategoriesApi(): LunchMoneyClient["categories"] {
  return {
    getAll: vi.fn<LunchMoneyClient["categories"]["getAll"]>().mockResolvedValue([]),
    get: vi.fn<LunchMoneyClient["categories"]["get"]>(),
    create: vi.fn<LunchMoneyClient["categories"]["create"]>(),
    update: vi.fn<LunchMoneyClient["categories"]["update"]>(),
    delete: vi.fn<LunchMoneyClient["categories"]["delete"]>(),
  };
}

function stubTagsApi(): LunchMoneyClient["tags"] {
  return {
    getAll: vi.fn<LunchMoneyClient["tags"]["getAll"]>().mockResolvedValue([]),
    get: vi.fn<LunchMoneyClient["tags"]["get"]>(),
    create: vi.fn<LunchMoneyClient["tags"]["create"]>(),
    update: vi.fn<LunchMoneyClient["tags"]["update"]>(),
    delete: vi.fn<LunchMoneyClient["tags"]["delete"]>(),
  };
}

function stubTransactionsApi(): LunchMoneyClient["transactions"] {
  const missing = unimplemented("transactions");
  return {
    getAll: vi.fn<LunchMoneyClient["transactions"]["getAll"]>().mockResolvedValue({
      transactions: [],
      hasMore: false,
    }),
    create: vi
      .fn<LunchMoneyClient["transactions"]["create"]>()
      .mockResolvedValue({ transactions: [], skipped_duplicates: [] }),
    get: vi.fn(missing),
    update: vi.fn(missing),
    delete: vi.fn(missing),
    deleteMany: vi.fn(missing),
    updateMany: vi.fn<LunchMoneyClient["transactions"]["updateMany"]>().mockResolvedValue({
      transactions: [],
    }),
    split: vi.fn(missing),
    unsplit: vi.fn(missing),
    group: vi.fn(missing),
    ungroup: vi.fn(missing),
    attachFile: vi.fn(missing),
    getAttachmentUrl: vi.fn(missing),
    deleteAttachment: vi.fn(missing),
  };
}

/** Same surface as `LunchMoneySyncClient` in sync.ts, without importing sync (avoids heavy test import graphs). */
export type LunchMoneySyncClientStub = TagsApi &
  TransactionsApi &
  ManualAccountBalanceApi & {
    readonly categories?: CategoryMappingSetupClient["categories"];
  };

export type StubSyncCliClientOverrides = {
  categories?: Partial<NonNullable<LunchMoneySyncClientStub["categories"]>>;
  tags?: Partial<LunchMoneySyncClientStub["tags"]>;
  transactions?: Partial<LunchMoneySyncClientStub["transactions"]>;
  manualAccounts?: Partial<LunchMoneySyncClientStub["manualAccounts"]>;
};

export function stubSyncCliClient(overrides: StubSyncCliClientOverrides = {}): LunchMoneySyncClientStub {
  const baseCategories = stubCategoriesApi();
  const transactions: TransactionsApi["transactions"] = {
    getAll: overrides.transactions?.getAll ?? vi.fn().mockResolvedValue({ transactions: [], hasMore: false }),
    create:
      overrides.transactions?.create ??
      vi.fn().mockResolvedValue({ transactions: [], skipped_duplicates: [] }),
  };
  return {
    tags: {
      getAll: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      ...overrides.tags,
    },
    transactions,
    categories: { ...baseCategories, ...overrides.categories },
    manualAccounts: {
      get: vi.fn().mockResolvedValue({
        balance: "0",
        currency: "eur",
      }),
      update: vi.fn().mockResolvedValue({}),
      ...overrides.manualAccounts,
    },
  };
}

export type CategoriesCliTestClient = CategoriesCliClient;

export function stubCategoriesCliClient(
  overrides: Partial<{
    categories: Partial<CategoriesCliClient["categories"]>;
    tags: Partial<CategoriesCliClient["tags"]>;
    transactions: Partial<CategoriesCliClient["transactions"]>;
  }> = {},
): CategoriesCliClient {
  const baseTransactions = stubTransactionsApi();
  return {
    categories: { ...stubCategoriesApi(), ...overrides.categories },
    tags: { ...stubTagsApi(), ...overrides.tags },
    transactions: {
      getAll: baseTransactions.getAll,
      updateMany: baseTransactions.updateMany,
      ...overrides.transactions,
    },
  };
}

export function stubEmptyLunchMoneyClient(): Pick<LunchMoneyClient, "categories"> {
  return stubCategoryMappingClient();
}