import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  assertPytrMinVersion,
  createDefaultPytrCliRunner,
  fetchTradeRepublicTimeline,
  type PytrFilesystem,
} from "./client.js";
import type { PytrCliRunner } from "./pytr-cli.js";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));

async function loadFixture(): Promise<string> {
  return readFile(path.join(fixtureDir, "fixtures", "all_events-sample.json"), "utf8");
}

function fakeRunner(sequence: Array<{ exitCode: number; stdout?: string; stderr?: string }>): PytrCliRunner {
  let call = 0;
  return {
    run: vi.fn(async () => {
      const next = sequence[call];
      call += 1;
      if (!next) {
        throw new Error("unexpected pytr invocation");
      }
      return {
        stdout: next.stdout ?? "",
        stderr: next.stderr ?? "",
        exitCode: next.exitCode,
      };
    }),
  };
}

function fakeFilesystem(fixture: string): PytrFilesystem {
  return {
    mkdtemp: vi.fn().mockResolvedValue("/tmp/lm-tr-sync-test/"),
    readFile: vi.fn().mockResolvedValue(fixture),
    rm: vi.fn().mockResolvedValue(undefined),
  };
}

describe("fetchTradeRepublicTimeline", () => {
  it("runs export_transactions and parses all_events.json", async () => {
    const fixture = await loadFixture();
    const runner = fakeRunner([{ exitCode: 0 }]);
    const filesystem = fakeFilesystem(fixture);

    const events = await fetchTradeRepublicTimeline(runner, {}, filesystem);

    expect(events).toHaveLength(3);
    expect(runner.run).toHaveBeenCalledWith(
      expect.arrayContaining(["export_transactions", "--outputdir", "/tmp/lm-tr-sync-test/"]),
      undefined,
    );
  });

  it("throws a login hint when pytr exits non-zero with credential errors", async () => {
    const runner = fakeRunner([{ exitCode: 1, stderr: "No credentials file found" }]);
    const filesystem = fakeFilesystem("");

    await expect(fetchTradeRepublicTimeline(runner, {}, filesystem)).rejects.toThrow(/pytr login/);
  });

  it("rejects an unexpected JSON shape", async () => {
    const runner = fakeRunner([{ exitCode: 0 }]);
    const filesystem = fakeFilesystem("[{}]");

    await expect(fetchTradeRepublicTimeline(runner, {}, filesystem)).rejects.toThrow(
      /didn't match the expected shape/,
    );
  });

  it("passes pytrHome as HOME for the child process", async () => {
    const fixture = await loadFixture();
    const runner = fakeRunner([{ exitCode: 0 }]);
    const filesystem = fakeFilesystem(fixture);

    await fetchTradeRepublicTimeline(
      runner,
      { pytrHome: "/data/operator-a/.pytr", loginV2: true, wafTokenMode: "no-waf", account: "acct-1" },
      filesystem,
    );

    expect(runner.run).toHaveBeenCalledWith(
      expect.arrayContaining(["--v2", "--no-waf-token", "--account", "acct-1"]),
      { HOME: "/data/operator-a" },
    );
  });

  it("rejects an invalid pytrHome path", async () => {
    const runner = fakeRunner([{ exitCode: 0 }]);
    await expect(
      fetchTradeRepublicTimeline(runner, { pytrHome: "/tmp/not-pytr" }, fakeFilesystem("[]")),
    ).rejects.toThrow(/pytrHome must be the absolute path/);
  });

  it("surfaces WAF hints from stderr", async () => {
    const runner = fakeRunner([{ exitCode: 2, stderr: "playwright missing" }]);
    await expect(fetchTradeRepublicTimeline(runner, {}, fakeFilesystem(""))).rejects.toThrow(/WAF/);
  });

  it("surfaces HTTP 426 guidance from stderr", async () => {
    const runner = fakeRunner([{ exitCode: 1, stderr: "CLIENT_VERSION_OUTDATED" }]);
    await expect(fetchTradeRepublicTimeline(runner, {}, fakeFilesystem(""))).rejects.toThrow(/426/);
  });

  it("rejects empty all_events.json", async () => {
    const runner = fakeRunner([{ exitCode: 0 }]);
    await expect(fetchTradeRepublicTimeline(runner, {}, fakeFilesystem("   "))).rejects.toThrow(/empty/);
  });

  it("rejects invalid JSON in all_events.json", async () => {
    const runner = fakeRunner([{ exitCode: 0 }]);
    await expect(fetchTradeRepublicTimeline(runner, {}, fakeFilesystem("{"))).rejects.toThrow(/not valid JSON/);
  });

  it("wraps a missing pytr binary as an actionable install error", async () => {
    const runner: PytrCliRunner = {
      run: vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
    };
    await expect(fetchTradeRepublicTimeline(runner, {}, fakeFilesystem(""))).rejects.toThrow(/was not found/);
  });

  it("mentions missing all_events.json after a zero exit", async () => {
    const runner = fakeRunner([{ exitCode: 0 }]);
    const filesystem: PytrFilesystem = {
      mkdtemp: vi.fn().mockResolvedValue("/tmp/out/"),
      readFile: vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
      rm: vi.fn().mockResolvedValue(undefined),
    };
    await expect(fetchTradeRepublicTimeline(runner, {}, filesystem)).rejects.toThrow(/all_events\.json/);
  });

  it("passes playwright and awswaf flags", async () => {
    const fixture = await loadFixture();
    const runner = fakeRunner([{ exitCode: 0 }]);
    const filesystem = fakeFilesystem(fixture);
    await fetchTradeRepublicTimeline(runner, { wafTokenMode: "playwright" }, filesystem);
    expect(runner.run).toHaveBeenCalledWith(expect.arrayContaining(["--waf-token", "playwright"]), undefined);
    const runner2 = fakeRunner([{ exitCode: 0 }]);
    await fetchTradeRepublicTimeline(runner2, { wafTokenMode: "awswaf" }, filesystem);
    expect(runner2.run).toHaveBeenCalledWith(expect.arrayContaining(["--waf-token", "awswaf"]), undefined);
  });

  it("checks pytrMinVersion before exporting", async () => {
    const fixture = await loadFixture();
    const runner = fakeRunner([
      { exitCode: 0, stdout: "pytr 0.4.10\n" },
      { exitCode: 0 },
    ]);
    const filesystem = fakeFilesystem(fixture);

    await fetchTradeRepublicTimeline(runner, { pytrMinVersion: "0.4.10" }, filesystem);
    expect(runner.run).toHaveBeenCalledTimes(2);
  });
});

describe("createDefaultPytrCliRunner", () => {
  it("defaults to the pytr argv prefix", () => {
    const runner = createDefaultPytrCliRunner({});
    expect(runner.run).toBeTypeOf("function");
  });
});

describe("assertPytrMinVersion", () => {
  it("compares semver strings from pytr -V", async () => {
    const runner = fakeRunner([{ exitCode: 0, stdout: "pytr 0.4.10\n" }]);
    await expect(assertPytrMinVersion(runner, { pytrMinVersion: "0.4.9" })).resolves.toBeUndefined();
  });

  it("fails when pytr is below the configured minimum", async () => {
    const runner = fakeRunner([{ exitCode: 0, stdout: "pytr 0.4.8\n" }]);
    await expect(assertPytrMinVersion(runner, { pytrMinVersion: "0.4.10" })).rejects.toThrow(/below/);
  });

  it("is a no-op when pytrMinVersion is not configured", async () => {
    const runner = fakeRunner([]);
    await expect(assertPytrMinVersion(runner, {})).resolves.toBeUndefined();
    expect(runner.run).not.toHaveBeenCalled();
  });

  it("falls back to --version when -V fails", async () => {
    const runner = fakeRunner([
      { exitCode: 1 },
      { exitCode: 0, stdout: "pytr version 0.4.10" },
    ]);
    await expect(assertPytrMinVersion(runner, { pytrMinVersion: "0.4.10" })).resolves.toBeUndefined();
  });
});
