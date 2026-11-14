import { classifyScalableSummary } from "../shared/broker-type-classification.js";
import { toCurrency, type CanonicalTransaction } from "../shared/transaction.js";
import { utcCalendarDateFromIsoTimestamp } from "../shared/utc-calendar-date.js";
import type { ScalableCapitalTransaction } from "./types.js";

/**
 * Only broker cash transactions (deposits, withdrawals, fees, interest) represent household
 * spend/income worth tracking in Lunch Money. Security trades (buys/sells) are investment
 * activity internal to the account, not budgetable transactions — extend this set if you
 * want those synced too.
 */
const CASH_TRANSACTION_TYPE = "BrokerCashTransaction";

/** Lunch Money `date` uses the UTC calendar day of the broker event timestamp. */
export function utcCalendarDateFromEventTimestamp(eventTimestamp: string): string {
  return utcCalendarDateFromIsoTimestamp(eventTimestamp, "Scalable Capital event");
}

export function isCashMovement(transaction: ScalableCapitalTransaction): boolean {
  return transaction.type === CASH_TRANSACTION_TYPE;
}

export function mapScalableCapitalTransaction(
  transaction: ScalableCapitalTransaction,
): CanonicalTransaction | null {
  if (!isCashMovement(transaction)) {
    return null;
  }
  const observed = classifyScalableSummary({
    id: transaction.id,
    summary_type: "BrokerCashTransactionSummary",
    description: transaction.description,
    amount: transaction.amount,
    currency: transaction.currency,
    last_event_datetime: transaction.date,
    is_cancellation: false,
    ...(transaction.cashTransactionType ? { cash_transaction_type: transaction.cashTransactionType } : {}),
  });
  if (!observed) {
    return null;
  }
  return {
    externalId: `scalable-capital:${transaction.id}`,
    date: utcCalendarDateFromEventTimestamp(transaction.date),
    amount: transaction.amount,
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
