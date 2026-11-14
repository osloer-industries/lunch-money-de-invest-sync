import { afterEach, describe, expect, it } from "vitest";
import {
  API_KEY_STORE_ENV,
  createDefaultLunchMoneyApiKeyStore,
  disabledLunchMoneyApiKeyStore,
  formatKeychainAccessError,
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
  const previous = process.env[API_KEY_STORE_ENV];
  afterEach(() => {
    if (previous === undefined) {
      delete process.env[API_KEY_STORE_ENV];
    } else {
      process.env[API_KEY_STORE_ENV] = previous;
    }
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
