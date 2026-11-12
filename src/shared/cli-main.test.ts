import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { runCliModuleMain } from "./cli-main.js";

describe("runCliModuleMain", () => {
  it("runs main when argv[1] resolves to the module path", async () => {
    const main = vi.fn().mockResolvedValue(undefined);
    const modulePath = fileURLToPath(import.meta.url);
    const originalArgv = process.argv[1];
    Reflect.set(process.argv, 1, modulePath);
    try {
      runCliModuleMain(main, import.meta.url);
      await vi.waitFor(() => expect(main).toHaveBeenCalledOnce());
    } finally {
      Reflect.set(process.argv, 1, originalArgv);
    }
  });

  it("skips main when argv[1] points elsewhere", () => {
    const main = vi.fn();
    const originalArgv = process.argv[1];
    Reflect.set(process.argv, 1, path.join(process.cwd(), "other-entry.js"));
    try {
      runCliModuleMain(main, import.meta.url);
      expect(main).not.toHaveBeenCalled();
    } finally {
      Reflect.set(process.argv, 1, originalArgv);
    }
  });
});
