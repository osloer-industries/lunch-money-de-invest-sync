import { AsyncEntry } from "@napi-rs/keyring";

export const LUNCH_MONEY_API_KEY_SERVICE = "lunch-money-de-invest-sync";
export const LUNCH_MONEY_API_KEY_ACCOUNT = "lunch-money-api-key";

export interface LunchMoneyApiKeyStore {
  get(): Promise<string | null>;
  set(apiKey: string): Promise<void>;
  delete(): Promise<boolean>;
  has(): Promise<boolean>;
}

function lunchMoneyApiKeyEntry(): AsyncEntry {
  return new AsyncEntry(LUNCH_MONEY_API_KEY_SERVICE, LUNCH_MONEY_API_KEY_ACCOUNT);
}

export class KeyringLunchMoneyApiKeyStore implements LunchMoneyApiKeyStore {
  async get(): Promise<string | null> {
    return lunchMoneyApiKeyEntry().getPassword();
  }

  async set(apiKey: string): Promise<void> {
    await lunchMoneyApiKeyEntry().setPassword(apiKey);
  }

  async delete(): Promise<boolean> {
    return lunchMoneyApiKeyEntry().deletePassword();
  }

  async has(): Promise<boolean> {
    const stored = await this.get();
    return typeof stored === "string" && stored.trim().length > 0;
  }
}

export class MemoryLunchMoneyApiKeyStore implements LunchMoneyApiKeyStore {
  private value: string | null = null;

  async get(): Promise<string | null> {
    return this.value;
  }

  async set(apiKey: string): Promise<void> {
    this.value = apiKey;
  }

  async delete(): Promise<boolean> {
    const had = this.value !== null;
    this.value = null;
    return had;
  }

  async has(): Promise<boolean> {
    return typeof this.value === "string" && this.value.trim().length > 0;
  }
}

let defaultStore: LunchMoneyApiKeyStore | undefined;

export function createDefaultLunchMoneyApiKeyStore(): LunchMoneyApiKeyStore {
  defaultStore ??= new KeyringLunchMoneyApiKeyStore();
  return defaultStore;
}

/** Test hook: replace the process-wide default store (Vitest only). */
export function setDefaultLunchMoneyApiKeyStoreForTests(store: LunchMoneyApiKeyStore | undefined): void {
  defaultStore = store;
}