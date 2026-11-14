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

const DEFAULT_SUBPROCESS_TIMEOUT_MS = 120_000;

const PASSTHROUGH_ENV_KEYS = ["SC_CONFIG_DIR", "TMPDIR"] as const;

export class CliExecutableNotFoundError extends Error {
  readonly code = "ENOENT";

  constructor(message: string) {
    super(message);
    this.name = "CliExecutableNotFoundError";
  }
}

export class SubprocessTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubprocessTimeoutError";
  }
}

function shouldPassThroughEnvKey(key: string): boolean {
  if ((PASSTHROUGH_ENV_KEYS as readonly string[]).includes(key)) {
    return true;
  }
  return key.startsWith("UV_") || key.startsWith("XDG_");
}

function collectPassThroughEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string" && shouldPassThroughEnvKey(key)) {
      out[key] = value;
    }
  }
  return out;
}

function optionalExtraSearchDirFromEnv(): string | undefined {
  const raw = process.env["LM_CLI_EXTRA_SEARCH_DIR"]?.trim();
  if (!raw) {
    return undefined;
  }
  if (!path.isAbsolute(raw)) {
    return undefined;
  }
  return raw;
}

function homeLocalBin(): string | null {
  const home = process.env.HOME;
  if (!home) {
    return null;
  }
  return path.join(home, ".local", "bin");
}

export function trustedSearchDirs(extraDir?: string): readonly string[] {
  const dirs: string[] = [...TRUSTED_CLI_SEARCH_DIRS];
  const localBin = homeLocalBin();
  if (localBin) {
    dirs.push(localBin);
  }
  const fromEnv = optionalExtraSearchDirFromEnv();
  if (fromEnv) {
    dirs.push(fromEnv);
  }
  if (extraDir && path.isAbsolute(extraDir)) {
    dirs.push(extraDir);
  }
  return dirs;
}

export function buildFixedPath(executablePath?: string, extraSearchDir?: string): string {
  const entries = new Set<string>(trustedSearchDirs(extraSearchDir));
  if (executablePath && path.isAbsolute(executablePath)) {
    entries.add(path.dirname(executablePath));
  }
  return [...entries].join(path.delimiter);
}

export function buildCliSpawnEnv(
  extraEnv?: Readonly<Record<string, string>>,
  spawnPath?: { executablePath?: string; extraSearchDir?: string },
): NodeJS.ProcessEnv {
  const env: Record<string, string> = {
    ...collectPassThroughEnv(),
    LANG: typeof process.env.LANG === "string" ? process.env.LANG : "C.UTF-8",
    PATH: buildFixedPath(spawnPath?.executablePath, spawnPath?.extraSearchDir),
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

export function resolveExecutableInTrustedDirs(
  executable: string,
  notFoundMessage: string,
  extraSearchDir?: string,
): string {
  if (path.isAbsolute(executable)) {
    return executable;
  }
  for (const dir of trustedSearchDirs(extraSearchDir)) {
    const candidate = path.join(dir, executable);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new CliExecutableNotFoundError(notFoundMessage);
}

export interface SubprocessRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface SubprocessRunOptions {
  readonly timeoutMs?: number;
  readonly extraSearchDir?: string;
}

export interface PrefixCliRunner {
  run(
    argv: readonly string[],
    env?: Readonly<Record<string, string>>,
    options?: SubprocessRunOptions,
  ): Promise<SubprocessRunResult>;
}

export function createArgvPrefixCliRunner(
  command: readonly string[],
  resolvePrefix: (command: readonly string[]) => readonly string[],
  run: typeof runSubprocess,
  defaultTimeoutMs: number = DEFAULT_SUBPROCESS_TIMEOUT_MS,
): PrefixCliRunner {
  return {
    run(subcommandArgv, extraEnv, options) {
      const resolved = resolvePrefix(command);
      const executable = resolved[0]!;
      const argv = [...resolved.slice(1), ...subcommandArgv];
      const timeoutMs = options?.timeoutMs ?? defaultTimeoutMs;
      return run(executable, argv, extraEnv, { ...options, timeoutMs });
    },
  };
}

/** Resolve the first pytr argv token to an absolute path so spawn does not consult PATH (Sonar S4036). */
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

/** Resolve `sc` to an absolute path so spawn does not consult PATH (Sonar S4036). */
export function resolveScExecutable(binaryPath: string): string {
  return resolveExecutableInTrustedDirs(
    binaryPath,
    `Scalable CLI executable "${binaryPath}" was not found under trusted install paths — set scBinaryPath to the absolute path from \`which sc\``,
  );
}

export type PytrCliRunResult = SubprocessRunResult;
export type ScCliRunResult = SubprocessRunResult;

/** Injectable wrapper around a pytr argv prefix (e.g. `pytr` or `uvx` + `pytr`). */
export interface PytrCliRunner {
  run(
    argv: readonly string[],
    env?: Readonly<Record<string, string>>,
    options?: SubprocessRunOptions,
  ): Promise<PytrCliRunResult>;
}

/** Injectable wrapper around `sc` for unit tests. */
export interface ScCliRunner {
  run(
    argv: readonly string[],
    env?: Readonly<Record<string, string>>,
    options?: SubprocessRunOptions,
  ): Promise<ScCliRunResult>;
}

export function createPytrCliRunner(
  command: readonly string[],
  defaultTimeoutMs: number = DEFAULT_SUBPROCESS_TIMEOUT_MS,
): PytrCliRunner {
  return createArgvPrefixCliRunner(command, resolvePytrExecutable, runSubprocess, defaultTimeoutMs);
}

export function createScCliRunner(
  binaryPath = "sc",
  defaultTimeoutMs: number = DEFAULT_SUBPROCESS_TIMEOUT_MS,
): ScCliRunner {
  return {
    run(argv, extraEnv, options) {
      const executable = resolveScExecutable(binaryPath);
      const timeoutMs = options?.timeoutMs ?? defaultTimeoutMs;
      return runSubprocess(executable, argv, extraEnv, { ...options, timeoutMs });
    },
  };
}

export function runSubprocess(
  executable: string,
  argv: readonly string[],
  extraEnv?: Readonly<Record<string, string>>,
  options?: SubprocessRunOptions,
): Promise<SubprocessRunResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_SUBPROCESS_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const spawnPath =
      options?.extraSearchDir !== undefined
        ? { executablePath: executable, extraSearchDir: options.extraSearchDir }
        : { executablePath: executable };
    const child = spawn(executable, [...argv], {
      env: buildCliSpawnEnv(extraEnv, spawnPath),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => {
        reject(
          new SubprocessTimeoutError(
            `Subprocess timed out after ${timeoutMs}ms — ${path.basename(executable)} ${argv.join(" ")}`,
          ),
        );
      });
    }, timeoutMs);
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
      finish(() => {
        reject(error);
      });
    });
    child.on("close", (exitCode) => {
      finish(() => {
        resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
      });
    });
  });
}
