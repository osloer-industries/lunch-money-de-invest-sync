import {
  scBrokerTransactionsDataSchema,
  scalableCapitalTransactionSchema,
  type ScalableCapitalCliConfig,
  type ScalableCapitalTransaction,
  type ScTransactionSummary,
} from "./types.js";
import { parseScMachineEnvelopeStdout } from "./sc-envelope.js";
import { createScCliRunner, type ScCliRunner } from "../shared/subprocess-cli.js";

const MAX_PAGES = 50;
const DEFAULT_PAGE_SIZE = 100;
const CASH_SUMMARY_TYPE = "BrokerCashTransactionSummary";

function cliErrorMessage(envelope: ReturnType<typeof parseScMachineEnvelopeStdout>): string {
  const code = envelope.error?.code ?? "unknown";
  const hint = envelope.hints?.[0];
  return hint
    ? `Scalable CLI command failed (${code}): ${hint}`
    : `Scalable CLI command failed (${code})`;
}

function assertSuccessEnvelope(envelope: ReturnType<typeof parseScMachineEnvelopeStdout>): void {
  if (envelope.ok) {
    return;
  }
  if (envelope.error?.code === "no_session") {
    throw new Error("Scalable CLI has no active session — run `sc login` on this machine first");
  }
  throw new Error(cliErrorMessage(envelope));
}

function parseDecimalAmount(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Scalable CLI transaction amount is not a finite number");
    }
    return value;
  }
  if (value === null || value === undefined) {
    throw new Error("Scalable CLI cash transaction is missing amount");
  }
  if (typeof value !== "string") {
    throw new TypeError("Scalable CLI transaction amount has an unexpected type");
  }
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`Scalable CLI transaction amount is not numeric: ${trimmed}`);
  }
  return parsed;
}

function normalizeCashItem(item: ScTransactionSummary): ScalableCapitalTransaction | null {
  if (item.summary_type !== CASH_SUMMARY_TYPE) {
    return null;
  }
  if (item.is_cancellation === true) {
    return null;
  }
  if (!item.last_event_datetime) {
    throw new Error(`Scalable CLI cash transaction ${item.id} is missing last_event_datetime`);
  }
  const normalized = {
    id: item.id,
    date: item.last_event_datetime,
    type: "BrokerCashTransaction" as const,
    description: item.description?.trim() ?? "",
    amount: parseDecimalAmount(item.amount),
    currency: item.currency?.trim() || "EUR",
  };
  return scalableCapitalTransactionSchema.parse(normalized);
}

function buildTransactionsArgv(config: ScalableCapitalCliConfig, cursor?: string): string[] {
  const argv = ["broker", "transactions", "--json", "--page-size", String(DEFAULT_PAGE_SIZE)];
  if (config.portfolioId) {
    argv.push("--portfolio-id", config.portfolioId);
  }
  if (cursor) {
    argv.push("--cursor", cursor);
  }
  return argv;
}

function isErrnoCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  return Reflect.get(error, "code") === code;
}

function childEnv(config: ScalableCapitalCliConfig): Record<string, string> | undefined {
  if (!config.scConfigDir) {
    return undefined;
  }
  return { SC_CONFIG_DIR: config.scConfigDir };
}

async function runTransactionsPage(
  runner: ScCliRunner,
  config: ScalableCapitalCliConfig,
  cursor?: string,
): Promise<{
  transactions: ScalableCapitalTransaction[];
  summaries: ScTransactionSummary[];
  cursor: string | null | undefined;
}> {
  const argv = buildTransactionsArgv(config, cursor);
  const env = childEnv(config);
  let run: Awaited<ReturnType<ScCliRunner["run"]>>;
  try {
    run = await runner.run(argv, env);
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) {
      throw new Error(
        "Scalable CLI (`sc`) was not found — install it from https://github.com/ScalableCapital/scalable-cli",
        { cause: error },
      );
    }
    throw error;
  }
  const envelope = parseScMachineEnvelopeStdout(run.stdout);
  if (!envelope.ok && envelope.error?.code === "refresh_retryable") {
    const retry = await runner.run(argv, env);
    const retryEnvelope = parseScMachineEnvelopeStdout(retry.stdout);
    assertSuccessEnvelope(retryEnvelope);
    return parseTransactionsData(retryEnvelope);
  }
  assertSuccessEnvelope(envelope);
  return parseTransactionsData(envelope);
}

function parseTransactionsData(envelope: ReturnType<typeof parseScMachineEnvelopeStdout>): {
  transactions: ScalableCapitalTransaction[];
  summaries: ScTransactionSummary[];
  cursor: string | null | undefined;
} {
  const dataParsed = scBrokerTransactionsDataSchema.safeParse(envelope.data);
  if (!dataParsed.success) {
    throw new Error(
      `Scalable CLI broker.transactions data didn't match the expected shape: ${dataParsed.error.message}`,
    );
  }
  const summaries = dataParsed.data.result.items;
  const transactions = summaries
    .map((item) => normalizeCashItem(item))
    .filter((tx): tx is ScalableCapitalTransaction => tx !== null);
  return { transactions, summaries, cursor: dataParsed.data.result.cursor };
}

async function paginateBrokerTransactionPages<T>(
  runner: ScCliRunner,
  config: ScalableCapitalCliConfig,
  pick: (page: Awaited<ReturnType<typeof runTransactionsPage>>) => readonly T[],
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await runTransactionsPage(runner, config, cursor);
    all.push(...pick(result));
    if (!result.cursor) {
      return all;
    }
    cursor = result.cursor;
  }

  throw new Error(`Stopped after ${MAX_PAGES} pages — check for a cursor loop in the Scalable CLI response`);
}

/** Fetches every raw transaction summary row (all summary types) for type reporting. */
export async function fetchAllScalableTransactionSummaries(
  runner: ScCliRunner,
  config: ScalableCapitalCliConfig,
): Promise<ScTransactionSummary[]> {
  return paginateBrokerTransactionPages(runner, config, (page) => page.summaries);
}

/** Fetches every page of broker cash transactions via `sc broker transactions --json`. */
export async function fetchAllScalableCapitalTransactions(
  runner: ScCliRunner,
  config: ScalableCapitalCliConfig,
): Promise<ScalableCapitalTransaction[]> {
  return paginateBrokerTransactionPages(runner, config, (page) => page.transactions);
}

export function createDefaultScCliRunner(config: ScalableCapitalCliConfig): ScCliRunner {
  return createScCliRunner(config.scBinaryPath ?? "sc");
}
