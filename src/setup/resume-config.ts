import path from "node:path";
import { readConfigJsonObject } from "./config-json.js";
import { syncConfigSchema } from "../shared/config.js";
import type { ScalableCapitalProfile, TradeRepublicProfile } from "../shared/config.js";
import type { SetupFilesystem } from "./types.js";

const CONFIG_FILENAME = "config.json";
const resumedConfigSchema = syncConfigSchema.omit({ lunchMoneyApiKey: true }).partial();

export function readResumedProfiles(filesystem: SetupFilesystem): {
  tradeRepublicProfiles: TradeRepublicProfile[];
  scalableCapitalProfiles: ScalableCapitalProfile[];
  sharedCardLast4: string[];
} {
  const configPath = path.join(process.cwd(), CONFIG_FILENAME);
  if (!filesystem.exists(configPath)) {
    return { tradeRepublicProfiles: [], scalableCapitalProfiles: [], sharedCardLast4: [] };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = readConfigJsonObject(filesystem, configPath);
  } catch {
    return { tradeRepublicProfiles: [], scalableCapitalProfiles: [], sharedCardLast4: [] };
  }
  const resumed = resumedConfigSchema.safeParse(parsed);
  if (!resumed.success) {
    return { tradeRepublicProfiles: [], scalableCapitalProfiles: [], sharedCardLast4: [] };
  }
  return {
    tradeRepublicProfiles: resumed.data.tradeRepublicProfiles ?? [],
    scalableCapitalProfiles: resumed.data.scalableCapitalProfiles ?? [],
    sharedCardLast4: resumed.data.sharedCardLast4 ?? [],
  };
}
