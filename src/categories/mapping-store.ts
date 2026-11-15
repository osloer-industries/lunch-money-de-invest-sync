import { readConfigJsonObject, storedMapsFromConfigObject, writeConfigJsonObject } from "../setup/config-json.js";
import { resolveConfigFilePath } from "../shared/config.js";
import type { SetupFilesystem } from "../setup/types.js";
import type { CategoryTagMaps } from "./mapping-mutations.js";

const CONFIG_FILENAME = "config.json";

export function readMapsFromFilesystem(filesystem: SetupFilesystem): CategoryTagMaps {
  const configPath = resolveConfigFilePath(CONFIG_FILENAME);
  const parsed = readConfigJsonObject(filesystem, configPath);
  return storedMapsFromConfigObject(parsed);
}

export async function writeMapsToFilesystem(
  filesystem: SetupFilesystem,
  maps: CategoryTagMaps,
): Promise<string> {
  const configPath = resolveConfigFilePath(CONFIG_FILENAME);
  const parsed = readConfigJsonObject(filesystem, configPath);
  await writeConfigJsonObject(filesystem, configPath, {
    ...parsed,
    categoryMap: maps.categoryMap,
    tagMap: maps.tagMap,
  });
  return configPath;
}