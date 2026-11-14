import type {
  CreateTransactionsBody,
  InsertTransactionsResponse,
} from "@lunch-money/lunch-money-js-v2";
import type { CanonicalTransaction } from "../shared/transaction.js";

export interface TransactionListItem {
  readonly external_id?: string | null;
}

/** Narrow slice of the client that upserting needs, so tests can pass a stub instead of a real client. */
export interface TransactionsApi {
  transactions: {
    create: (data: CreateTransactionsBody) => Promise<InsertTransactionsResponse>;
    getAll?: (params: {
      manual_account_id?: number;
      limit?: number;
      offset?: number;
    }) => Promise<{ transactions: TransactionListItem[]; hasMore: boolean }>;
  };
}

export interface UpsertSummary {
  insertedCount: number;
  skippedCount: number;
  skippedExternalIds: string[];
}

/**
 * Lunch Money v2 transaction amounts: positive = debit/outflow, negative = credit/inflow.
 * See https://lunchmoney.dev/amounts-and-balances and `@lunch-money/lunch-money-js-v2` create types.
 */
export function toLunchMoneyV2Amount(canonicalAmount: number): number {
  return -canonicalAmount;
}

/**
 * Builds the insert payload. Lunch Money dedups on (manual_account_id, external_id)
 * regardless of skip_duplicates, so re-running a sync for the same date range is safe.
 */
export function toInsertPayload(
  transactions: readonly CanonicalTransaction[],
  manualAccountId: number,
  tagIdsByName: ReadonlyMap<string, number>,
): CreateTransactionsBody {
  return {
    apply_rules: true,
    skip_duplicates: false,
    transactions: transactions.map((tx) => ({
      date: tx.date,
      amount: toLunchMoneyV2Amount(tx.amount),
      currency: tx.currency,
      payee: tx.payee,
      notes: tx.notes ?? null,
      manual_account_id: manualAccountId,
      external_id: tx.externalId,
      category_id: tx.categoryId ?? null,
      tag_ids: (tx.tags ?? []).map((name) => {
        const id = tagIdsByName.get(name);
        if (id === undefined) {
          throw new Error(`Unknown tag "${name}" — resolve it before building the insert payload`);
        }
        return id;
      }),
    })),
  };
}

export function summarizeInsertResult(response: InsertTransactionsResponse): UpsertSummary {
  return {
    insertedCount: response.transactions.length,
    skippedCount: response.skipped_duplicates.length,
    skippedExternalIds: response.skipped_duplicates
      .map((skip) => skip.request_transaction?.external_id)
      .filter((id): id is string => Boolean(id)),
  };
}

export async function upsertTransactions(
  client: TransactionsApi,
  transactions: readonly CanonicalTransaction[],
  manualAccountId: number,
  tagIdsByName: ReadonlyMap<string, number>,
): Promise<UpsertSummary> {
  if (transactions.length === 0) {
    return { insertedCount: 0, skippedCount: 0, skippedExternalIds: [] };
  }
  const response = await client.transactions.create(
    toInsertPayload(transactions, manualAccountId, tagIdsByName),
  );
  return summarizeInsertResult(response);
}
