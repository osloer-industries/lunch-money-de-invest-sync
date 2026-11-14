import { mkdtempSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chdir, cwd } from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapLunchMoneyApiKey, requireLunchMoneyApiKeyInProcessEnv } from "./bootstrap-lunch-money-api-key.js";
import { MemoryLunchMoneyApiKeyStore } from "./lunch-money-api-key-store.js";
import { MISSING_LUNCH_MONEY_API_KEY_MESSAGE } from "./config-cli-errors.js";

describe("bootstrapLunchMoneyApiKey", () => {
  const originalCwd = cwd();
  const originalKey = process.env["LUNCH_MONEY_API_KEY"];

  afterEach(() => {
    chdir(originalCwd);
    if (originalKey === undefined) {
      delete process.env["LUNCH_MONEY_API_KEY"];
    } else {
      process.env["LUNCH_MONEY_API_KEY"] = originalKey;
    }
  });

  it("loads a stored key into the process environment", async () => {
    delete process.env["LUNCH_MONEY_API_KEY"];
    const store = new MemoryLunchMoneyApiKeyStore();
    await store.set("lm_stored_key");
    await bootstrapLunchMoneyApiKey(store);
    expect(process.env["LUNCH_MONEY_API_KEY"]).toBe("lm_stored_key");
  });

  it("migrates plaintext .env keys into the store and removes them from disk", async () => {
    delete process.env["LUNCH_MONEY_API_KEY"];
    const dir = mkdtempSync(path.join(tmpdir(), "lm-dotenv-migrate-"));
    chdir(dir);
    writeFileSync(".env", "LUNCH_MONEY_API_KEY=lm_from_dotenv\n", "utf8");
    chmodSync(".env", 0o600);
    const store = new MemoryLunchMoneyApiKeyStore();
    await bootstrapLunchMoneyApiKey(store);
    expect(await store.get()).toBe("lm_from_dotenv");
    expect(process.env["LUNCH_MONEY_API_KEY"]).toBe("lm_from_dotenv");
    expect(readFileSync(".env", "utf8")).not.toContain("LUNCH_MONEY_API_KEY=");
  });

  it("throws a message without the key when missing", async () => {
    delete process.env["LUNCH_MONEY_API_KEY"];
    expect(() => requireLunchMoneyApiKeyInProcessEnv()).toThrow(MISSING_LUNCH_MONEY_API_KEY_MESSAGE);
    expect(() => requireLunchMoneyApiKeyInProcessEnv()).not.toThrow(/lm_/);
  });
});