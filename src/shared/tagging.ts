import type { CanonicalTransaction } from "./transaction.js";

const SHARED_TAG = "shared";

/**
 * Best-effort match: flags a transaction as shared when one of the household's shared
 * card last-4-digit strings shows up in the payee or notes text. Bank/broker exports vary
 * in whether (and how) they surface the card number, so verify this catches your real
 * transactions and adjust the matcher if your export formats it differently
 * (e.g. "•••• 1234" vs "ending in 1234").
 */
export function tagSharedExpenses(
  transactions: readonly CanonicalTransaction[],
  sharedCardLast4: readonly string[],
): CanonicalTransaction[] {
  if (sharedCardLast4.length === 0) {
    return transactions.slice();
  }
  return transactions.map((tx) => {
    const haystack = `${tx.payee} ${tx.notes ?? ""}`;
    const isShared = sharedCardLast4.some((last4) => haystack.includes(last4));
    if (!isShared || tx.tags?.includes(SHARED_TAG)) {
      return tx;
    }
    return { ...tx, tags: [...(tx.tags ?? []), SHARED_TAG] };
  });
}
