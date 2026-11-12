import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadDotenvFromCwd } from "./load-dotenv.js";

describe("loadDotenvFromCwd", () => {
  const originalCwd = process.cwd();
  let tempDir: string | undefined;
  const originalKey = process.env["LUNCH_MONEY_API_KEY"];

  afterEach(async () => {
    process.chdir(originalCwd);
    if (tempDir) {
      await import("node:fs/promises").then(({ rm }) => rm(tempDir!, { recursive: true, force: true }));
      tempDir = undefined;
    }
    if (originalKey === undefined) {
      delete process.env["LUNCH_MONEY_API_KEY"];
    } else {
      process.env["LUNCH_MONEY_API_KEY"] = originalKey;
    }
  });

  it("loads variables when .env exists", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "lm-dotenv-"));
    await writeFile(path.join(tempDir, ".env"), "LUNCH_MONEY_API_KEY=loaded_from_file\n", "utf8");
    await chmod(path.join(tempDir, ".env"), 0o600);
    delete process.env["LUNCH_MONEY_API_KEY"];
    process.chdir(tempDir);
    loadDotenvFromCwd();
    expect(process.env["LUNCH_MONEY_API_KEY"]).toBe("loaded_from_file");
  });
});
