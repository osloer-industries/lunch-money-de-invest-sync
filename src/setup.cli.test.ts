import { describe, expect, it, vi } from "vitest";
import { runSetupCli } from "./setup.js";

vi.mock("./setup/run-setup.js", () => ({
  runSetup: vi.fn().mockResolvedValue({ kind: "completed" }),
}));

describe("runSetupCli", () => {
  it("prints help text", async () => {
    const logger = vi.fn();
    await runSetupCli(["--help"], { logger });
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("npm run setup"));
  });
});
