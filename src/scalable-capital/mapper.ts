import { toCurrency, type CanonicalTransaction } from "../shared/transaction.js";
import type { ScalableCapitalTransaction } from "./types.js";

/**
 * Only broker cash transactions (deposits, withdrawals, fees, interest) represent household
 * spend/income worth tracking in Lunch Money. Security trades (buys/sells) are investment
 * activity internal to the account, not budgetable transactions — extend this set if you
 * want those synced too.
 */
const CASH_TRANSACTION_TYPE = "BrokerCashTransaction";

export function isCashMovement(transaction: ScalableCapitalTransaction): boolean {
  return transaction.type === CASH_TRANSACTION_TYPE;
}

export function mapScalableCapitalTransaction(
  transaction: ScalableCapitalTransaction,
): CanonicalTransaction | null {
  if (!isCashMovement(transaction)) {
    return null;
  }
  return {
    externalId: `scalable-capital:${transaction.id}`,
    date: transaction.date.slice(0, 10),
    amount: transaction.amount,
    currency: toCurrency(transaction.currency),
    payee: transaction.description || "Scalable Capital",
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
