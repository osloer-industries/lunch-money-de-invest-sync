import { describe, expect, it, vi } from "vitest";
import { assertDefined } from "../shared/assert.js";
import {
  stubCategoriesCliClient,
  stubEmptyLunchMoneyClient,
  stubSyncCliClient,
} from "./lunch-money-stubs.js";

describe("lunch-money-stubs", () => {
  it("exposes empty category client", async () => {
    const client = stubEmptyLunchMoneyClient();
    await expect(client.categories.getAll()).resolves.toEqual([]);
  });

  it("builds sync CLI client defaults", async () => {
    const client = stubSyncCliClient();
    await expect(client.tags.getAll()).resolves.toEqual([]);
    const getAll = assertDefined(client.transactions.getAll, "transactions.getAll");
    await expect(getAll({ manual_account_id: 1 })).resolves.toEqual({ transactions: [], hasMore: false });
    await expect(client.manualAccounts.get(1)).resolves.toMatchObject({ currency: "eur" });
  });

  it("honors sync client overrides", async () => {
    const client = stubSyncCliClient({
      tags: { getAll: vi.fn().mockResolvedValue([{ name: "needs-review" }]) },
    });
    await expect(client.tags.getAll()).resolves.toEqual([{ name: "needs-review" }]);
  });

  it("builds categories CLI client", async () => {
    const client = stubCategoriesCliClient();
    await expect(client.categories.getAll()).resolves.toEqual([]);
    await expect(client.transactions.getAll({ manual_account_id: 2 })).resolves.toEqual({
      transactions: [],
      hasMore: false,
    });
    await expect(client.transactions.updateMany({ transactions: [] })).resolves.toEqual({ transactions: [] });
  });
});