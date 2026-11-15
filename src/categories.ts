import { chmod, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { runCliModuleMain } from "./shared/cli-main.js";
import { runCategoriesCli } from "./categories/run-categories-cli.js";
import type { SetupFilesystem } from "./setup/types.js";

const liveFilesystem: SetupFilesystem = {
  exists: existsSync,
  readText(path) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  },
  writeText: (path, content) => writeFile(path, content, "utf8"),
  chmod,
};

runCliModuleMain(async () => {
  try {
    await runCategoriesCli(process.argv.slice(2), { filesystem: liveFilesystem });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}, import.meta.url);