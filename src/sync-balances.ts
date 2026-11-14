import type { BalanceReading, BrokerBalanceSnapshot } from "./shared/broker-balances.js";
import { formatMoney } from "./shared/decimal.js";
import {
  getManualAccountBalance,
  setManualAccountBalance,
  type ManualAccountBalanceApi,
} from "./lunch-money/manual-account-balance.js";

/** Lunch Money cash may drift from the broker by rounding; anything above this is reported. */
export const CASH_RECONCILIATION_TOLERANCE = 1;

export interface BalanceSyncParams {
  /** Log prefix, e.g. `[scalable-capital:me]`. */
  readonly label: string;
  readonly snapshot: BrokerBalanceSnapshot;
  readonly cashAccountId: number;
  readonly holdingsAccountId?: number | undefined;
  readonly savingsAccountId?: number | undefined;
  /**
   * Canonical sum of rows a dry-run would still insert (0 after a real sync), so the dry-run
   * reconciliation compares the balance Lunch Money will have after the sync.
   */
  readonly pendingCashDelta: number;
  readonly client: ManualAccountBalanceApi;
  readonly logger: (message: string) => void;
  readonly dryRun: boolean;
  readonly reconcileCash: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

async function syncTrackedBalance(
  params: BalanceSyncParams,
  kind: string,
  accountId: number | undefined,
  reading: BalanceReading | undefined,
): Promise<boolean> {
  if (accountId === undefined || reading === undefined) {
    return true;
  }
  const { label, client, logger } = params;
  if (!reading.ok) {
    logger(`${label} warning: could not read ${kind} from the broker — ${reading.error}`);
    return false;
  }
  const target = formatMoney(reading.value, reading.currency);
  const asOf = reading.asOf ? ` (as of ${reading.asOf})` : "";
  try {
    if (params.dryRun) {
      const current = await getManualAccountBalance(client, accountId);
      logger(
        `${label} dry-run: would set ${kind} to ${target}${asOf}; Lunch Money currently ${formatMoney(current.balance, current.currency)}`,
      );
      return true;
    }
    await setManualAccountBalance(client, accountId, reading.value, reading.asOf);
    logger(`${label} ${kind} set to ${target}${asOf}`);
    return true;
  } catch (error) {
    logger(`${label} warning: could not update ${kind} in Lunch Money account ${accountId} — ${errorMessage(error)}`);
    return false;
  }
}

async function reconcileCash(params: BalanceSyncParams): Promise<boolean> {
  const { label, client, logger, snapshot } = params;
  const reading = snapshot.cash;
  if (reading === undefined) {
    return true;
  }
  if (!reading.ok) {
    logger(`${label} warning: could not read broker cash for reconciliation — ${reading.error}`);
    return false;
  }
  try {
    const current = await getManualAccountBalance(client, params.cashAccountId);
    if (current.currency !== reading.currency) {
      logger(
        `${label} warning: cash reconciliation skipped — Lunch Money account currency ${current.currency.toUpperCase()} differs from broker ${reading.currency.toUpperCase()}`,
      );
      return true;
    }
    const expected = roundCents(current.balance + params.pendingCashDelta);
    const broker = formatMoney(reading.value, reading.currency);
    const lunchMoney = `${params.pendingCashDelta === 0 ? "Lunch Money" : "Lunch Money (after pending inserts)"} ${formatMoney(expected, current.currency)}`;
    const difference = roundCents(expected - reading.value);
    if (Math.abs(difference) <= CASH_RECONCILIATION_TOLERANCE) {
      logger(`${label} cash reconciled: ${lunchMoney}, broker ${broker}`);
      return true;
    }
    if (!params.reconcileCash) {
      logger(
        `${label} warning: cash mismatch — ${lunchMoney}, broker ${broker} (difference ${formatMoney(difference, current.currency)}). ` +
          "Check for missing or extra transactions and the account's starting balance, or re-run with --reconcile-cash to set the Lunch Money cash balance to the broker value.",
      );
      return true;
    }
    if (params.dryRun) {
      logger(`${label} dry-run: would set cash balance to ${broker} (--reconcile-cash; ${lunchMoney})`);
      return true;
    }
    await setManualAccountBalance(client, params.cashAccountId, reading.value);
    logger(`${label} cash balance set to broker value ${broker} (--reconcile-cash; was ${formatMoney(expected, current.currency)})`);
    return true;
  } catch (error) {
    logger(`${label} warning: cash reconciliation failed — ${errorMessage(error)}`);
    return false;
  }
}

/**
 * Applies broker balances to Lunch Money after the transaction sync: holdings and savings accounts
 * get their balance set, the cash account is reconciled. Returns how many steps failed; failures are
 * logged as warnings and never abort the remaining steps or profiles.
 */
export async function syncBrokerBalances(params: BalanceSyncParams): Promise<number> {
  for (const note of params.snapshot.notes) {
    params.logger(`${params.label} note: ${note}`);
  }
  const results = [
    await syncTrackedBalance(params, "holdings value", params.holdingsAccountId, params.snapshot.holdings),
    await syncTrackedBalance(params, "overnight savings balance", params.savingsAccountId, params.snapshot.savings),
    await reconcileCash(params),
  ];
  return results.filter((ok) => !ok).length;
}
