import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  parseScMachineEnvelopeStdout,
  tryParseScMachineEnvelopeStdout,
} from "../scalable-capital/sc-envelope.js";
import { isErrnoCode } from "../shared/errno.js";
import type { PytrCliRunner, ScCliRunner } from "../shared/subprocess-cli.js";
import type { SetupPrompter } from "./types.js";
import { buildPytrExportProbeArgv, formatPytrLoginCommand, isPytrSessionMissing } from "./pytr-session.js";

const SC_LOGIN_COMMAND = "sc login --local-read-only";

function brokerCheckRequested(options: { enabled: boolean; skipCheck: boolean }): boolean {
  return options.enabled && !options.skipCheck;
}

function requireBrokerRunner<T>(runner: T | undefined, brokerLabel: string): T {
  if (!runner) {
    throw new Error(`${brokerLabel} setup was requested but no runner is configured`);
  }
  return runner;
}

async function promptBrokerLogin(
  prompter: SetupPrompter,
  instructions: string,
  waitMessage: string,
  isReady: () => Promise<boolean>,
  failureMessage: string,
): Promise<void> {
  prompter.print(instructions);
  await prompter.waitForEnter(waitMessage);
  if (!(await isReady())) {
    throw new Error(failureMessage);
  }
}

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
  if (!brokerCheckRequested(options)) {
    return;
  }
  const sc = requireBrokerRunner(runner, "Scalable Capital");
  let portfoliosRun: Awaited<ReturnType<ScCliRunner["run"]>>;
  try {
    portfoliosRun = await sc.run(["broker", "portfolios", "--json"]);
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) {
      prompter.print("Scalable CLI (`sc`) was not found — install https://github.com/ScalableCapital/scalable-cli");
    }
    throw error;
  }
  const loggedIn = isScSessionActive(portfoliosRun.stdout);
  if (loggedIn) {
    return;
  }
  await promptBrokerLogin(
    prompter,
    `Scalable CLI session is missing or expired. Run:\n\n  ${SC_LOGIN_COMMAND}\n`,
    "Press Enter after `sc login` succeeds...",
    async () => {
      const retry = await sc.run(["broker", "portfolios", "--json"]);
      return isScSessionActive(retry.stdout);
    },
    "Scalable CLI still has no active session after login",
  );
}

function isScSessionActive(stdout: string): boolean {
  const envelope = tryParseScMachineEnvelopeStdout(stdout);
  return envelope !== null && envelope.ok;
}

async function confirmPytrCredentialStorageOnce(
  prompter: SetupPrompter,
  loginCommand: string,
): Promise<void> {
  prompter.print(
    [
      "pytr must store credentials on disk for unattended exports.",
      "The login command below passes --store_credentials, which writes your phone number and Trade Republic PIN",
      "in plain text to ~/.pytr/credentials (file mode 0600).",
    ].join("\n"),
  );
  const ok = await prompter.confirm(`Accept and run this login command later if needed?\n\n  ${loginCommand}`, false);
  if (ok) {
    return;
  }
  prompter.print(
    "Without stored credentials, Trade Republic cannot sync automatically. You can accept storage or choose a different broker.",
  );
  const again = await prompter.confirm("Review the credential notice again?", true);
  if (!again) {
    throw new Error("Trade Republic setup stopped — credential storage was not accepted");
  }
  await confirmPytrCredentialStorageOnce(prompter, loginCommand);
}

export async function confirmPytrCredentialStorage(prompter: SetupPrompter, loginCommand: string): Promise<void> {
  await confirmPytrCredentialStorageOnce(prompter, loginCommand);
}

export interface EnsurePytrReadyContext {
  readonly pytrCommand: readonly string[];
}

export async function ensurePytrReady(
  runner: PytrCliRunner | undefined,
  prompter: SetupPrompter,
  options: { enabled: boolean; skipCheck: boolean },
  context?: EnsurePytrReadyContext,
): Promise<void> {
  if (!brokerCheckRequested(options)) {
    return;
  }
  const pytr = requireBrokerRunner(runner, "Trade Republic");
  const pytrCommand = context?.pytrCommand ?? (["pytr"] as const);
  let versionRun: Awaited<ReturnType<PytrCliRunner["run"]>>;
  try {
    versionRun = await pytr.run(["-V"]);
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) {
      prompter.print("pytr was not found — install https://github.com/pytr-org/pytr (for example `uvx pytr@0.4.10`)");
    }
    throw error;
  }
  if (versionRun.exitCode !== 0) {
    throw new Error("pytr is installed but `-V` failed — check your pytrCommand");
  }
  const probeDir = await mkdtemp(path.join(os.tmpdir(), "lm-setup-pytr-"));
  const probeArgv = buildPytrExportProbeArgv(probeDir);
  const probe = await pytr.run(probeArgv);
  if (probe.exitCode === 0) {
    return;
  }
  if (!isPytrSessionMissing(probe)) {
    throw new Error("pytr session check failed — inspect pytr output locally");
  }
  const loginCommand = formatPytrLoginCommand(pytrCommand);
  await promptBrokerLogin(
    prompter,
    `pytr session is missing or expired. Run:\n\n  ${loginCommand}\n`,
    "Press Enter after pytr login succeeds...",
    async () => {
      const retryDir = await mkdtemp(path.join(os.tmpdir(), "lm-setup-pytr-"));
      const retry = await pytr.run(buildPytrExportProbeArgv(retryDir));
      return retry.exitCode === 0;
    },
    "pytr still cannot export transactions after login",
  );
}

export function parseScPortfolios(stdout: string): Array<{ id: string; name: string }> {
  const envelope = parseScMachineEnvelopeStdout(stdout);
  if (!envelope.ok) {
    throw new Error("Scalable CLI portfolios command failed");
  }
  const data = envelope.data;
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
