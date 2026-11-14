import { classifyScalableSummary } from "../shared/broker-type-classification.js";
import type { CanonicalType } from "../shared/canonical-type.js";
import { toCurrency, type CanonicalTransaction } from "../shared/transaction.js";
import { utcCalendarDateFromIsoTimestamp } from "../shared/utc-calendar-date.js";
import type { ScalableCapitalTransaction } from "./types.js";

/**
 * Cash rows (deposits, withdrawals, transfers, fees, interest, ...) and executed security trades
 * (buy, sell, savings plan) both change the brokerage cash balance. Syncing both keeps the Lunch
 * Money cash account equal to Scalable's own `cash_balance`, like Trade Republic.
 */
const CASH_TRANSACTION_TYPE = "BrokerCashTransaction";
const SECURITY_TRANSACTION_TYPE = "BrokerSecurityTransaction";

/** Lunch Money `date` uses the UTC calendar day of the broker event timestamp. */
export function utcCalendarDateFromEventTimestamp(eventTimestamp: string): string {
  return utcCalendarDateFromIsoTimestamp(eventTimestamp, "Scalable Capital event");
}

export function isCashMovement(transaction: ScalableCapitalTransaction): boolean {
  return transaction.type === CASH_TRANSACTION_TYPE;
}

export function isSecurityTrade(transaction: ScalableCapitalTransaction): boolean {
  return transaction.type === SECURITY_TRANSACTION_TYPE;
}

/**
 * Security summaries are normalized to the canonical cash sign by trade direction (a buy or
 * savings-plan execution spends cash, a sell returns it), independent of how `sc` signs `amount`.
 */
function canonicalSecurityAmount(canonicalType: CanonicalType, amount: number): number {
  return canonicalType === "sell" ? Math.abs(amount) : -Math.abs(amount);
}

export function mapScalableCapitalTransaction(
  transaction: ScalableCapitalTransaction,
): CanonicalTransaction | null {
  const security = isSecurityTrade(transaction);
  if (!security && !isCashMovement(transaction)) {
    return null;
  }
  const observed = classifyScalableSummary({
    id: transaction.id,
    summary_type: security ? "BrokerSecurityTransactionSummary" : "BrokerCashTransactionSummary",
    description: transaction.description,
    amount: transaction.amount,
    currency: transaction.currency,
    last_event_datetime: transaction.date,
    is_cancellation: false,
    ...(transaction.cashTransactionType ? { cash_transaction_type: transaction.cashTransactionType } : {}),
    ...(transaction.securityTransactionType
      ? { security_transaction_type: transaction.securityTransactionType }
      : {}),
    ...(transaction.side ? { side: transaction.side } : {}),
  });
  if (!observed) {
    return null;
  }
  return {
    externalId: `scalable-capital:${transaction.id}`,
    date: utcCalendarDateFromEventTimestamp(transaction.date),
    amount: security ? canonicalSecurityAmount(observed.canonicalType, transaction.amount) : transaction.amount,
    currency: toCurrency(transaction.currency),
    payee: transaction.description || "Scalable Capital",
    canonicalType: observed.canonicalType,
    source: "scalable-capital",
  };
}

export function mapScalableCapitalTransactions(
  transactions: readonly ScalableCapitalTransaction[],
): CanonicalTransaction[] {
  return transactions
    .map(mapScalableCapitalTransaction)
    .filter((tx): tx is CanonicalTransaction => tx !== null);
}
