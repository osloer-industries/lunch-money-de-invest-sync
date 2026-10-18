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
export function readConfigFromDisk(configPath = "config.json"): SyncConfig {
  const fileContents: unknown = JSON.parse(readFileSync(configPath, "utf-8"));
  if (typeof fileContents !== "object" || fileContents === null || Array.isArray(fileContents)) {
    throw new Error(`${configPath} must contain a JSON object`);
  }
  return loadConfig(
    Object.assign({}, fileContents, {
      lunchMoneyApiKey: process.env["LUNCH_MONEY_API_KEY"],
    }),
  );
}
