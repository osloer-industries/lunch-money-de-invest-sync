import { describe, expect, it } from "vitest";
import {
  stubCategoryMappingClient,
  stubLunchMoneySetupClient,
  unimplementedForTest,
} from "./setup-client-stubs.js";

describe("setup-client-stubs", () => {
  it("builds category mapping clients with optional tags", async () => {
    const bare = stubCategoryMappingClient();
    await expect(bare.categories.getAll()).resolves.toEqual([]);

    const tagged = stubCategoryMappingClient({
      tags: { getAll: () => Promise.resolve([{ name: "saveback" }]) },
    });
    await expect(tagged.tags?.getAll()).resolves.toEqual([{ name: "saveback" }]);
  });

  it("builds setup clients and applies overrides", async () => {
    const client = stubLunchMoneySetupClient({
      manualAccounts: {
        getAll: () => Promise.resolve([]),
      },
    });
    await expect(client.manualAccounts.getAll()).resolves.toEqual([]);
  });

  it("throws from unimplementedForTest stubs", () => {
    const missing = unimplementedForTest("demo.method");
    expect(() => missing()).toThrow("demo.method was not stubbed for this test");
  });
});