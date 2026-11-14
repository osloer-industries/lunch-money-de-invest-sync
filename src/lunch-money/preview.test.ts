import { describe, expect, it, vi } from "vitest";
import { loadExistingExternalIds, previewUpsert } from "./preview.js";
import type { TransactionsApi } from "./upsert.js";

function listClient(pages: Array<{ external_id?: string | null }[]>): TransactionsApi {
  let call = 0;
  return {
    transactions: {
      create: vi.fn(),
      getAll: vi.fn(() => {
        const chunk = pages[call];
        call += 1;
        if (!chunk) {
          return Promise.resolve({ transactions: [], hasMore: false });
        }
        return Promise.resolve({ transactions: chunk, hasMore: call < pages.length });
      }),
    },
  };
}

describe("loadExistingExternalIds", () => {
  it("paginates until hasMore is false", async () => {
    const client = listClient([[{ external_id: "a" }], [{ external_id: "b" }]]);
    const ids = await loadExistingExternalIds(client, 1);
    expect(ids).toEqual(new Set(["a", "b"]));
    expect(client.transactions.getAll).toHaveBeenCalledTimes(2);
  });
});

describe("loadExistingExternalIds", () => {
  it("requires transactions.getAll", async () => {
    const client: TransactionsApi = { transactions: { create: vi.fn() } };
    await expect(loadExistingExternalIds(client, 1)).rejects.toThrow(/requires a Lunch Money client/);
  });
});

describe("previewUpsert", () => {
  it("classifies rows as insert or skip_duplicate using GET data only", async () => {
    const client = listClient([[{ external_id: "trade-republic:1" }]]);
    const summary = await previewUpsert(
      client,
      [
        {
          externalId: "trade-republic:1",
          date: "2026-01-01",
          amount: -1,
          currency: "eur",
          payee: "A",
          canonicalType: "unknown",
          source: "trade-republic",
        },
        {
          externalId: "trade-republic:2",
          date: "2026-01-02",
          amount: -2,
          currency: "eur",
          payee: "B",
          canonicalType: "unknown",
          source: "trade-republic",
        },
      ],
      9,
    );
    expect(summary.wouldInsert).toBe(1);
    expect(summary.wouldSkip).toBe(1);
    expect(summary.lines[0]?.amount).toBe(1);
    expect(summary.lines[1]?.amount).toBe(2);
    expect(client.transactions.create).not.toHaveBeenCalled();
  });
});
