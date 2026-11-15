import path from "node:path";
import { parseJsonText } from "../shared/config.js";
import {
  CONFIG_JSON_BACKUP_FILENAME,
  CORRUPT_CONFIG_JSON_MESSAGE,
} from "../shared/config-cli-errors.js";
import type { SetupFilesystem, SetupPrompter } from "./types.js";
import { statusOk, statusWarn } from "./setup-status.js";

const CONFIG_FILENAME = "config.json";

export function configJsonPath(cwd: string = process.cwd()): string {
  return path.join(cwd, CONFIG_FILENAME);
}

export function isConfigJsonUnreadable(filesystem: SetupFilesystem, cwd = process.cwd()): boolean {
  const configPath = configJsonPath(cwd);
  if (!filesystem.exists(configPath)) {
    return false;
  }
  const text = filesystem.readText(configPath);
  if (text === null) {
    return true;
  }
  try {
    const parsed = parseJsonText(text);
    return typeof parsed !== "object" || parsed === null || Array.isArray(parsed);
  } catch {
    return true;
  }
}

export async function backupConfigJsonToBak(
  filesystem: SetupFilesystem,
  cwd = process.cwd(),
): Promise<string> {
  const configPath = configJsonPath(cwd);
  const backupPath = path.join(cwd, CONFIG_JSON_BACKUP_FILENAME);
  const snapshot = filesystem.readText(configPath) ?? "";
  await filesystem.writeText(backupPath, snapshot);
  await filesystem.writeText(
    configPath,
    `${JSON.stringify({ tradeRepublicProfiles: [], scalableCapitalProfiles: [], sharedCardLast4: [] }, null, 2)}\n`,
  );
  return backupPath;
}

export async function ensureReadableConfigForSetup(
  filesystem: SetupFilesystem,
  prompter: SetupPrompter,
  cwd = process.cwd(),
): Promise<void> {
  if (!isConfigJsonUnreadable(filesystem, cwd)) {
    return;
  }
  prompter.print(statusWarn(CORRUPT_CONFIG_JSON_MESSAGE));
  const proceed = await prompter.confirm(
    `Back up the current file to ${CONFIG_JSON_BACKUP_FILENAME} and start with empty broker settings?`,
    true,
  );
  if (!proceed) {
    throw new Error("Setup stopped — saved settings could not be read");
  }
  const backupPath = await backupConfigJsonToBak(filesystem, cwd);
  prompter.print(statusOk(`Backed up to ${path.basename(backupPath)} and started fresh`));
}