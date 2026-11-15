import type { ScalableCapitalProfile, TradeRepublicProfile } from "./config.js";
import { pytrConfigFromProfile, scConfigFromProfile } from "./profile-cli-config.js";
import { createDefaultScCliRunner } from "../scalable-capital/client.js";
import {
  fetchScalableBrokerValuation,
  fetchScalableCashBalance,
  fetchScalableOvernightBalance,
} from "../scalable-capital/balances.js";
import { createDefaultPytrCliRunner } from "../trade-republic/client.js";
import { fetchTradeRepublicPortfolio } from "../trade-republic/portfolio.js";

/** One broker-reported balance, or why it could not be read. */
export type BalanceReading =
  | { readonly ok: true; readonly value: number; readonly currency: string; readonly asOf?: string }
  | { readonly ok: false; readonly error: string };

/**
 * Balances read from the broker after the transaction sync. Each field is only present when the
 * profile needs it; a failed read never throws, so the transaction sync is never blocked by it.
 */
export interface BrokerBalanceSnapshot {
  /** Securities (+ crypto) market value, excluding cash. */
  readonly holdings?: BalanceReading;
  /** Broker-reported cash in the account the transactions are synced into. */
  readonly cash?: BalanceReading;
  /** Scalable overnight savings ("Tagesgeld") balance. */
  readonly savings?: BalanceReading;
  /** Non-fatal notes for the operator (e.g. positions the broker could not price). */
  readonly notes: readonly string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function read(
  fetch: () => Promise<{ value: number; currency: string; asOf?: string }>,
): Promise<BalanceReading> {
  try {
    return { ok: true, ...(await fetch()) };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

/** One `pytr portfolio` run yields both the securities value and the cash line. */
export async function readTradeRepublicBalances(profile: TradeRepublicProfile): Promise<BrokerBalanceSnapshot> {
  const config = pytrConfigFromProfile(profile);
  try {
    const portfolio = await fetchTradeRepublicPortfolio(createDefaultPytrCliRunner(config), config);
    const notes =
      portfolio.missingPriceCount > 0
        ? [`pytr could not price ${portfolio.missingPriceCount} position(s); holdings value excludes them`]
        : [];
    return {
      holdings: { ok: true, value: portfolio.securitiesValue, currency: "eur" },
      cash: portfolio.cash
        ? { ok: true, value: portfolio.cash.amount, currency: portfolio.cash.currency }
        : { ok: false, error: "pytr portfolio did not print a `Cash` line" },
      notes,
    };
  } catch (error) {
    const failed: BalanceReading = { ok: false, error: errorMessage(error) };
    return { holdings: failed, cash: failed, notes: [] };
  }
}

/** Runs only the `sc` commands the profile needs (cash is always read for reconciliation). */
export async function readScalableCapitalBalances(profile: ScalableCapitalProfile): Promise<BrokerBalanceSnapshot> {
  const config = scConfigFromProfile(profile);
  const runner = createDefaultScCliRunner(config);
  const holdings =
    profile.holdingsAccountId === undefined
      ? undefined
      : await read(async () => {
          const valuation = await fetchScalableBrokerValuation(runner, config);
          return {
            value: valuation.holdingsValue,
            currency: "eur",
            ...(valuation.asOf ? { asOf: valuation.asOf } : {}),
          };
        });
  const cash = await read(async () => ({ value: await fetchScalableCashBalance(runner, config), currency: "eur" }));
  const savings =
    profile.savingsAccountId === undefined
      ? undefined
      : await read(async () => ({ value: await fetchScalableOvernightBalance(runner, config), currency: "eur" }));
  return {
    ...(holdings ? { holdings } : {}),
    cash,
    ...(savings ? { savings } : {}),
    notes: [],
  };
}
