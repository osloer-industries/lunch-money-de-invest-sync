import { describe, expect, it } from "vitest";
import { buildPytrExportProbeArgv, formatPytrLoginCommand, isPytrSessionMissing } from "./pytr-session.js";

describe("pytr session helpers", () => {
  it("builds login command with v2 and store_credentials", () => {
    expect(formatPytrLoginCommand(["uvx", "pytr@0.4.10"], { loginV2: true })).toBe(
      "uvx pytr@0.4.10 login --v2 --store_credentials",
    );
  });

  it("detects missing session from EOFError", () => {
    expect(
      isPytrSessionMissing({
        stdout: "",
        stderr: "EOFError: EOF when reading a line",
        exitCode: 1,
      }),
    ).toBe(true);
  });

  it("treats exit 0 as logged in", () => {
    expect(isPytrSessionMissing({ stdout: "{}", stderr: "", exitCode: 0 })).toBe(false);
  });

  it("adds auth flags to export probe argv", () => {
    expect(buildPytrExportProbeArgv("/tmp/out", { loginV2: true, wafTokenMode: "awswaf" })).toEqual([
      "export_transactions",
      "--last_days",
      "1",
      "--outputdir",
      "/tmp/out",
      "--v2",
      "--waf-token",
      "awswaf",
    ]);
  });
});
