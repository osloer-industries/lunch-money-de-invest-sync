import { readFileSync } from "node:fs";
import { z } from "zod";

const tradeRepublicProfileSchema = z.object({
  owner: z.string().min(1),
  phoneNumber: z.string().min(1),
  pin: z.string().min(1),
  lunchMoneyAssetId: z.number().int().positive(),
});

const scalableCapitalProfileSchema = z.object({
  owner: z.string().min(1),
  /** Base URL of the local auth proxy (e.g. http://localhost:8000). */
  proxyUrl: z.string().url(),
  proxyToken: z.string().min(1).optional(),
  lunchMoneyAssetId: z.number().int().positive(),
});

export const syncConfigSchema = z.object({
  lunchMoneyApiKey: z.string().min(1),
  /** Last 4 digits of cards shared between household members; matching spend gets a "shared" tag. */
  sharedCardLast4: z.array(z.string().length(4)).default([]),
  tradeRepublicProfiles: z.array(tradeRepublicProfileSchema).default([]),
  scalableCapitalProfiles: z.array(scalableCapitalProfileSchema).default([]),
});

export type SyncConfig = z.infer<typeof syncConfigSchema>;
export type TradeRepublicProfile = z.infer<typeof tradeRepublicProfileSchema>;
export type ScalableCapitalProfile = z.infer<typeof scalableCapitalProfileSchema>;

/** Pure parse/validate step, independent of where the raw config came from. */
export function loadConfig(raw: unknown): SyncConfig {
  return syncConfigSchema.parse(raw);
}

/**
 * Reads config.json (profiles: not a secret by itself, but gitignored since it carries
 * asset ids and phone numbers) plus LUNCH_MONEY_API_KEY from the environment.
 */
function parseJsonFile(configPath: string): unknown {
  const text = readFileSync(configPath, "utf-8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${configPath} contains invalid JSON`);
  }
}

/** Fields allowed in config.json on disk (API key comes from the environment). */
const configFileSchema = syncConfigSchema.omit({ lunchMoneyApiKey: true }).partial();

export function readConfigFromDisk(configPath = "config.json"): SyncConfig {
  const parsed = parseJsonFile(configPath);
  const fromFile = configFileSchema.parse(parsed);
  return loadConfig({
    ...fromFile,
    lunchMoneyApiKey: process.env["LUNCH_MONEY_API_KEY"],
  });
}
