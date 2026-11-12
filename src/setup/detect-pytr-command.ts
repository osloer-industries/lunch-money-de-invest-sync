import { existsSync } from "node:fs";
import path from "node:path";
import { trustedSearchDirs } from "../shared/subprocess-cli.js";

export interface PytrLauncherDetection {
  readonly pytrCommand: readonly string[];
  readonly summary: string;
}

function findExecutable(name: string, exists: (candidate: string) => boolean): boolean {
  for (const dir of trustedSearchDirs()) {
    const candidate = path.join(dir, name);
    if (exists(candidate)) {
      return true;
    }
  }
  return false;
}

const LAUNCHER_CANDIDATES: ReadonlyArray<{ readonly pytrCommand: readonly string[]; readonly needs: readonly string[] }> =
  [
    { pytrCommand: ["pytr"], needs: ["pytr"] },
    { pytrCommand: ["uvx", "pytr@0.4.10"], needs: ["uvx"] },
    { pytrCommand: ["uvx", "pytr"], needs: ["uvx"] },
    { pytrCommand: ["uv", "tool", "run", "pytr"], needs: ["uv"] },
  ];

/**
 * Picks a pytr argv prefix available under trusted install dirs (no subprocess probe).
 */
export function detectPytrLauncher(exists: (candidate: string) => boolean = existsSync): PytrLauncherDetection {
  for (const candidate of LAUNCHER_CANDIDATES) {
    if (candidate.needs.every((name) => findExecutable(name, exists))) {
      return { pytrCommand: candidate.pytrCommand, summary: candidate.pytrCommand.join(" ") };
    }
  }
  return { pytrCommand: ["pytr"], summary: "pytr" };
}
