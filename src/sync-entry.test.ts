import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

function runSyncEntry(args: readonly string[], cwd: string, env?: NodeJS.ProcessEnv) {
  const tsx = path.join(repoRoot, "node_modules", ".bin", "tsx");
  return spawnSync(tsx, [path.join(repoRoot, "src/sync.ts"), ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

describe("sync CLI entry", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await import("node:fs/promises").then(({ rm }) => rm(tempDir!, { recursive: true, force: true }));
      tempDir = undefined;
    }
  });

  it("prints help via tsx entry", () => {
    const result = runSyncEntry(["--help"], repoRoot);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/--dry-run/);
  });

  it("exits non-zero with a friendly message when the API key is missing", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "lm-sync-entry-"));
    await writeFile(path.join(tempDir, "config.json"), JSON.stringify({ sharedCardLast4: [] }), "utf8");
    const env = { ...process.env, LUNCH_MONEY_API_KEY: "" };
    const result = runSyncEntry(["--dry-run"], tempDir, env);
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/LUNCH_MONEY_API_KEY is not set/);
  });

  it("loads .env and runs dry-run when config is valid", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "lm-sync-entry-env-"));
    await writeFile(
      path.join(tempDir, "config.json"),
      JSON.stringify({ sharedCardLast4: [], tradeRepublicProfiles: [], scalableCapitalProfiles: [] }),
      "utf8",
    );
    await writeFile(path.join(tempDir, ".env"), "LUNCH_MONEY_API_KEY=lm_test_key_from_dotenv\n", "utf8");
    await chmod(path.join(tempDir, ".env"), 0o600);
    const env = { ...process.env };
    delete env.LUNCH_MONEY_API_KEY;
    const result = runSyncEntry(["--dry-run"], tempDir, env);
    expect(result.status).toBe(0);
    expect(result.stderr).not.toMatch(/ZodError/);
  });
});

describe("sync CLI built entry", () => {
  const built = path.join(repoRoot, "dist", "sync.js");

  beforeAll(() => {
    if (!existsSync(built)) {
      const build = spawnSync("npm", ["run", "build"], { cwd: repoRoot, encoding: "utf8", stdio: "pipe" });
      if (build.status !== 0) {
        throw new Error(`build failed: ${build.stderr}`);
      }
    }
  });

  it("prints help via dist/sync.js when built", () => {
    const result = spawnSync("node", [built, "--help"], { cwd: repoRoot, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/--dry-run/);
  });
});
