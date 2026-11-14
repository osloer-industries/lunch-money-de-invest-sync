import { afterEach, beforeEach } from "vitest";
import {
  MemoryLunchMoneyApiKeyStore,
  setDefaultLunchMoneyApiKeyStoreForTests,
} from "./src/shared/lunch-money-api-key-store.js";

beforeEach(() => {
  setDefaultLunchMoneyApiKeyStoreForTests(new MemoryLunchMoneyApiKeyStore());
  process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
});

afterEach(() => {
  setDefaultLunchMoneyApiKeyStoreForTests(undefined);
  delete process.env["LUNCH_MONEY_API_KEY"];
});