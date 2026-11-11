import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createScCliRunner } from "./sc-cli.js";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

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
  });

  it("spawns the binary with argv and returns stdout", async () => {
    mockChild('{"ok":true}', "", 0);
    const runner = createScCliRunner("/usr/bin/sc");
    const result = await runner.run(["broker", "transactions", "--json"], { SC_CONFIG_DIR: "/tmp/sc" });
    expect(result).toEqual({ stdout: '{"ok":true}', stderr: "", exitCode: 0 });
    expect(spawnMock).toHaveBeenCalledWith(
      "/usr/bin/sc",
      ["broker", "transactions", "--json"],
      expect.objectContaining({
        env: expect.objectContaining({ SC_CONFIG_DIR: "/tmp/sc" }),
      }),
    );
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
    const runner = createScCliRunner("sc");
    await expect(runner.run(["broker", "transactions", "--json"])).rejects.toBe(spawnError);
  });
});
