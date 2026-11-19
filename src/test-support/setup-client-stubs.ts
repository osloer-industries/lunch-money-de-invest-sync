import { vi } from "vitest";
import type { LunchMoneyClient } from "@lunch-money/lunch-money-js-v2";
import type { CategoryMappingSetupClient, LunchMoneySetupClient } from "../setup/types.js";

export const unimplementedForTest = (method: string): (() => never) => {
  return () => {
    throw new Error(`${method} was not stubbed for this test`);
  };
};

export function stubCategoriesApi(): LunchMoneyClient["categories"] {
  return {
    getAll: vi.fn<LunchMoneyClient["categories"]["getAll"]>().mockResolvedValue([]),
    get: vi.fn<LunchMoneyClient["categories"]["get"]>(),
    create: vi.fn<LunchMoneyClient["categories"]["create"]>(),
    update: vi.fn<LunchMoneyClient["categories"]["update"]>(),
    delete: vi.fn<LunchMoneyClient["categories"]["delete"]>(),
  };
}

export type CategoryMappingSetupClientOverrides = {
  categories?: Partial<CategoryMappingSetupClient["categories"]>;
  tags?: Partial<NonNullable<CategoryMappingSetupClient["tags"]>>;
};

export function stubCategoryMappingClient(
  overrides: CategoryMappingSetupClientOverrides = {},
): CategoryMappingSetupClient {
  return {
    categories: { ...stubCategoriesApi(), ...overrides.categories },
    ...(overrides.tags === undefined
      ? {}
      : {
          tags: {
            getAll: vi.fn().mockResolvedValue([]),
            ...overrides.tags,
          },
        }),
  };
}

export type LunchMoneySetupClientOverrides = {
  categories?: Partial<LunchMoneySetupClient["categories"]>;
  manualAccounts?: Partial<LunchMoneySetupClient["manualAccounts"]>;
};

export function stubLunchMoneySetupClient(overrides: LunchMoneySetupClientOverrides = {}): LunchMoneySetupClient {
  return {
    categories: { ...stubCategoriesApi(), ...overrides.categories },
    manualAccounts: {
      getAll: vi.fn(unimplementedForTest("manualAccounts.getAll")),
      create: vi.fn(unimplementedForTest("manualAccounts.create")),
      get: vi.fn(unimplementedForTest("manualAccounts.get")),
      update: vi.fn(unimplementedForTest("manualAccounts.update")),
      delete: vi.fn(unimplementedForTest("manualAccounts.delete")),
      ...overrides.manualAccounts,
    },
  };
}