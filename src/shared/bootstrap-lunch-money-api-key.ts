import path from "node:path";
import { MISSING_LUNCH_MONEY_API_KEY_MESSAGE } from "./config-cli-errors.js";
import { readApiKeyFromDotenvText } from "./dotenv-api-key.js";
import type { LunchMoneyApiKeyStore } from "./lunch-money-api-key-store.js";
import { createDefaultLunchMoneyApiKeyStore } from "./lunch-money-api-key-store.js";
import { existsSync, readFileSync } from "node:fs";

export function lunchMoneyApiKeyConfiguredInProcessEnv(): boolean {
  const fromEnv = process.env["LUNCH_MONEY_API_KEY"]?.trim() ?? "";
  return fromEnv.length > 0;
}

function applyApiKeyToProcessEnv(apiKey: string): void {
  process.env["LUNCH_MONEY_API_KEY"] = apiKey;
}

async function migratePlaintextDotenvToStore(store: LunchMoneyApiKeyStore): Promise<boolean> {
  const dotenvPath = path.join(process.cwd(), ".env");
  if (!existsSync(dotenvPath)) {
    return false;
  }
  let text: string;
  try {
    text = readFileSync(dotenvPath, "utf8");
  } catch {
    return false;
  }
  const fromFile = readApiKeyFromDotenvText(text);
  if (!fromFile) {
    return false;
  }
  if (!(await store.has())) {
    await store.set(fromFile);
  }
  const { chmod, writeFile } = await import("node:fs/promises");
  const stripped = text
    .split("\n")
    .filter((line) => !line.trim().startsWith("LUNCH_MONEY_API_KEY="))
    .join("\n");
  let body: string;
  if (stripped.length === 0) {
    body = "";
  } else if (stripped.endsWith("\n")) {
    body = stripped;
  } else {
    body = `${stripped}\n`;
  }
  await writeFile(dotenvPath, body, "utf8");
  if (body.length > 0) {
    await chmod(dotenvPath, 0o600);
  }
  return true;
}

/**
 * Ensures `process.env.LUNCH_MONEY_API_KEY` is set from the OS credential store when absent.
 * Plaintext keys in `.env` are migrated into the store once and removed from the file.
 */
export async function bootstrapLunchMoneyApiKey(
  store: LunchMoneyApiKeyStore = createDefaultLunchMoneyApiKeyStore(),
): Promise<void> {
  if (lunchMoneyApiKeyConfiguredInProcessEnv()) {
    return;
  }
  const stored = await store.get();
  if (stored && stored.trim().length > 0) {
    applyApiKeyToProcessEnv(stored.trim());
    return;
  }
  if (await migratePlaintextDotenvToStore(store)) {
    const migrated = await store.get();
    if (migrated && migrated.trim().length > 0) {
      applyApiKeyToProcessEnv(migrated.trim());
      return;
    }
  }
}

export async function clearStoredLunchMoneyApiKey(
  store: LunchMoneyApiKeyStore = createDefaultLunchMoneyApiKeyStore(),
): Promise<boolean> {
  return store.delete();
}

export function requireLunchMoneyApiKeyInProcessEnv(): void {
  if (!lunchMoneyApiKeyConfiguredInProcessEnv()) {
    throw new Error(MISSING_LUNCH_MONEY_API_KEY_MESSAGE);
  }
}

export async function ensureLunchMoneyApiKeyForCli(
  store: LunchMoneyApiKeyStore = createDefaultLunchMoneyApiKeyStore(),
): Promise<void> {
  await bootstrapLunchMoneyApiKey(store);
  requireLunchMoneyApiKeyInProcessEnv();
}

export { stripApiKeyFromDotenvFile } from "./dotenv-api-key.js";