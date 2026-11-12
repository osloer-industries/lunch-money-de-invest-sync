import type { SubprocessRunResult } from "../shared/subprocess-cli.js";
import type { TradeRepublicWafTokenMode } from "../trade-republic/types.js";

export interface PytrLoginPreferences {
  readonly loginV2: boolean;
  readonly wafTokenMode?: TradeRepublicWafTokenMode;
}

export function appendPytrAuthFlags(argv: string[], prefs: PytrLoginPreferences): string[] {
  const next = [...argv];
  if (prefs.loginV2) {
    next.push("--v2");
  }
  if (prefs.wafTokenMode === "no-waf") {
    next.push("--no-waf-token");
  } else if (prefs.wafTokenMode === "playwright") {
    next.push("--waf-token", "playwright");
  } else if (prefs.wafTokenMode === "awswaf") {
    next.push("--waf-token", "awswaf");
  }
  return next;
}

export function buildPytrExportProbeArgv(outputDir: string, prefs: PytrLoginPreferences): string[] {
  return appendPytrAuthFlags(["export_transactions", "--last_days", "1", "--outputdir", outputDir], prefs);
}

export function formatPytrLoginCommand(pytrCommand: readonly string[], prefs: PytrLoginPreferences): string {
  const loginArgv = appendPytrAuthFlags(["login"], prefs);
  loginArgv.push("--store_credentials");
  const prefix = pytrCommand.join(" ");
  return `${prefix} ${loginArgv.join(" ")}`;
}

export function isPytrSessionMissing(result: SubprocessRunResult): boolean {
  if (result.exitCode === 0) {
    return false;
  }
  const combined = `${result.stderr}\n${result.stdout}`;
  const lower = combined.toLowerCase();
  if (lower.includes("eoferror")) {
    return true;
  }
  if (/\bphone\b/.test(lower) && /\bnumber\b/.test(lower)) {
    return true;
  }
  if (lower.includes("credentials") || lower.includes("not logged")) {
    return true;
  }
  return false;
}
