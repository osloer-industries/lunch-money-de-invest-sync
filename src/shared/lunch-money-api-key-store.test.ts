import { afterEach, describe, expect, it } from "vitest";
import {
  API_KEY_STORE_ENV,
  createDefaultLunchMoneyApiKeyStore,
  disabledLunchMoneyApiKeyStore,
} from "./lunch-money-api-key-store.js";

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
