import { describe, expect, it, vi } from "vitest";
import { runDoctor, runDoctorCli } from "./doctor.js";

describe("runDoctor", () => {
  it("reports missing node_modules", async () => {
    const result = await runDoctor({
      nodeVersion: "v24.0.0",
      exists: () => false,
      createPytrRunner: () => ({
        run: vi.fn().mockResolvedValue({ stdout: "pytr 0.4.10", stderr: "", exitCode: 0 }),
      }),
      createScRunner: () => ({
        run: vi.fn().mockResolvedValue({ stdout: "sc 1.0.0", stderr: "", exitCode: 0 }),
      }),
    });
    expect(result.checks.some((c) => c.name === "npm-ci" && !c.ok)).toBe(true);
  });

  it("passes when core checks succeed", async () => {
    const result = await runDoctor({
      nodeVersion: "v24.0.0",
      platform: "linux",
      exists: (p) =>
        p.includes("node_modules") || p.endsWith("/uv") || p.endsWith("/pytr") || p.endsWith("/uvx"),
      createPytrRunner: () => ({
        run: vi.fn().mockResolvedValue({ stdout: "pytr 0.4.10", stderr: "", exitCode: 0 }),
      }),
      createScRunner: () => ({
        run: vi.fn().mockResolvedValue({ stdout: "sc 1.0.0", stderr: "", exitCode: 0 }),
      }),
    });
    expect(result.ok).toBe(true);
  });

  it("exits non-zero from CLI when checks fail", async () => {
    const logger = vi.fn();
    await expect(
      runDoctorCli([], {
        nodeVersion: "v22.0.0",
        exists: () => false,
        logger,
        createPytrRunner: () => ({ run: vi.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 1 }) }),
        createScRunner: () => ({ run: vi.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 1 }) }),
      }),
    ).rejects.toThrow(/doctor found issues/);
    expect(logger).toHaveBeenCalledWith(expect.stringMatching(/^ {2}→ /));
  });
});
