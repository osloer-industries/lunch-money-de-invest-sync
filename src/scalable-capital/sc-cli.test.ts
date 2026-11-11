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

import { createScCliRunner, resolveScExecutable } from "./sc-cli.js";

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

describe("createScCliRunner", () => {
  afterEach(() => {
    spawnMock.mockReset();
    existsSyncMock.mockReset();
  });

  it("spawns the binary with argv and returns stdout", async () => {
    mockChild('{"ok":true}', "", 0);
    const runner = createScCliRunner("/usr/bin/sc");
    const result = await runner.run(["broker", "transactions", "--json"], { SC_CONFIG_DIR: "/tmp/sc" });
    expect(result).toEqual({ stdout: '{"ok":true}', stderr: "", exitCode: 0 });
    const spawnOptions = spawnMock.mock.calls[0]?.[2] as { env: Record<string, string> };
    expect(spawnMock).toHaveBeenCalledWith("/usr/bin/sc", ["broker", "transactions", "--json"], expect.any(Object));
    expect(spawnOptions.env.SC_CONFIG_DIR).toBe("/tmp/sc");
    expect(spawnOptions.env.PATH).toBeUndefined();
  });

  it("resolves a relative binary name to an absolute path under trusted dirs", () => {
    existsSyncMock.mockImplementation((p) => p === "/usr/bin/sc");
    expect(resolveScExecutable("sc")).toBe("/usr/bin/sc");
    expect(resolveScExecutable("/opt/custom/sc")).toBe("/opt/custom/sc");
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
    const runner = createScCliRunner("/usr/bin/sc");
    await expect(runner.run(["broker", "transactions", "--json"])).rejects.toBe(spawnError);
  });
});
