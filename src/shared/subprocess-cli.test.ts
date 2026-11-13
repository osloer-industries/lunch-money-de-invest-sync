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

import {
  CliExecutableNotFoundError,
  SubprocessTimeoutError,
  buildCliSpawnEnv,
  createPytrCliRunner,
  createScCliRunner,
  resolvePytrExecutable,
  resolveScExecutable,
  trustedSearchDirs,
} from "./subprocess-cli.js";

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

describe("trustedSearchDirs", () => {
  it("includes LM_CLI_EXTRA_SEARCH_DIR when absolute", () => {
    const previous = process.env.LM_CLI_EXTRA_SEARCH_DIR;
    process.env.LM_CLI_EXTRA_SEARCH_DIR = "/opt/custom/bin";
    try {
      expect(trustedSearchDirs()).toContain("/opt/custom/bin");
    } finally {
      if (previous === undefined) {
        delete process.env.LM_CLI_EXTRA_SEARCH_DIR;
      } else {
        process.env.LM_CLI_EXTRA_SEARCH_DIR = previous;
      }
    }
  });

  it("ignores non-absolute LM_CLI_EXTRA_SEARCH_DIR", () => {
    const previous = process.env.LM_CLI_EXTRA_SEARCH_DIR;
    process.env.LM_CLI_EXTRA_SEARCH_DIR = "relative/bin";
    try {
      expect(trustedSearchDirs()).not.toContain("relative/bin");
    } finally {
      if (previous === undefined) {
        delete process.env.LM_CLI_EXTRA_SEARCH_DIR;
      } else {
        process.env.LM_CLI_EXTRA_SEARCH_DIR = previous;
      }
    }
  });
});

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
    expect(spawnOptions.env.PATH).toContain("/usr/bin");
    expect(spawnOptions.env.PATH).not.toBe(process.env.PATH);
  });

  it("resolves a relative binary name to an absolute path under trusted dirs", () => {
    existsSyncMock.mockImplementation((p) => p === "/usr/bin/sc");
    expect(resolveScExecutable("sc")).toBe("/usr/bin/sc");
    expect(resolveScExecutable("/opt/custom/sc")).toBe("/opt/custom/sc");
  });

  it("rejects when the subprocess exceeds the timeout", async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: mockStreams(),
      stderr: mockStreams(),
      kill: vi.fn(),
    });
    spawnMock.mockReturnValueOnce(child);
    const runner = createScCliRunner("/usr/bin/sc");
    await expect(runner.run(["broker", "transactions"], undefined, { timeoutMs: 5 })).rejects.toBeInstanceOf(
      SubprocessTimeoutError,
    );
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
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

  it("throws when the launcher cannot be resolved", () => {
    existsSyncMock.mockReturnValue(false);
    expect(() => resolvePytrExecutable(["missing-launcher"])).toThrow(CliExecutableNotFoundError);
  });

  it("passes through allowlisted environment keys", async () => {
    const previousUv = process.env.UV_PYTHON;
    const previousTmp = process.env.TMPDIR;
    process.env.UV_PYTHON = "/tmp/uv-python";
    process.env.TMPDIR = "/tmp";
    mockChild("", "", 0);
    try {
      const runner = createPytrCliRunner(["/usr/bin/pytr"]);
      await runner.run(["export_transactions"]);
      const spawnOptions = spawnMock.mock.calls[0]?.[2] as { env: Record<string, string> };
      expect(spawnOptions.env.UV_PYTHON).toBe("/tmp/uv-python");
      expect(spawnOptions.env.TMPDIR).toBe("/tmp");
    } finally {
      if (previousUv === undefined) {
        delete process.env.UV_PYTHON;
      } else {
        process.env.UV_PYTHON = previousUv;
      }
      if (previousTmp === undefined) {
        delete process.env.TMPDIR;
      } else {
        process.env.TMPDIR = previousTmp;
      }
    }
  });

  it("includes home .local/bin in PATH for spawn env", () => {
    const previousHome = process.env.HOME;
    process.env.HOME = "/home/example-operator";
    try {
      const env = buildCliSpawnEnv(undefined, { executablePath: "/usr/bin/pytr" });
      expect(env.PATH).toContain("/home/example-operator/.local/bin");
    } finally {
      process.env.HOME = previousHome;
    }
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
