import { describe, expect, it, vi } from "vitest";
import { readConfigFromDiskForCli } from "./shared/config.js";
import { runDoctor, runDoctorCli } from "./doctor.js";

vi.mock("./shared/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./shared/config.js")>();
  return {
    ...actual,
    readConfigFromDiskForCli: vi.fn(),
  };
});

const okRunners = {
  createPytrRunner: () => ({
    run: vi.fn().mockResolvedValue({ stdout: "pytr 0.4.10", stderr: "", exitCode: 0 }),
  }),
  createScRunner: () => ({
    run: vi.fn().mockResolvedValue({ stdout: "sc 1.0.0", stderr: "", exitCode: 0 }),
  }),
};

function existsWithUvAndDeps(exists: (path: string) => boolean = () => false): (path: string) => boolean {
  return (p) => exists(p) || p.includes("node_modules") || p.endsWith("/uv") || p.endsWith("/sc");
}

describe("runDoctor", () => {
  it("reports missing node_modules", async () => {
    const result = await runDoctor({
      nodeVersion: "v24.0.0",
      exists: () => false,
      ...okRunners,
    });
    expect(result.checks.some((c) => c.name === "npm-ci" && !c.ok)).toBe(true);
  });

  it("passes when core checks succeed", async () => {
    const result = await runDoctor({
      nodeVersion: "v24.0.0",
      platform: "linux",
      exists: existsWithUvAndDeps(),
      ...okRunners,
    });
    expect(result.ok).toBe(true);
  });

  it("reports invalid Node major version", async () => {
    const result = await runDoctor({
      nodeVersion: "v22.0.0",
      platform: "linux",
      exists: existsWithUvAndDeps(),
      ...okRunners,
    });
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === "node")?.ok).toBe(false);
  });

  it("includes Homebrew check on macOS", async () => {
    const withoutBrew = await runDoctor({
      nodeVersion: "v24.0.0",
      platform: "darwin",
      exists: existsWithUvAndDeps(),
      ...okRunners,
    });
    expect(withoutBrew.checks.some((c) => c.name === "homebrew" && !c.ok)).toBe(true);

    const withBrew = await runDoctor({
      nodeVersion: "v24.0.0",
      platform: "darwin",
      exists: (p) => existsWithUvAndDeps()(p) || p.endsWith("/brew"),
      ...okRunners,
    });
    expect(withBrew.checks.some((c) => c.name === "homebrew" && c.ok)).toBe(true);
  });

  it("reports pytr and sc version failures", async () => {
    const result = await runDoctor({
      nodeVersion: "v24.0.0",
      platform: "linux",
      exists: existsWithUvAndDeps(),
      createPytrRunner: () => ({
        run: vi.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 1 }),
      }),
      createScRunner: () => ({
        run: vi.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 1 }),
      }),
    });
    expect(result.checks.find((c) => c.name === "pytr-version")?.ok).toBe(false);
    expect(result.checks.find((c) => c.name === "sc-version")?.ok).toBe(false);
  });

  it("reports sc missing when runner throws", async () => {
    const result = await runDoctor({
      nodeVersion: "v24.0.0",
      platform: "linux",
      exists: existsWithUvAndDeps(),
      ...okRunners,
      createScRunner: () => ({
        run: vi.fn().mockRejectedValue(new Error("ENOENT")),
      }),
    });
    expect(result.checks.find((c) => c.name === "sc-version")?.ok).toBe(false);
  });

  it("validates .env permissions when present", async () => {
    const cwd = process.cwd();
    const loose = await runDoctor({
      nodeVersion: "v24.0.0",
      platform: "linux",
      exists: (p) => p === `${cwd}/.env` || existsWithUvAndDeps()(p),
      stat: async () => ({ mode: 0o644 }),
      ...okRunners,
    });
    expect(loose.checks.find((c) => c.name === "dotenv")?.ok).toBe(false);

    const strict = await runDoctor({
      nodeVersion: "v24.0.0",
      platform: "linux",
      exists: (p) => p === `${cwd}/.env` || existsWithUvAndDeps()(p),
      stat: async () => ({ mode: 0o600 }),
      ...okRunners,
    });
    expect(strict.checks.find((c) => c.name === "dotenv")?.ok).toBe(true);
  });

  it("skips config.json check when file is absent", async () => {
    const result = await runDoctor({
      nodeVersion: "v24.0.0",
      platform: "linux",
      exists: existsWithUvAndDeps(),
      ...okRunners,
    });
    expect(result.checks.some((c) => c.name === "config-json")).toBe(false);
  });

  it("reports missing uv on PATH", async () => {
    const result = await runDoctor({
      nodeVersion: "v24.0.0",
      platform: "linux",
      exists: (p) => p.includes("node_modules"),
      ...okRunners,
    });
    expect(result.checks.find((c) => c.name === "uv")?.ok).toBe(false);
  });

  it("warns when uv is missing but standalone pytr is available", async () => {
    const result = await runDoctor({
      nodeVersion: "v24.0.0",
      platform: "linux",
      exists: (p) => p.includes("node_modules") || p.endsWith("/pytr") || p.endsWith("/sc"),
      ...okRunners,
    });
    const uv = result.checks.find((c) => c.name === "uv");
    expect(uv?.ok).toBe(true);
    expect(uv?.warning).toBe(true);
    expect(uv?.detail).toMatch(/standalone pytr/);
    expect(result.ok).toBe(true);
  });

  it("reads pytr version from stderr when stdout is empty", async () => {
    const result = await runDoctor({
      nodeVersion: "v24.0.0",
      platform: "linux",
      exists: existsWithUvAndDeps(),
      createPytrRunner: () => ({
        run: vi.fn().mockResolvedValue({ stdout: "", stderr: "pytr 0.4.10\n", exitCode: 0 }),
      }),
      createScRunner: okRunners.createScRunner,
    });
    expect(result.checks.find((c) => c.name === "pytr-version")?.detail).toContain("pytr");
  });

  it("falls back when pytr `-V` returns blank output", async () => {
    const result = await runDoctor({
      nodeVersion: "v24.0.0",
      platform: "linux",
      exists: existsWithUvAndDeps(),
      createPytrRunner: () => ({
        run: vi.fn().mockResolvedValue({ stdout: "\n", stderr: "", exitCode: 0 }),
      }),
      createScRunner: okRunners.createScRunner,
    });
    expect(result.checks.find((c) => c.name === "pytr-version")?.detail).toBe("pytr responded to `-V`");
  });

  it("validates config.json profiles and errors", async () => {
    const cwd = process.cwd();
    const mocked = vi.mocked(readConfigFromDiskForCli);

    mocked.mockReturnValue({
      lunchMoneyApiKey: "",
      tradeRepublicProfiles: [{ owner: "a", lunchMoneyAssetId: 1, pytrCommand: ["pytr"] }],
      scalableCapitalProfiles: [],
      sharedCardLast4: [],
      categoryMap: {},
      tagMap: {},
    });
    const ok = await runDoctor({
      nodeVersion: "v24.0.0",
      platform: "linux",
      exists: (p) => p === `${cwd}/config.json` || existsWithUvAndDeps()(p),
      ...okRunners,
    });
    expect(ok.checks.find((c) => c.name === "config-json")?.ok).toBe(true);

    mocked.mockReturnValue({
      lunchMoneyApiKey: "",
      tradeRepublicProfiles: [],
      scalableCapitalProfiles: [],
      sharedCardLast4: [],
      categoryMap: {},
      tagMap: {},
    });
    const empty = await runDoctor({
      nodeVersion: "v24.0.0",
      platform: "linux",
      exists: (p) => p === `${cwd}/config.json` || existsWithUvAndDeps()(p),
      ...okRunners,
    });
    expect(empty.checks.find((c) => c.name === "config-json")?.ok).toBe(false);

    mocked.mockImplementation(() => {
      throw new Error("invalid json");
    });
    const bad = await runDoctor({
      nodeVersion: "v24.0.0",
      platform: "linux",
      exists: (p) => p === `${cwd}/config.json` || existsWithUvAndDeps()(p),
      ...okRunners,
    });
    expect(bad.checks.find((c) => c.name === "config-json")?.ok).toBe(false);
  });
});

describe("runDoctorCli", () => {
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

  it("prints help without running checks", async () => {
    const logger = vi.fn();
    await runDoctorCli(["--help"], { logger });
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("npm run doctor"));
  });

  it("prints ok lines when all checks pass", async () => {
    const logger = vi.fn();
    await runDoctorCli([], {
      nodeVersion: "v24.0.0",
      platform: "linux",
      exists: existsWithUvAndDeps(),
      logger,
      ...okRunners,
    });
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("node:"));
  });

  it("prints a warning and exits successfully when uv is missing but pytr is present", async () => {
    const logger = vi.fn();
    await runDoctorCli([], {
      nodeVersion: "v24.0.0",
      platform: "linux",
      exists: (p) => p.includes("node_modules") || p.endsWith("/pytr") || p.endsWith("/sc"),
      logger,
      ...okRunners,
    });
    expect(logger).toHaveBeenCalledWith(expect.stringMatching(/⚠ uv: .*standalone pytr/));
    expect(logger).toHaveBeenCalledWith(expect.stringMatching(/^ {2}→ /));
  });
});
