import type { PathLike } from "node:fs";
import {
  appApprovalWatcherDeps,
  createAppApprovalWatcher,
  finalizeTradeRepublicApprovalFromRun,
  type AppApprovalWatcherState,
} from "./app-approval-alert.js";
import type { BrokerLoginEventSink } from "../shared/cli-events.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pytrAllEventsSchema, type TradeRepublicPytrConfig } from "./types.js";
import { isErrnoCode } from "../shared/errno.js";
import { createPytrCliRunner, type PytrCliRunner } from "../shared/subprocess-cli.js";

const PYTR_DOC = "https://github.com/pytr-org/pytr";

export interface PytrFilesystem {
  mkdtemp(prefix: string): Promise<string>;
  readFile(path: PathLike, encoding: "utf8"): Promise<string>;
  rm(path: PathLike, options: { recursive: boolean; force: boolean }): Promise<void>;
}

const defaultPytrFilesystem: PytrFilesystem = {
  mkdtemp,
  readFile: (filePath, encoding) => readFile(filePath, encoding),
  rm,
};

function pytrHomeEnv(pytrHome: string | undefined): Record<string, string> | undefined {
  if (!pytrHome) {
    return undefined;
  }
  const base = path.basename(pytrHome);
  if (base !== ".pytr") {
    throw new Error(
      `pytrHome must be the absolute path to the pytr data directory (basename ".pytr"), got "${pytrHome}"`,
    );
  }
  return { HOME: path.dirname(pytrHome) };
}

function parseDigits(
  input: string,
  start: number,
): { readonly value: number; readonly end: number } | null {
  if (start >= input.length) {
    return null;
  }
  const first = input.codePointAt(start);
  if (first === undefined || first < 48 || first > 57) {
    return null;
  }
  let end = start;
  let value = 0;
  while (end < input.length) {
    const code = input.codePointAt(end);
    if (code === undefined || code < 48 || code > 57) {
      break;
    }
    value = value * 10 + (code - 48);
    end += 1;
  }
  return { value, end };
}

function tryParseSemverAt(input: string, start: number): [number, number, number] | null {
  const major = parseDigits(input, start);
  if (!major || input[major.end] !== ".") {
    return null;
  }
  const minor = parseDigits(input, major.end + 1);
  if (!minor || input[minor.end] !== ".") {
    return null;
  }
  const patch = parseDigits(input, minor.end + 1);
  if (!patch) {
    return null;
  }
  if (patch.end < input.length) {
    const next = input.codePointAt(patch.end);
    if (next !== undefined && next >= 48 && next <= 57) {
      return null;
    }
  }
  return [major.value, minor.value, patch.value];
}

function parseSemver(version: string): [number, number, number] | null {
  const trimmed = version.trim();
  for (let index = 0; index < trimmed.length; index += 1) {
    const parsed = tryParseSemverAt(trimmed, index);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

function assertMinVersion(actual: string, required: string): void {
  const actualParts = parseSemver(actual);
  const requiredParts = parseSemver(required);
  if (!actualParts || !requiredParts) {
    throw new Error(`Could not parse pytr version (got "${actual}", required >= ${required})`);
  }
  for (let i = 0; i < 3; i++) {
    const a = actualParts[i]!;
    const r = requiredParts[i]!;
    if (a > r) {
      return;
    }
    if (a < r) {
      throw new Error(
        `pytr version ${actual.trim()} is below the configured minimum ${required} — upgrade with uvx/pytr (${PYTR_DOC})`,
      );
    }
  }
}

async function readVersionLine(runner: PytrCliRunner, env?: Record<string, string>): Promise<string> {
  const versionAttempt = await runner.run(["-V"], env);
  const versionLine = lineFromPytrRun(versionAttempt);
  if (versionLine) {
    return versionLine;
  }
  const longAttempt = await runner.run(["--version"], env);
  const longLine = lineFromPytrRun(longAttempt);
  if (longLine) {
    return longLine;
  }
  throw new Error(
    `Could not determine pytr version — ensure pytr is installed (${PYTR_DOC})`,
  );
}

function lineFromPytrRun(result: Awaited<ReturnType<PytrCliRunner["run"]>>): string | null {
  if (result.exitCode !== 0) {
    return null;
  }
  const line = (result.stdout || result.stderr).trim().split("\n")[0] ?? "";
  return line.length > 0 ? line : null;
}

export async function assertPytrMinVersion(
  runner: PytrCliRunner,
  config: TradeRepublicPytrConfig,
  env?: Record<string, string>,
): Promise<void> {
  if (!config.pytrMinVersion) {
    return;
  }
  const line = await readVersionLine(runner, env);
  assertMinVersion(line, config.pytrMinVersion);
}

function buildExportArgv(outputDir: string, config: TradeRepublicPytrConfig): string[] {
  const argv = [
    "export_transactions",
    "--outputdir",
    outputDir,
    "--export-format",
    "json",
    "--lang",
    "en",
  ];
  argv.push("--v2");
  if (config.account) {
    argv.push("--account", config.account);
  }
  return argv;
}

function truncateStderr(stderr: string, max = 500): string {
  const trimmed = stderr.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}…`;
}

function actionablePytrFailure(stderr: string, exitCode: number): string {
  const lower = stderr.toLowerCase();
  if (lower.includes("credentials") || lower.includes("login") || lower.includes("not logged")) {
    return "pytr session is missing or expired — run `pytr login --v2 --store_credentials` on this machine first";
  }
  if (lower.includes("426") || lower.includes("client_version_outdated")) {
    return (
      "Trade Republic rejected the client version (HTTP 426) — upgrade pytr and see PYTR_TR_* overrides in the pytr README"
    );
  }
  if (lower.includes("waf") || lower.includes("playwright")) {
    return "pytr login failed — use app approval: `pytr login --v2 --store_credentials`";
  }
  const detail = truncateStderr(stderr);
  return detail.length > 0
    ? `pytr export_transactions failed (exit ${exitCode}): ${detail}`
    : `pytr export_transactions failed with exit code ${exitCode}`;
}

export interface TradeRepublicFetchContext {
  readonly loginEvents?: BrokerLoginEventSink;
}

async function runExport(
  runner: PytrCliRunner,
  config: TradeRepublicPytrConfig,
  filesystem: PytrFilesystem = defaultPytrFilesystem,
  context: TradeRepublicFetchContext = {},
): Promise<string> {
  const childEnv = pytrHomeEnv(config.pytrHome);
  let outputDir: string | undefined;
  let approvalState: AppApprovalWatcherState = { sawApprovalWait: false, approvalSettled: false };
  try {
    await assertPytrMinVersion(runner, config, childEnv);
    outputDir = await filesystem.mkdtemp(path.join(os.tmpdir(), "lm-tr-sync-"));
    const onOutputLine = createAppApprovalWatcher(
      appApprovalWatcherDeps((state) => {
        approvalState = state;
      }, context.loginEvents),
    );
    // Short session check first: if Trade Republic needs app approval it happens here (with an alert),
    // so the full-history export below starts on a fresh session with its whole timeout.
    const runPytr = async (argv: readonly string[]) => {
      try {
        return await runner.run(argv, childEnv, { onOutputLine });
      } catch (error) {
        if (isErrnoCode(error, "ENOENT")) {
          throw new Error(
            `pytr was not found — install it from ${PYTR_DOC} (for example \`uvx pytr@0.4.10\`)`,
            { cause: error },
          );
        }
        throw error;
      }
    };
    const probeDir = await filesystem.mkdtemp(path.join(outputDir, "session-check-"));
    const probe = await runPytr([...buildExportArgv(probeDir, config), "--last_days", "1"]);
    finalizeTradeRepublicApprovalFromRun(context.loginEvents, approvalState, probe.exitCode, probe.stderr);
    if (probe.exitCode !== 0) {
      throw new Error(actionablePytrFailure(probe.stderr, probe.exitCode));
    }
    const run = await runPytr(buildExportArgv(outputDir, config));
    finalizeTradeRepublicApprovalFromRun(context.loginEvents, approvalState, run.exitCode, run.stderr);
    if (run.exitCode !== 0) {
      throw new Error(actionablePytrFailure(run.stderr, run.exitCode));
    }
    const eventsPath = path.join(outputDir, "all_events.json");
    let raw: string;
    try {
      raw = await filesystem.readFile(eventsPath, "utf8");
    } catch (error) {
      if (isErrnoCode(error, "ENOENT")) {
        throw new Error(
          "pytr finished successfully but did not write all_events.json — upgrade pytr or re-run `pytr login`",
          { cause: error },
        );
      }
      throw error;
    }
    if (raw.trim().length === 0) {
      throw new Error("pytr wrote an empty all_events.json — re-run `pytr login` and try again");
    }
    return raw;
  } finally {
    if (outputDir) {
      await filesystem.rm(outputDir, { recursive: true, force: true });
    }
  }
}

export async function fetchTradeRepublicTimeline(
  runner: PytrCliRunner,
  config: TradeRepublicPytrConfig,
  filesystem: PytrFilesystem = defaultPytrFilesystem,
  context: TradeRepublicFetchContext = {},
): Promise<ReturnType<typeof pytrAllEventsSchema.parse>> {
  const raw = await runExport(runner, config, filesystem, context);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("pytr all_events.json is not valid JSON");
  }
  const events = pytrAllEventsSchema.safeParse(parsed);
  if (!events.success) {
    throw new Error(
      `pytr all_events.json didn't match the expected shape: ${events.error.message}`,
    );
  }
  return events.data;
}

export function createDefaultPytrCliRunner(config: TradeRepublicPytrConfig): PytrCliRunner {
  const command = config.pytrCommand?.length ? config.pytrCommand : (["pytr"] as const);
  return createPytrCliRunner(command, config.cliSubprocessTimeoutMs);
}
