import type { Transaction } from "@lunch-money/lunch-money-js-v2";

export interface ListedTransaction {
  readonly id: number;
  readonly externalId: string;
  readonly categoryId: number | null;
  readonly tagIds: readonly number[];
}

export interface TransactionsListApi {
  transactions: {
    getAll: (params: {
      manual_account_id?: number;
      limit?: number;
      offset?: number;
    }) => Promise<{ transactions: Transaction[]; hasMore: boolean }>;
  };
}

function toListedTransaction(tx: Transaction): ListedTransaction | undefined {
  if (typeof tx.external_id !== "string" || tx.external_id.length === 0) {
    return undefined;
  }
  return {
    id: tx.id,
    externalId: tx.external_id,
    categoryId: tx.category_id ?? null,
    tagIds: [...(tx.tag_ids ?? [])],
  };
}

function isBrokerExternalId(externalId: string, brokerPrefixes: readonly string[]): boolean {
  return brokerPrefixes.some((prefix) => externalId.startsWith(`${prefix}:`));
}

async function loadBrokerTransactionsPage(
  client: TransactionsListApi,
  manualAccountId: number,
  brokerPrefixes: readonly string[],
  offset: number,
  found: Map<string, ListedTransaction>,
): Promise<Map<string, ListedTransaction>> {
  const page = await client.transactions.getAll({
    manual_account_id: manualAccountId,
    limit: 500,
    offset,
  });
  for (const raw of page.transactions) {
    const listed = toListedTransaction(raw);
    if (listed && isBrokerExternalId(listed.externalId, brokerPrefixes)) {
      found.set(listed.externalId, listed);
    }
  }
  if (!page.hasMore || page.transactions.length === 0) {
    return found;
  }
  return loadBrokerTransactionsPage(client, manualAccountId, brokerPrefixes, offset + page.transactions.length, found);
}

export function loadBrokerTransactionsByExternalId(
  client: TransactionsListApi,
  manualAccountId: number,
  brokerPrefixes: readonly string[] = ["trade-republic", "scalable-capital"],
): Promise<Map<string, ListedTransaction>> {
  return loadBrokerTransactionsPage(client, manualAccountId, brokerPrefixes, 0, new Map());
}