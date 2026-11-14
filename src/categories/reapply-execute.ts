import type { ReapplyChange } from "./reapply-plan.js";

const UPDATE_BATCH_SIZE = 500;

export interface TransactionUpdateApi {
  transactions: {
    updateMany: (data: {
      transactions: Array<{ id: number; category_id?: number | null; tag_ids?: number[] }>;
    }) => Promise<unknown>;
  };
}

export interface ReapplyExecuteSummary {
  readonly updatedCount: number;
}

function buildUpdateBody(change: ReapplyChange): { id: number; category_id?: number | null; tag_ids?: number[] } {
  const body: { id: number; category_id?: number | null; tag_ids?: number[] } = { id: change.transactionId };
  body.category_id = change.categoryId;
  body.tag_ids = change.tagIds;
  return body;
}

async function applyBatchFromOffset(
  client: TransactionUpdateApi,
  changes: readonly ReapplyChange[],
  offset: number,
): Promise<number> {
  if (offset >= changes.length) {
    return 0;
  }
  const batch = changes.slice(offset, offset + UPDATE_BATCH_SIZE);
  await client.transactions.updateMany({
    transactions: batch.map((change) => buildUpdateBody(change)),
  });
  return batch.length + (await applyBatchFromOffset(client, changes, offset + UPDATE_BATCH_SIZE));
}

export function executeReapplyChanges(
  client: TransactionUpdateApi,
  changes: readonly ReapplyChange[],
): Promise<ReapplyExecuteSummary> {
  if (changes.length === 0) {
    return Promise.resolve({ updatedCount: 0 });
  }
  return applyBatchFromOffset(client, changes, 0).then((updatedCount) => ({ updatedCount }));
}