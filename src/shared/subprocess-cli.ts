import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

/** Trusted directories when resolving a relative CLI name (never the parent process PATH). */
export const TRUSTED_CLI_SEARCH_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/sbin",
  "/usr/local/bin",
  "/usr/sbin",
  "/usr/bin",
  "/sbin",
  "/bin",
] as const;

export function buildCliSpawnEnv(extraEnv?: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
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

export function resolveExecutableInTrustedDirs(executable: string, notFoundMessage: string): string {
  if (path.isAbsolute(executable)) {
    return executable;
  }
  for (const dir of TRUSTED_CLI_SEARCH_DIRS) {
    const candidate = path.join(dir, executable);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(notFoundMessage);
}

export interface SubprocessRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface PrefixCliRunner {
  run(argv: readonly string[], env?: Readonly<Record<string, string>>): Promise<SubprocessRunResult>;
}

export function createArgvPrefixCliRunner(
  command: readonly string[],
  resolvePrefix: (command: readonly string[]) => readonly string[],
  run: typeof runSubprocess,
): PrefixCliRunner {
  return {
    run(subcommandArgv, extraEnv) {
      const resolved = resolvePrefix(command);
      const executable = resolved[0]!;
      const argv = [...resolved.slice(1), ...subcommandArgv];
      return run(executable, argv, extraEnv);
    },
  };
}

export function runSubprocess(
  executable: string,
  argv: readonly string[],
  extraEnv?: Readonly<Record<string, string>>,
): Promise<SubprocessRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...argv], {
      env: buildCliSpawnEnv(extraEnv),
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
}
