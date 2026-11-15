import { parseScMachineEnvelopeStdout } from "./sc-envelope.js";
import type { ScalableCapitalCliConfig, ScMachineEnvelope } from "./types.js";
import { isErrnoCode } from "../shared/errno.js";
import type { ScCliRunner } from "../shared/subprocess-cli.js";

function cliErrorMessage(envelope: ScMachineEnvelope): string {
  const code = envelope.error?.code ?? "unknown";
  const hint = envelope.hints?.[0];
  return hint
    ? `Scalable CLI command failed (${code}): ${hint}`
    : `Scalable CLI command failed (${code})`;
}

export function assertSuccessEnvelope(envelope: ScMachineEnvelope): void {
  if (envelope.ok) {
    return;
  }
  if (envelope.error?.code === "no_session") {
    throw new Error("Scalable CLI has no active session — run `sc login` on this machine first");
  }
  throw new Error(cliErrorMessage(envelope));
}

export function scChildEnv(config: ScalableCapitalCliConfig): Record<string, string> | undefined {
  if (!config.scConfigDir) {
    return undefined;
  }
  return { SC_CONFIG_DIR: config.scConfigDir };
}

/** Appends `--portfolio-id` when the profile pins a portfolio (broker subcommands only). */
export function withPortfolioId(argv: readonly string[], config: ScalableCapitalCliConfig): string[] {
  return config.portfolioId ? [...argv, "--portfolio-id", config.portfolioId] : [...argv];
}

async function runOnce(runner: ScCliRunner, argv: readonly string[], env?: Record<string, string>) {
  try {
    return await runner.run(argv, env);
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) {
      throw new Error(
        "Scalable CLI (`sc`) was not found — install it from https://github.com/ScalableCapital/scalable-cli",
        { cause: error },
      );
    }
    throw error;
  }
}

/**
 * Runs one `sc … --json` command, retries once on `refresh_retryable`, and returns the successful
 * machine envelope (throws an actionable error otherwise). Stdout is never logged.
 */
export async function runScJsonCommand(
  runner: ScCliRunner,
  config: ScalableCapitalCliConfig,
  argv: readonly string[],
): Promise<ScMachineEnvelope> {
  const env = scChildEnv(config);
  const run = await runOnce(runner, argv, env);
  const envelope = parseScMachineEnvelopeStdout(run.stdout);
  if (!envelope.ok && envelope.error?.code === "refresh_retryable") {
    const retry = await runOnce(runner, argv, env);
    const retryEnvelope = parseScMachineEnvelopeStdout(retry.stdout);
    assertSuccessEnvelope(retryEnvelope);
    return retryEnvelope;
  }
  assertSuccessEnvelope(envelope);
  return envelope;
}
