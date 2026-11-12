import { parseJsonText } from "../shared/config.js";
import { parseStoredMaps } from "../shared/config-maps.js";
import type { SetupFilesystem } from "./types.js";

const CONFIG_FILENAME = "config.json";

export function readConfigJsonObject(
  filesystem: SetupFilesystem,
  configPath: string,
): Record<string, unknown> {
  const existingText = filesystem.exists(configPath) ? (filesystem.readText(configPath) ?? "{}") : "{}";
  const parsed = parseJsonText(existingText);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${CONFIG_FILENAME} must be a JSON object`);
  }
  return { ...parsed };
}

export async function writeConfigJsonObject(
  filesystem: SetupFilesystem,
  configPath: string,
  merged: Record<string, unknown>,
): Promise<void> {
  await filesystem.writeText(configPath, `${JSON.stringify(merged, null, 2)}\n`);
}

export function storedMapsFromConfigObject(parsed: Record<string, unknown>) {
  return parseStoredMaps(parsed);
}
