import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());
const existsSyncMock = vi.hoisted(() => vi.fn<typeof import("node:fs").existsSync>());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: existsSyncMock,
  };
});

import { createPytrCliRunner, resolvePytrExecutable } from "./pytr-cli.js";

function mockStreams() {
  return Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
}

function mockChild(stdoutText: string, stderrText: string, exitCode: number) {
  const stdout = mockStreams();
  const stderr = mockStreams();
  const child = Object.assign(new EventEmitter(), { stdout, stderr });
  spawnMock.mockReturnValueOnce(child);
  queueMicrotask(() => {
    if (stdoutText) stdout.emit("data", stdoutText);
    if (stderrText) stderr.emit("data", stderrText);
    child.emit("close", exitCode);
  });
  return child;
}

describe("createPytrCliRunner", () => {
  afterEach(() => {
    spawnMock.mockReset();
    existsSyncMock.mockReset();
  });

  it("spawns the resolved launcher with subcommand argv", async () => {
    existsSyncMock.mockImplementation((p) => p === "/usr/bin/uvx");
    mockChild("", "", 0);
    const runner = createPytrCliRunner(["uvx", "pytr"]);
    await runner.run(["export_transactions", "--outputdir", "/tmp/out"]);
    expect(spawnMock).toHaveBeenCalledWith(
      "/usr/bin/uvx",
      ["pytr", "export_transactions", "--outputdir", "/tmp/out"],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }),
    );
  });

  it("passes child env overrides to spawn", async () => {
    mockChild("", "", 0);
    const runner = createPytrCliRunner(["/usr/bin/pytr"]);
    await runner.run(["export_transactions"], { HOME: "/tmp/home" });
    const spawnOptions = spawnMock.mock.calls[0]?.[2] as { env: Record<string, string> };
    expect(spawnOptions.env.HOME).toBe("/tmp/home");
  });

  it("rejects an empty pytrCommand array", () => {
    expect(() => resolvePytrExecutable([])).toThrow(/at least one argv/);
  });

  it("resolves a relative binary name to an absolute path under trusted dirs", () => {
    existsSyncMock.mockImplementation((p) => p === "/usr/bin/pytr");
    expect(resolvePytrExecutable(["pytr"])).toEqual(["/usr/bin/pytr"]);
    expect(resolvePytrExecutable(["/opt/custom/pytr"])).toEqual(["/opt/custom/pytr"]);
  });

  it("surfaces spawn failures to the caller", async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: mockStreams(),
      stderr: mockStreams(),
    });
    spawnMock.mockReturnValueOnce(child);
    const spawnError = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    queueMicrotask(() => {
      child.emit("error", spawnError);
    });
    const runner = createPytrCliRunner(["/usr/bin/pytr"]);
    await expect(runner.run(["export_transactions"])).rejects.toBe(spawnError);
  });
});
