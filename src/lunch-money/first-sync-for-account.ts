import type { TransactionsApi } from "./upsert.js";

const PAGE_LIMIT = 500;

export interface FirstSyncDetection {
  readonly firstSyncForAccount: boolean;
  readonly existingBrokerExternalIds: number;
}

async function countBrokerExternalIdsOnPage(
  client: TransactionsApi,
  manualAccountId: number,
  offset: number,
  prefixes: readonly string[],
  count: number,
): Promise<number> {
  const getAll = client.transactions.getAll;
  if (!getAll) {
    throw new Error("First-sync detection requires a Lunch Money client with transactions.getAll");
  }
  const page = await getAll({
    manual_account_id: manualAccountId,
    limit: PAGE_LIMIT,
    offset,
  });
  let next = count;
  for (const tx of page.transactions) {
    const externalId = tx.external_id;
    if (typeof externalId !== "string" || externalId.length === 0) {
      continue;
    }
    if (prefixes.some((prefix) => externalId.startsWith(prefix))) {
      next += 1;
    }
  }
  if (!page.hasMore || page.transactions.length === 0) {
    return next;
  }
  return countBrokerExternalIdsOnPage(client, manualAccountId, offset + page.transactions.length, prefixes, next);
}

/** True when the manual account has no Lunch Money rows with broker external_id prefixes yet. */
export async function detectFirstSyncForAccount(
  client: TransactionsApi,
  manualAccountId: number,
  brokerExternalIdPrefixes: readonly string[],
): Promise<FirstSyncDetection> {
  const existingBrokerExternalIds = await countBrokerExternalIdsOnPage(
    client,
    manualAccountId,
    0,
    brokerExternalIdPrefixes,
    0,
  );
  return {
    firstSyncForAccount: existingBrokerExternalIds === 0,
    existingBrokerExternalIds,
  };
}