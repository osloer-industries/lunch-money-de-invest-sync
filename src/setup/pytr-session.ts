import type { SubprocessRunResult } from "../shared/subprocess-cli.js";

/** pytr login/export flags: app-approval flow only (`--v2`). */
export function appendPytrV2Flag(argv: readonly string[]): string[] {
  return [...argv, "--v2"];
}

export function buildPytrExportProbeArgv(outputDir: string): string[] {
  return appendPytrV2Flag([
    "export_transactions",
    "--last_days",
    "1",
    "--outputdir",
    outputDir,
  ]);
}

export function formatPytrLoginCommand(pytrCommand: readonly string[]): string {
  const loginArgv = ["login", "--v2", "--store_credentials"];
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
