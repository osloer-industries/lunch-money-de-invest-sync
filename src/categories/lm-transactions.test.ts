import { describe, expect, it, vi } from "vitest";
import { loadBrokerTransactionsByExternalId } from "./lm-transactions.js";

describe("loadBrokerTransactionsByExternalId", () => {
  it("skips rows without broker external ids and follows pages", async () => {
    const getAll = vi
      .fn()
      .mockResolvedValueOnce({
        transactions: [
          { id: 1, external_id: "trade-republic:a", category_id: null, tag_ids: [] },
          { id: 2, external_id: "manual:ignored", category_id: null, tag_ids: [] },
        ],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        transactions: [{ id: 3, external_id: "scalable-capital:b", category_id: null, tag_ids: [] }],
        hasMore: false,
      });
    const found = await loadBrokerTransactionsByExternalId({ transactions: { getAll } }, 9);
    expect([...found.keys()]).toEqual(["trade-republic:a", "scalable-capital:b"]);
    expect(getAll).toHaveBeenCalledTimes(2);
  });
});