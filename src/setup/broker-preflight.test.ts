import { describe, expect, it, vi } from "vitest";
import {
  assertNodeMajorVersion,
  confirmPytrCredentialStorage,
  ensurePytrReady,
  ensureScCliReady,
  parseScPortfolios,
} from "./broker-preflight.js";
import type { SetupPrompter } from "./types.js";

function prompter(): SetupPrompter {
  return {
    password: vi.fn(),
    input: vi.fn(),
    select: vi.fn(),
    checkbox: vi.fn(),
    search: vi.fn(),
    confirm: vi.fn(),
    print: vi.fn(),
    waitForEnter: vi.fn(async () => undefined),
  };
}

describe("assertNodeMajorVersion", () => {
  it("accepts Node 24", () => {
    expect(() => assertNodeMajorVersion("v24.22.3")).not.toThrow();
  });

  it("rejects other majors", () => {
    expect(() => assertNodeMajorVersion("v22.0.0")).toThrow(/Node.js 24/);
  });
});

describe("parseScPortfolios", () => {
  it("throws when stdout is not JSON", () => {
    expect(() => parseScPortfolios("not-json")).toThrow(/not valid JSON/);
  });

  it("throws when the CLI envelope reports failure", () => {
    const stdout = JSON.stringify({ ok: false, command: "broker.portfolios", error: { code: "no_session" } });
    expect(() => parseScPortfolios(stdout)).toThrow(/portfolios command failed/);
  });

  it("returns an empty list when portfolios are missing", () => {
    const stdout = JSON.stringify({ ok: true, command: "broker.portfolios", data: {} });
    expect(parseScPortfolios(stdout)).toEqual([]);
  });

  it("skips malformed portfolio rows", () => {
    const stdout = JSON.stringify({
      ok: true,
      command: "broker.portfolios",
      data: { portfolios: [{ id: 1, name: "bad" }, { id: "good", name: "Portfolio" }] },
    });
    expect(parseScPortfolios(stdout)).toEqual([{ id: "good", name: "Portfolio" }]);
  });

  it("reads portfolio rows from an sc JSON envelope", () => {
    const stdout = JSON.stringify({
      ok: true,
      command: "broker.portfolios",
      data: { portfolios: [{ id: "p1", name: "Portfolio operator-a" }] },
    });
    expect(parseScPortfolios(stdout)).toEqual([{ id: "p1", name: "Portfolio operator-a" }]);
  });
});

describe("ensureScCliReady", () => {
  it("is a no-op when scalable capital is disabled", async () => {
    const runner = { run: vi.fn() };
    await ensureScCliReady(runner, prompter(), { enabled: false, skipCheck: false });
    expect(runner.run).not.toHaveBeenCalled();
  });
  it("surfaces a missing sc binary", async () => {
    const prompt = prompter();
    const runner = {
      run: vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
    };
    await expect(ensureScCliReady(runner, prompt, { enabled: true, skipCheck: false })).rejects.toThrow();
    expect(prompt.print).toHaveBeenCalledWith(expect.stringContaining("Scalable CLI"));
  });

  it("fails when login retry still has no session", async () => {
    const prompt = prompter();
    const runner = {
      run: vi.fn().mockResolvedValue({
        stdout: JSON.stringify({ ok: false, command: "broker.portfolios", error: { code: "no_session" } }),
        stderr: "",
        exitCode: 0,
      }),
    };
    await expect(ensureScCliReady(runner, prompt, { enabled: true, skipCheck: false })).rejects.toThrow(
      /no active session/,
    );
  });

  it("waits for login when portfolios report no session", async () => {
    const prompt = prompter();
    const runner = {
      run: vi
        .fn()
        .mockResolvedValueOnce({
          stdout: JSON.stringify({ ok: false, command: "broker.portfolios", error: { code: "no_session" } }),
          stderr: "",
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({ ok: true, command: "broker.portfolios", data: {} }),
          stderr: "",
          exitCode: 0,
        }),
    };
    await ensureScCliReady(runner, prompt, { enabled: true, skipCheck: false });
    expect(prompt.waitForEnter).toHaveBeenCalled();
  });

  it("returns immediately when a session is active", async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({
        stdout: JSON.stringify({ ok: true, command: "broker.portfolios", data: {} }),
        stderr: "",
        exitCode: 0,
      }),
    };
    await ensureScCliReady(runner, prompter(), { enabled: true, skipCheck: false });
    expect(runner.run).toHaveBeenCalledOnce();
  });
});

describe("ensurePytrReady", () => {
  it("is a no-op when trade republic is disabled", async () => {
    const runner = { run: vi.fn() };
    await ensurePytrReady(runner, prompter(), { enabled: false, skipCheck: false });
    expect(runner.run).not.toHaveBeenCalled();
  });
  it("throws when pytr -V fails", async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({ stdout: "", stderr: "broken", exitCode: 2 }),
    };
    await expect(ensurePytrReady(runner, prompter(), { enabled: true, skipCheck: false })).rejects.toThrow(
      /`-V` failed/,
    );
  });
  it("prompts for login when export fails with credential errors", async () => {
    const prompt = prompter();
    const runner = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "pytr 0.4.10", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "credentials missing", exitCode: 1 })
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }),
    };
    await ensurePytrReady(runner, prompt, { enabled: true, skipCheck: false });
    expect(prompt.waitForEnter).toHaveBeenCalled();
  });

  it("fails when login retry still cannot export", async () => {
    const prompt = prompter();
    const runner = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "pytr 0.4.10", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "credentials missing", exitCode: 1 })
        .mockResolvedValueOnce({ stdout: "", stderr: "credentials missing", exitCode: 1 }),
    };
    await expect(ensurePytrReady(runner, prompt, { enabled: true, skipCheck: false })).rejects.toThrow(
      /after login/,
    );
  });

  it("throws when session probe fails for an unexpected reason", async () => {
    const runner = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "pytr 0.4.10", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "network down", exitCode: 2 }),
    };
    await expect(ensurePytrReady(runner, prompter(), { enabled: true, skipCheck: false })).rejects.toThrow(
      /session check failed/,
    );
  });

  it("re-prompts when credential storage is declined", async () => {
    const prompt = prompter();
    (prompt.confirm as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    await confirmPytrCredentialStorage(prompt, "pytr login --v2");
    expect(prompt.confirm).toHaveBeenCalledTimes(3);
  });

  it("returns when export_transactions succeeds", async () => {
    const runner = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "pytr 0.4.10", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }),
    };
    await ensurePytrReady(runner, prompter(), { enabled: true, skipCheck: false });
    expect(runner.run).toHaveBeenCalled();
  });
});
