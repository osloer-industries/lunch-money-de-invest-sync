import type { CanonicalTransaction } from "../shared/transaction.js";
import type { TransactionsApi } from "./upsert.js";
import { toLunchMoneyV2Amount } from "./upsert.js";

export interface DryRunLine {
  readonly externalId: string;
  readonly date: string;
  readonly amount: number;
  readonly payee: string;
  readonly action: "insert" | "skip_duplicate";
}

export interface DryRunSummary {
  readonly wouldInsert: number;
  readonly wouldSkip: number;
  readonly lines: readonly DryRunLine[];
}

async function accumulateExternalIds(
  client: TransactionsApi,
  manualAccountId: number,
  offset: number,
  found: Set<string>,
): Promise<Set<string>> {
  const getAll = client.transactions.getAll;
  if (!getAll) {
    throw new Error("Dry-run preview requires a Lunch Money client with transactions.getAll");
  }
  const page = await getAll({
    manual_account_id: manualAccountId,
    limit: 500,
    offset,
  });
  for (const tx of page.transactions) {
    if (typeof tx.external_id === "string" && tx.external_id.length > 0) {
      found.add(tx.external_id);
    }
  }
  if (!page.hasMore || page.transactions.length === 0) {
    return found;
  }
  return accumulateExternalIds(client, manualAccountId, offset + page.transactions.length, found);
}

/** Lists existing external ids for a manual account using read-only Lunch Money GET requests. */
export async function loadExistingExternalIds(
  client: TransactionsApi,
  manualAccountId: number,
): Promise<Set<string>> {
  return accumulateExternalIds(client, manualAccountId, 0, new Set());
}

export async function previewUpsert(
  client: TransactionsApi,
  transactions: readonly CanonicalTransaction[],
  manualAccountId: number,
): Promise<DryRunSummary> {
  const existing = await loadExistingExternalIds(client, manualAccountId);
  const lines: DryRunLine[] = transactions.map((tx) => {
    const action = existing.has(tx.externalId) ? "skip_duplicate" : "insert";
    return {
      externalId: tx.externalId,
      date: tx.date,
      amount: toLunchMoneyV2Amount(tx.amount),
      payee: tx.payee,
      action,
    };
  });
  const wouldInsert = lines.filter((line) => line.action === "insert").length;
  const wouldSkip = lines.filter((line) => line.action === "skip_duplicate").length;
  return { wouldInsert, wouldSkip, lines };
}
