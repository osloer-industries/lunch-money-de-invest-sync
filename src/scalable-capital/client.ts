import {
  scBrokerTransactionsDataSchema,
  scalableCapitalTransactionSchema,
  type ScalableCapitalCliConfig,
  type ScalableCapitalTransaction,
  type ScTransactionSummary,
} from "./types.js";
import { runScJsonCommand, withPortfolioId } from "./sc-command.js";
import type { ScMachineEnvelope } from "./types.js";
import { createScCliRunner, type ScCliRunner } from "../shared/subprocess-cli.js";

const MAX_PAGES = 50;
const DEFAULT_PAGE_SIZE = 100;
const CASH_SUMMARY_TYPE = "BrokerCashTransactionSummary";

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
    ...(item.cash_transaction_type?.trim() ? { cashTransactionType: item.cash_transaction_type.trim() } : {}),
  };
  return scalableCapitalTransactionSchema.parse(normalized);
}

function buildTransactionsArgv(config: ScalableCapitalCliConfig, cursor?: string): string[] {
  const argv = withPortfolioId(
    ["broker", "transactions", "--json", "--page-size", String(DEFAULT_PAGE_SIZE)],
    config,
  );
  if (cursor) {
    argv.push("--cursor", cursor);
  }
  return argv;
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
  const envelope = await runScJsonCommand(runner, config, buildTransactionsArgv(config, cursor));
  return parseTransactionsData(envelope);
}

function parseTransactionsData(envelope: ScMachineEnvelope): {
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
export function fetchAllScalableTransactionSummaries(
  runner: ScCliRunner,
  config: ScalableCapitalCliConfig,
): Promise<ScTransactionSummary[]> {
  return paginateBrokerTransactionPages(runner, config, (page) => page.summaries);
}

/** Fetches every page of broker cash transactions via `sc broker transactions --json`. */
export function fetchAllScalableCapitalTransactions(
  runner: ScCliRunner,
  config: ScalableCapitalCliConfig,
): Promise<ScalableCapitalTransaction[]> {
  return paginateBrokerTransactionPages(runner, config, (page) => page.transactions);
}

export function createDefaultScCliRunner(config: ScalableCapitalCliConfig): ScCliRunner {
  return createScCliRunner(config.scBinaryPath ?? "sc", config.cliSubprocessTimeoutMs);
}
