import { describe, expect, it, vi } from "vitest";
import { executeReapplyChanges } from "./reapply-execute.js";

describe("executeReapplyChanges", () => {
  it("batches updateMany calls", async () => {
    const updateMany = vi.fn().mockResolvedValue({});
    const client = { transactions: { updateMany } };
    const summary = await executeReapplyChanges(client, [
      {
        transactionId: 1,
        externalId: "trade-republic:a",
        categoryId: 2,
        tagIds: [3],
        previousCategoryId: 1,
        previousTagIds: [],
      },
    ]);
    expect(summary.updatedCount).toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      transactions: [{ id: 1, category_id: 2, tag_ids: [3] }],
    });
  });

  it("splits large updates into multiple API batches", async () => {
    const updateMany = vi.fn().mockResolvedValue({});
    const client = { transactions: { updateMany } };
    const changes = Array.from({ length: 501 }, (_, index) => ({
      transactionId: index + 1,
      externalId: `trade-republic:${index}`,
      categoryId: 2,
      tagIds: [3],
      previousCategoryId: 1,
      previousTagIds: [],
    }));
    const summary = await executeReapplyChanges(client, changes);
    expect(summary.updatedCount).toBe(501);
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it("is a no-op for an empty plan", async () => {
    const updateMany = vi.fn();
    const summary = await executeReapplyChanges({ transactions: { updateMany } }, []);
    expect(summary.updatedCount).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});