import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scMachineEnvelopeSchema } from "../scalable-capital/types.js";
import type { PytrCliRunner, ScCliRunner } from "../shared/subprocess-cli.js";
import type { SetupPrompter } from "./types.js";

const SC_LOGIN_COMMAND = "sc login --local-read-only";
const PYTR_LOGIN_COMMAND = "pytr login";

export function assertNodeMajorVersion(processVersion: string, requiredMajor = 24): void {
  const match = /^v(\d+)/.exec(processVersion);
  const major = match ? Number(match[1]) : Number.NaN;
  if (major !== requiredMajor) {
    throw new Error(
      `This tool requires Node.js ${requiredMajor}.x (got ${processVersion}). See .nvmrc / .node-version.`,
    );
  }
}

export async function ensureScCliReady(
  runner: ScCliRunner | undefined,
  prompter: SetupPrompter,
  options: { enabled: boolean; skipCheck: boolean },
): Promise<void> {
  if (!options.enabled) {
    return;
  }
  if (options.skipCheck) {
    return;
  }
  if (!runner) {
    throw new Error("Scalable Capital setup was requested but no sc runner is configured");
  }
  let portfoliosRun: Awaited<ReturnType<ScCliRunner["run"]>>;
  try {
    portfoliosRun = await runner.run(["broker", "portfolios", "--json"]);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && Reflect.get(error, "code") === "ENOENT"
        ? "missing"
        : "unknown";
    if (code === "missing") {
      prompter.print("Scalable CLI (`sc`) was not found — install https://github.com/ScalableCapital/scalable-cli");
    }
    throw error;
  }
  const loggedIn = isScSessionActive(portfoliosRun.stdout);
  if (loggedIn) {
    return;
  }
  prompter.print(`Scalable CLI session is missing or expired. Run:\n\n  ${SC_LOGIN_COMMAND}\n`);
  await prompter.waitForEnter("Press Enter after `sc login` succeeds...");
  const retry = await runner.run(["broker", "portfolios", "--json"]);
  if (!isScSessionActive(retry.stdout)) {
    throw new Error("Scalable CLI still has no active session after login");
  }
}

function isScSessionActive(stdout: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    return false;
  }
  const envelope = scMachineEnvelopeSchema.safeParse(parsed);
  return envelope.success && envelope.data.ok;
}

export async function ensurePytrReady(
  runner: PytrCliRunner | undefined,
  prompter: SetupPrompter,
  options: { enabled: boolean; skipCheck: boolean },
): Promise<void> {
  if (!options.enabled) {
    return;
  }
  if (options.skipCheck) {
    return;
  }
  if (!runner) {
    throw new Error("Trade Republic setup was requested but no pytr runner is configured");
  }
  let versionRun: Awaited<ReturnType<PytrCliRunner["run"]>>;
  try {
    versionRun = await runner.run(["-V"]);
  } catch (error) {
    prompter.print("pytr was not found — install https://github.com/pytr-org/pytr (for example `uvx pytr@0.4.10`)");
    throw error;
  }
  if (versionRun.exitCode !== 0) {
    throw new Error("pytr is installed but `-V` failed — check your pytrCommand");
  }
  const probeDir = await mkdtemp(path.join(os.tmpdir(), "lm-setup-pytr-"));
  const probe = await runner.run(["export_transactions", "--last_days", "1", "--outputdir", probeDir]);
  const loggedIn = probe.exitCode === 0;
  if (loggedIn) {
    return;
  }
  const lower = probe.stderr.toLowerCase();
  if (!lower.includes("credential") && !lower.includes("login")) {
    throw new Error("pytr session check failed — inspect pytr output locally");
  }
  prompter.print(`pytr session is missing or expired. Run:\n\n  ${PYTR_LOGIN_COMMAND}\n`);
  await prompter.waitForEnter("Press Enter after `pytr login` succeeds...");
  const retryDir = await mkdtemp(path.join(os.tmpdir(), "lm-setup-pytr-"));
  const retry = await runner.run(["export_transactions", "--last_days", "1", "--outputdir", retryDir]);
  if (retry.exitCode !== 0) {
    throw new Error("pytr still cannot export transactions after login");
  }
}

export function parseScPortfolios(stdout: string): Array<{ id: string; name: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    throw new Error("Scalable CLI portfolios response is not valid JSON");
  }
  const envelope = scMachineEnvelopeSchema.safeParse(parsed);
  if (!envelope.success || !envelope.data.ok) {
    throw new Error("Scalable CLI portfolios command failed");
  }
  const data = envelope.data.data;
  if (!data || typeof data !== "object") {
    return [];
  }
  const portfolios = Reflect.get(data, "portfolios");
  if (!Array.isArray(portfolios)) {
    return [];
  }
  return portfolios.flatMap((row) => {
    if (typeof row !== "object" || row === null) {
      return [];
    }
    const id = Reflect.get(row, "id");
    const name = Reflect.get(row, "name");
    if (typeof id !== "string" || typeof name !== "string") {
      return [];
    }
    return [{ id, name }];
  });
}
