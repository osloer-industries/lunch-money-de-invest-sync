import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  chmodNodePtyDarwinPrebuildHelpers,
  ensureNodePtySpawnHelperExecutable,
} from "./ensure-node-pty-executable.js";

describe("ensureNodePtySpawnHelperExecutable", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("is a no-op off macOS", async () => {
    if (process.platform === "darwin") {
      return;
    }
    await expect(ensureNodePtySpawnHelperExecutable()).resolves.toBeUndefined();
  });

  it("sets the execute bit on darwin prebuild spawn-helper files", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "node-pty-prebuild-"));
    const helper = path.join(tempDir, "prebuilds", "darwin-arm64", "spawn-helper");
    await mkdir(path.dirname(helper), { recursive: true });
    await writeFile(helper, "stub", "utf8");
    await chmod(helper, 0o644);

    await chmodNodePtyDarwinPrebuildHelpers(tempDir);

    expect((await stat(helper)).mode & 0o777).toBe(0o755);
  });
});