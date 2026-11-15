import { z } from "zod";
import { runScJsonCommand, withPortfolioId } from "./sc-command.js";
import type { ScalableCapitalCliConfig, ScMachineEnvelope } from "./types.js";
import { parseBrokerDecimal } from "../shared/decimal.js";
import type { ScCliRunner } from "../shared/subprocess-cli.js";

const decimalSchema = z.union([z.string(), z.number()]);
const optionalDecimalSchema = z.union([decimalSchema, z.null()]).optional();

/** `sc broker overview --json` → only the valuation fields are read (unknown keys are dropped). */
const scOverviewDataSchema = z.object({
  result: z.object({
    valuation: z.object({
      securities: decimalSchema,
      crypto: optionalDecimalSchema,
      total: optionalDecimalSchema,
    }),
    timestamps: z
      .object({ valuation_timestamp_utc: z.union([z.string(), z.null()]).optional() })
      .optional(),
  }),
});

/** `sc broker cash-breakdown --json` → only `cash_balance` is read. */
const scCashBreakdownDataSchema = z.object({
  result: z.object({ cash_balance: decimalSchema }),
});

/** `sc overnight --json` → only the balance is read; account identifiers are dropped unread. */
const scOvernightDataSchema = z.object({
  result: z.object({ balance: decimalSchema }),
});

export interface ScBrokerValuation {
  /** Securities plus crypto market value, excluding brokerage cash. */
  readonly holdingsValue: number;
  /** Broker valuation timestamp (ISO 8601) when the CLI reports one. */
  readonly asOf?: string;
}

function parseData<T>(envelope: ScMachineEnvelope, schema: z.ZodType<T>, command: string): T {
  const parsed = schema.safeParse(envelope.data);
  if (!parsed.success) {
    throw new Error(`Scalable CLI ${command} data didn't match the expected shape: ${parsed.error.message}`);
  }
  return parsed.data;
}

function requireDecimal(value: unknown, label: string): number {
  const parsed = parseBrokerDecimal(value);
  if (parsed === null) {
    throw new Error(`Scalable CLI ${label} is not numeric`);
  }
  return parsed;
}

function optionalDecimal(value: unknown, label: string): number {
  return value === null || value === undefined ? 0 : requireDecimal(value, label);
}

export function parseScBrokerValuation(envelope: ScMachineEnvelope): ScBrokerValuation {
  const data = parseData(envelope, scOverviewDataSchema, "broker overview");
  const { valuation, timestamps } = data.result;
  const securities = requireDecimal(valuation.securities, "valuation.securities");
  const crypto = optionalDecimal(valuation.crypto, "valuation.crypto");
  const asOf = timestamps?.valuation_timestamp_utc?.trim();
  return {
    holdingsValue: Math.round((securities + crypto) * 100) / 100,
    ...(asOf && !Number.isNaN(Date.parse(asOf)) ? { asOf } : {}),
  };
}

export function parseScCashBalance(envelope: ScMachineEnvelope): number {
  const data = parseData(envelope, scCashBreakdownDataSchema, "broker cash-breakdown");
  return requireDecimal(data.result.cash_balance, "cash_balance");
}

export function parseScOvernightBalance(envelope: ScMachineEnvelope): number {
  const data = parseData(envelope, scOvernightDataSchema, "overnight");
  return requireDecimal(data.result.balance, "overnight balance");
}

export async function fetchScalableBrokerValuation(
  runner: ScCliRunner,
  config: ScalableCapitalCliConfig,
): Promise<ScBrokerValuation> {
  const envelope = await runScJsonCommand(runner, config, withPortfolioId(["broker", "overview", "--json"], config));
  return parseScBrokerValuation(envelope);
}

export async function fetchScalableCashBalance(
  runner: ScCliRunner,
  config: ScalableCapitalCliConfig,
): Promise<number> {
  const envelope = await runScJsonCommand(
    runner,
    config,
    withPortfolioId(["broker", "cash-breakdown", "--json"], config),
  );
  return parseScCashBalance(envelope);
}

/** The overnight savings account is not part of a broker portfolio, so no `--portfolio-id`. */
export async function fetchScalableOvernightBalance(
  runner: ScCliRunner,
  config: ScalableCapitalCliConfig,
): Promise<number> {
  const envelope = await runScJsonCommand(runner, config, ["overnight", "--json"]);
  return parseScOvernightBalance(envelope);
}
