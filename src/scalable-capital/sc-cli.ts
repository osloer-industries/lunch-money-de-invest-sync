import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

/** Trusted directories when resolving a relative `sc` name (never the parent process PATH). */
const SC_CLI_SEARCH_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/sbin",
  "/usr/local/bin",
  "/usr/sbin",
  "/usr/bin",
  "/sbin",
  "/bin",
] as const;

function buildScSpawnEnv(extraEnv?: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
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

/** Resolve `sc` to an absolute path so spawn does not consult PATH (Sonar S4036). */
export function resolveScExecutable(binaryPath: string): string {
  if (path.isAbsolute(binaryPath)) {
    return binaryPath;
  }
  for (const dir of SC_CLI_SEARCH_DIRS) {
    const candidate = path.join(dir, binaryPath);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Scalable CLI executable "${binaryPath}" was not found under trusted install paths — set scBinaryPath to the absolute path from \`which sc\``,
  );
}

export interface ScCliRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** Injectable wrapper around `sc` for unit tests. */
export interface ScCliRunner {
  run(argv: readonly string[], env?: Readonly<Record<string, string>>): Promise<ScCliRunResult>;
}

export function createScCliRunner(binaryPath = "sc"): ScCliRunner {
  return {
    run(argv, extraEnv) {
      const executable = resolveScExecutable(binaryPath);
      return new Promise((resolve, reject) => {
        const child = spawn(executable, [...argv], {
          env: buildScSpawnEnv(extraEnv),
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
