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
} {
  const configPath = path.join(process.cwd(), CONFIG_FILENAME);
  if (!filesystem.exists(configPath)) {
    return { tradeRepublicProfiles: [], scalableCapitalProfiles: [] };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = readConfigJsonObject(filesystem, configPath);
  } catch {
    return { tradeRepublicProfiles: [], scalableCapitalProfiles: [] };
  }
  const resumed = resumedConfigSchema.safeParse(parsed);
  if (!resumed.success) {
    return { tradeRepublicProfiles: [], scalableCapitalProfiles: [] };
  }
  return {
    tradeRepublicProfiles: resumed.data.tradeRepublicProfiles ?? [],
    scalableCapitalProfiles: resumed.data.scalableCapitalProfiles ?? [],
  };
}
