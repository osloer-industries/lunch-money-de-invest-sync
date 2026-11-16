import { afterEach, describe, expect, it, vi } from "vitest";
import { createLunchMoneyClient, resolveTagIds, type TagsApi } from "./client.js";

function fakeTagsApi(existing: Array<{ id: number; name: string }>): TagsApi {
  let nextId = Math.max(0, ...existing.map((tag) => tag.id)) + 1;
  const store = [...existing];
  return {
    tags: {
      getAll: vi.fn(() => Promise.resolve(store)),
      create: vi.fn(({ name }) => {
        const tag = { id: nextId++, name };
        store.push(tag);
        return Promise.resolve(tag);
      }),
    },
  };
}

describe("createLunchMoneyClient", () => {
  const originalBase = process.env.LUNCH_MONEY_API_BASE_URL;

  afterEach(() => {
    if (originalBase === undefined) {
      delete process.env.LUNCH_MONEY_API_BASE_URL;
    } else {
      process.env.LUNCH_MONEY_API_BASE_URL = originalBase;
    }
  });

  it("accepts LUNCH_MONEY_API_BASE_URL for offline mock servers", () => {
    process.env.LUNCH_MONEY_API_BASE_URL = "http://127.0.0.1:9/v2";
    expect(() => createLunchMoneyClient("lm_test_key")).not.toThrow();
  });
});

describe("resolveTagIds", () => {
  it("returns an empty map when no tag names are requested", async () => {
    const api = fakeTagsApi([]);
    const resolved = await resolveTagIds(api, []);
    expect(resolved.size).toBe(0);
    expect(api.tags.getAll).not.toHaveBeenCalled();
  });

  it("maps requested names to existing tag ids without creating duplicates", async () => {
    const api = fakeTagsApi([{ id: 7, name: "shared" }]);
    const resolved = await resolveTagIds(api, ["shared"]);
    expect(resolved.get("shared")).toBe(7);
    expect(api.tags.create).not.toHaveBeenCalled();
  });

  it("creates any tag that doesn't already exist", async () => {
    const api = fakeTagsApi([{ id: 7, name: "shared" }]);
    const resolved = await resolveTagIds(api, ["shared", "groceries"]);
    expect(resolved.get("shared")).toBe(7);
    expect(resolved.get("groceries")).toBe(8);
    expect(api.tags.create).toHaveBeenCalledTimes(1);
    expect(api.tags.create).toHaveBeenCalledWith({ name: "groceries" });
  });

  it("doesn't create the same missing tag twice within one call", async () => {
    const api = fakeTagsApi([]);
    const resolved = await resolveTagIds(api, ["shared", "shared"]);
    expect(resolved.get("shared")).toBeDefined();
    expect(api.tags.create).toHaveBeenCalledTimes(1);
  });
});
