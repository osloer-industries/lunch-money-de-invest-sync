import {
  resolveExecutableInTrustedDirs,
  runSubprocess,
  type SubprocessRunResult,
} from "../shared/subprocess-cli.js";

/** Resolve `sc` to an absolute path so spawn does not consult PATH (Sonar S4036). */
export function resolveScExecutable(binaryPath: string): string {
  return resolveExecutableInTrustedDirs(
    binaryPath,
    `Scalable CLI executable "${binaryPath}" was not found under trusted install paths — set scBinaryPath to the absolute path from \`which sc\``,
  );
}

export type ScCliRunResult = SubprocessRunResult;

/** Injectable wrapper around `sc` for unit tests. */
export interface ScCliRunner {
  run(argv: readonly string[], env?: Readonly<Record<string, string>>): Promise<ScCliRunResult>;
}

export function createScCliRunner(binaryPath = "sc"): ScCliRunner {
  return {
    run(argv, extraEnv) {
      const executable = resolveScExecutable(binaryPath);
      return runSubprocess(executable, argv, extraEnv);
    },
  };
}
