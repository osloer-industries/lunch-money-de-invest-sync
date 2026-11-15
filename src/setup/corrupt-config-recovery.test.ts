import { describe, expect, it, vi } from "vitest";
import {
  backupConfigJsonToBak,
  ensureReadableConfigForSetup,
  isConfigJsonUnreadable,
} from "./corrupt-config-recovery.js";
import { CONFIG_JSON_BACKUP_FILENAME } from "../shared/config-cli-errors.js";
import type { SetupFilesystem, SetupPrompter } from "./types.js";

function fakeFs(files: Map<string, string>): SetupFilesystem {
  return {
    exists: (p) => files.has(p),
    readText: (p) => files.get(p) ?? null,
    writeText: vi.fn((p, body) => {
      files.set(p, body);
      return Promise.resolve();
    }),
    chmod: vi.fn(() => Promise.resolve()),
  };
}

describe("corrupt config recovery", () => {
  it("detects invalid JSON", () => {
    const files = new Map([["/tmp/config.json", "not-json"]]);
    expect(isConfigJsonUnreadable(fakeFs(files), "/tmp")).toBe(true);
  });

  it("backs up and resets broker profiles", async () => {
    const files = new Map([["/repo/config.json", "{broken"]]);
    const fs = fakeFs(files);
    const backupPath = await backupConfigJsonToBak(fs, "/repo");
    expect(backupPath).toContain(CONFIG_JSON_BACKUP_FILENAME);
    expect(files.get("/repo/config.json")).toContain("tradeRepublicProfiles");
    expect(files.get(backupPath)).toBe("{broken");
  });

  it("offers recovery when config is unreadable", async () => {
    const cwd = "/repo";
    const files = new Map([[`${cwd}/config.json`, "{"]]);
    const fs = fakeFs(files);
    const prompter: SetupPrompter = {
      password: vi.fn(),
      input: vi.fn(),
      select: vi.fn(),
      checkbox: vi.fn(),
      search: vi.fn(),
      confirm: vi.fn(() => Promise.resolve(true)),
      print: vi.fn(),
      waitForEnter: vi.fn(),
    };
    await ensureReadableConfigForSetup(fs, prompter, cwd);
    expect(fs.writeText).toHaveBeenCalled();
  });
});