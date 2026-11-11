import { spawn } from "node:child_process";

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
          env: { ...process.env, ...extraEnv },
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
