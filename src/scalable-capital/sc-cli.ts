import { spawn } from "node:child_process";

/** Hardened PATH for `sc` lookup — do not inherit a user-writable `PATH` from the parent process. */
const SC_CLI_PATH =
  "/opt/homebrew/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

function buildScSpawnEnv(extraEnv?: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  const env: Record<string, string> = {
    PATH: SC_CLI_PATH,
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
      return new Promise((resolve, reject) => {
        const child = spawn(binaryPath, [...argv], {
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
