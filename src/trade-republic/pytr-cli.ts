import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

/** Trusted directories when resolving a relative launcher name (never the parent process PATH). */
const PYTR_CLI_SEARCH_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/sbin",
  "/usr/local/bin",
  "/usr/sbin",
  "/usr/bin",
  "/sbin",
  "/bin",
] as const;

function buildPytrSpawnEnv(extraEnv?: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  const env: Record<string, string> = {
    LANG: typeof process.env.LANG === "string" ? process.env.LANG : "C.UTF-8",
  };
  if (typeof process.env.HOME === "string" && process.env.HOME.length > 0) {
    env.HOME = process.env.HOME;
  }
  if (extraEnv) {
    for (const [key, value] of Object.entries(extraEnv)) {
      env[key] = value;
    }
  }
  return env;
}

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
  if (path.isAbsolute(executable)) {
    return [executable, ...rest];
  }
  for (const dir of PYTR_CLI_SEARCH_DIRS) {
    const candidate = path.join(dir, executable);
    if (existsSync(candidate)) {
      return [candidate, ...rest];
    }
  }
  throw new Error(
    `pytr launcher "${executable}" was not found under trusted install paths — set pytrCommand to an absolute path (for example from \`which ${executable}\`)`,
  );
}

export interface PytrCliRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** Injectable wrapper around a pytr argv prefix (e.g. `pytr` or `uvx` + `pytr`). */
export interface PytrCliRunner {
  run(argv: readonly string[], env?: Readonly<Record<string, string>>): Promise<PytrCliRunResult>;
}

export function createPytrCliRunner(command: readonly string[]): PytrCliRunner {
  return {
    run(subcommandArgv, extraEnv) {
      const resolved = resolvePytrExecutable(command);
      const argv = [...resolved.slice(1), ...subcommandArgv];
      const executable = resolved[0]!;
      return new Promise((resolve, reject) => {
        const child = spawn(executable, argv, {
          env: buildPytrSpawnEnv(extraEnv),
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk: string) => {
          stderr += chunk;
        });
        child.on("error", (error) => {
          reject(error);
        });
        child.on("close", (exitCode) => {
          resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
        });
      });
    },
  };
}
