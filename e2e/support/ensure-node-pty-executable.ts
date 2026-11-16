import { access, chmod } from "node:fs/promises";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

const SPAWN_HELPER_REL_PATHS = [
  path.join("prebuilds", "darwin-arm64", "spawn-helper"),
  path.join("prebuilds", "darwin-x64", "spawn-helper"),
] as const;

export async function chmodNodePtyDarwinPrebuildHelpers(packageDir: string): Promise<void> {
  await Promise.all(
    SPAWN_HELPER_REL_PATHS.map(async (rel) => {
      const helper = path.join(packageDir, rel);
      try {
        await access(helper, constants.F_OK);
      } catch {
        return;
      }
      await chmod(helper, 0o755);
    }),
  );
}

/**
 * node-pty v1.1.0 publishes darwin spawn-helper without the execute bit (microsoft/node-pty#850).
 * posix_spawnp then fails on macOS even though `npm rebuild` leaves the prebuild helper at 0644.
 */
export async function ensureNodePtySpawnHelperExecutable(): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }

  let packageDir: string;
  try {
    packageDir = path.dirname(require.resolve("node-pty/package.json"));
  } catch {
    throw new Error("node-pty is not installed — run npm ci before test:e2e");
  }

  await chmodNodePtyDarwinPrebuildHelpers(packageDir);
}