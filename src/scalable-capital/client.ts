import {
  scBrokerTransactionsDataSchema,
  scalableCapitalTransactionSchema,
  type ScalableCapitalCliConfig,
  type ScalableCapitalTransaction,
  type ScTransactionSummary,
} from "./types.js";
import { withPortfolioId } from "./sc-command.js";
import type { ScMachineEnvelope } from "./types.js";
import { createScCliRunner, type ScCliRunner } from "../shared/subprocess-cli.js";
import type { BrokerLoginEventSink } from "../shared/cli-events.js";
import { runScJsonCommand, type ScJsonCommandContext } from "./sc-command.js";

export interface ScalableFetchContext extends ScJsonCommandContext {
  readonly loginEvents?: BrokerLoginEventSink;
}

const MAX_PAGES = 50;
const DEFAULT_PAGE_SIZE = 100;
const CASH_SUMMARY_TYPE = "BrokerCashTransactionSummary";
const SECURITY_SUMMARY_TYPE = "BrokerSecurityTransactionSummary";

/**
 * Security order statuses (from `sc broker transactions --status`) where no cash has moved yet, or
 * never will. Such rows are skipped and picked up on a later sync once they are FILLED/SETTLED;
 * inserting them early would freeze a wrong amount (Lunch Money dedups by external_id).
 */
const SC_NOT_EXECUTED_STATUSES = new Set([
  "CREATED",
  "REQUESTED",
  "PENDING",
  "PARTIAL_FILLED",
  "CANCELLED",
  "CANCEL_REQUESTED",
  "EXPIRED",
  "REJECTED",
]);

/** Security deliveries in or out of the depot (no cash leg). */
const SC_NON_CASH_SECURITY_TYPES = new Set(["TRANSFER_IN", "TRANSFER_OUT", "SWAP_IN", "SWAP_OUT"]);

function normalizeEnum(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replaceAll(/[\s-]+/g, "_");
}

function parseDecimalAmount(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Scalable CLI transaction amount is not a finite number");
    }
    return value;
  }
  if (value === null || value === undefined) {
    throw new Error("Scalable CLI transaction is missing amount");
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

function isCashAffectingSecurityItem(item: ScTransactionSummary): boolean {
  if (item.summary_type !== SECURITY_SUMMARY_TYPE) {
    return false;
  }
  if (SC_NOT_EXECUTED_STATUSES.has(normalizeEnum(item.status))) {
    return false;
  }
  return !SC_NON_CASH_SECURITY_TYPES.has(normalizeEnum(item.security_transaction_type));
}

/**
 * Cash summaries and executed security trades both move brokerage cash; everything else (crypto,
 * pending/cancelled orders, depot transfers) is skipped.
 */
function normalizeItem(item: ScTransactionSummary): ScalableCapitalTransaction | null {
  const isCash = item.summary_type === CASH_SUMMARY_TYPE;
  if (!isCash && !isCashAffectingSecurityItem(item)) {
    return null;
  }
  if (item.is_cancellation === true) {
    return null;
  }
  if (!item.last_event_datetime) {
    throw new Error(
      `Scalable CLI ${isCash ? "cash" : "security"} transaction ${item.id} is missing last_event_datetime`,
    );
  }
  const normalized = {
    id: item.id,
    date: item.last_event_datetime,
    type: isCash ? "BrokerCashTransaction" : "BrokerSecurityTransaction",
    description: item.description?.trim() ?? "",
    amount: parseDecimalAmount(item.amount),
    currency: item.currency?.trim() || "EUR",
    ...structuredTypeFields(item),
  };
  return scalableCapitalTransactionSchema.parse(normalized);
}

/** Structured backend enums used by classification; omitted when blank. */
function structuredTypeFields(
  item: ScTransactionSummary,
): Pick<Partial<ScalableCapitalTransaction>, "cashTransactionType" | "securityTransactionType" | "side"> {
  const cashTransactionType = item.cash_transaction_type?.trim();
  const securityTransactionType = item.security_transaction_type?.trim();
  const side = item.side?.trim();
  return {
    ...(cashTransactionType ? { cashTransactionType } : {}),
    ...(securityTransactionType ? { securityTransactionType } : {}),
    ...(side ? { side } : {}),
  };
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
  context: ScalableFetchContext,
  cursor?: string,
): Promise<{
  transactions: ScalableCapitalTransaction[];
  summaries: ScTransactionSummary[];
  cursor: string | null | undefined;
}> {
  const envelope = await runScJsonCommand(runner, config, buildTransactionsArgv(config, cursor), context);
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
    .map((item) => normalizeItem(item))
    .filter((tx): tx is ScalableCapitalTransaction => tx !== null);
  return { transactions, summaries, cursor: dataParsed.data.result.cursor };
}

async function paginateBrokerTransactionPages<T>(
  runner: ScCliRunner,
  config: ScalableCapitalCliConfig,
  context: ScalableFetchContext,
  pick: (page: Awaited<ReturnType<typeof runTransactionsPage>>) => readonly T[],
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  let sessionActiveEmitted = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await runTransactionsPage(runner, config, context, cursor);
    if (!sessionActiveEmitted) {
      sessionActiveEmitted = true;
      context.loginEvents?.({
        kind: "broker_login",
        broker: "scalable-capital",
        phase: "session_active",
      });
    }
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
  context: ScalableFetchContext = {},
): Promise<ScTransactionSummary[]> {
  return paginateBrokerTransactionPages(runner, config, context, (page) => page.summaries);
}

/** Fetches every page of cash-affecting broker transactions (cash rows + executed trades). */
export function fetchAllScalableCapitalTransactions(
  runner: ScCliRunner,
  config: ScalableCapitalCliConfig,
  context: ScalableFetchContext = {},
): Promise<ScalableCapitalTransaction[]> {
  return paginateBrokerTransactionPages(runner, config, context, (page) => page.transactions);
}

export function createDefaultScCliRunner(config: ScalableCapitalCliConfig): ScCliRunner {
  return createScCliRunner(config.scBinaryPath ?? "sc", config.cliSubprocessTimeoutMs);
}
