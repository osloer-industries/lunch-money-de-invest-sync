import {
  createArgvPrefixCliRunner,
  resolveExecutableInTrustedDirs,
  runSubprocess,
  type SubprocessRunResult,
} from "../shared/subprocess-cli.js";

/** Resolve the first argv token to an absolute path so spawn does not consult PATH (Sonar S4036). */
export function resolvePytrExecutable(command: readonly string[]): readonly string[] {
  if (command.length === 0) {
    throw new Error("pytrCommand must include at least one argv element (executable or launcher)");
  }
  const executable = command[0];
  const rest = command.slice(1);
  if (!executable) {
    throw new Error("pytrCommand must include at least one argv element (executable or launcher)");
  }
  const resolved = resolveExecutableInTrustedDirs(
    executable,
    `pytr launcher "${executable}" was not found under trusted install paths — set pytrCommand to an absolute path (for example from \`which ${executable}\`)`,
  );
  return [resolved, ...rest];
}

export type PytrCliRunResult = SubprocessRunResult;

/** Injectable wrapper around a pytr argv prefix (e.g. `pytr` or `uvx` + `pytr`). */
export interface PytrCliRunner {
  run(argv: readonly string[], env?: Readonly<Record<string, string>>): Promise<PytrCliRunResult>;
}

export function createPytrCliRunner(command: readonly string[]): PytrCliRunner {
  return createArgvPrefixCliRunner(command, resolvePytrExecutable, runSubprocess);
}
