import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  API_KEY_STORE_ENV,
  createDefaultLunchMoneyApiKeyStore,
  disabledLunchMoneyApiKeyStore,
  formatKeychainAccessError,
  MemoryLunchMoneyApiKeyStore,
  setDefaultLunchMoneyApiKeyStoreForTests,
} from "./lunch-money-api-key-store.js";

describe("formatKeychainAccessError", () => {
  it("includes plain-language guidance without stack traces", () => {
    const error = formatKeychainAccessError("reading the Lunch Money API key", new Error("access denied"));
    expect(error.message).toMatch(/keychain/i);
    expect(error.message).toMatch(/--replace-api-key/);
    expect(error.message).toContain("access denied");
  });
});

describe("createDefaultLunchMoneyApiKeyStore", () => {
  const previousDisabled = process.env[API_KEY_STORE_ENV];
  const previousMemory = process.env.LM_MEMORY_API_KEY_STORE;

  beforeEach(() => {
    setDefaultLunchMoneyApiKeyStoreForTests(undefined);
  });

  afterEach(() => {
    if (previousDisabled === undefined) {
      delete process.env[API_KEY_STORE_ENV];
    } else {
      process.env[API_KEY_STORE_ENV] = previousDisabled;
    }
    if (previousMemory === undefined) {
      delete process.env.LM_MEMORY_API_KEY_STORE;
    } else {
      process.env.LM_MEMORY_API_KEY_STORE = previousMemory;
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

  it("returns a store that never touches the OS keychain when disabled", async () => {
    process.env[API_KEY_STORE_ENV] = "none";
    const store = createDefaultLunchMoneyApiKeyStore();
    expect(store).toBe(disabledLunchMoneyApiKeyStore);
    await expect(store.get()).resolves.toBeNull();
    await expect(store.has()).resolves.toBe(false);
    await expect(store.delete()).resolves.toBe(false);
    await expect(store.set("lm_test")).rejects.toThrow(/disabled/);
  });
});