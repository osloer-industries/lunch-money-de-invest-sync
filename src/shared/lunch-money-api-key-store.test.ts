import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDefaultLunchMoneyApiKeyStore,
  MemoryLunchMoneyApiKeyStore,
  setDefaultLunchMoneyApiKeyStoreForTests,
} from "./lunch-money-api-key-store.js";

describe("createDefaultLunchMoneyApiKeyStore", () => {
  const original = process.env.LM_MEMORY_API_KEY_STORE;

  beforeEach(() => {
    setDefaultLunchMoneyApiKeyStoreForTests(undefined);
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.LM_MEMORY_API_KEY_STORE;
    } else {
      process.env.LM_MEMORY_API_KEY_STORE = original;
    }
    setDefaultLunchMoneyApiKeyStoreForTests(undefined);
  });

  it("uses the in-memory store when LM_MEMORY_API_KEY_STORE is set", async () => {
    process.env.LM_MEMORY_API_KEY_STORE = "1";
    const store = createDefaultLunchMoneyApiKeyStore();
    await store.set("lm_memory_key");
    expect(await store.get()).toBe("lm_memory_key");
    expect(store).toBeInstanceOf(MemoryLunchMoneyApiKeyStore);
  });
});