import { describe, expect, it } from "vitest";
import type { CanonicalTransaction } from "../shared/transaction.js";
import type { ListedTransaction } from "./lm-transactions.js";
import { planReapplyForAccount, summarizeReapplyPlan } from "./reapply-plan.js";

function tx(overrides: Partial<CanonicalTransaction> = {}): CanonicalTransaction {
  return {
    externalId: "trade-republic:evt-1",
    date: "2026-01-01",
    amount: 10,
    currency: "eur",
    payee: "Broker",
    canonicalType: "deposit",
    source: "trade-republic",
    categoryId: 55,
    tags: ["needs-review"],
    ...overrides,
  };
}

function listed(overrides: Partial<ListedTransaction> = {}): ListedTransaction {
  return {
    id: 100,
    externalId: "trade-republic:evt-1",
    categoryId: 1,
    tagIds: [9],
    ...overrides,
  };
}

describe("planReapplyForAccount", () => {
  const tagMap = { deposit: ["bank"] };
  const tagIdByName = new Map([
    ["bank", 2],
    ["needs-review", 9],
    ["custom", 7],
  ]);
  const tagNameById = new Map([
    [2, "bank"],
    [9, "needs-review"],
    [7, "custom"],
  ]);

  it("plans category and managed tag updates while keeping operator tags", () => {
    const plan = planReapplyForAccount(
      [tx({ categoryId: 55, tags: ["bank", "needs-review"] })],
      new Map([[listed().externalId, listed({ categoryId: 1, tagIds: [7, 9] })]]),
      tagMap,
      tagIdByName,
      tagNameById,
    );
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]?.categoryId).toBe(55);
    expect(plan.changes[0]?.tagIds).toEqual([2, 7, 9]);
  });

  it("is idempotent when lunch money already matches", () => {
    const mapped = tx({ categoryId: 55, tags: ["bank"] });
    const existing = listed({ categoryId: 1, tagIds: [7] });
    const first = planReapplyForAccount([mapped], new Map([[existing.externalId, existing]]), tagMap, tagIdByName, tagNameById);
    expect(first.changes).toHaveLength(1);
    const updatedExisting: ListedTransaction = {
      ...existing,
      categoryId: first.changes[0]!.categoryId,
      tagIds: first.changes[0]!.tagIds,
    };
    const second = planReapplyForAccount(
      [mapped],
      new Map([[updatedExisting.externalId, updatedExisting]]),
      tagMap,
      tagIdByName,
      tagNameById,
    );
    expect(second.changes).toHaveLength(0);
    expect(second.unchanged).toBe(1);
  });

  it("counts broker rows missing from Lunch Money", () => {
    const plan = planReapplyForAccount(
      [tx({ externalId: "trade-republic:missing" })],
      new Map(),
      tagMap,
      tagIdByName,
      tagNameById,
    );
    expect(plan.skippedMissingInLunchMoney).toBe(1);
    expect(plan.changes).toHaveLength(0);
  });

  it("summarizes multiple account plans", () => {
    const summary = summarizeReapplyPlan([
      { changes: [{ transactionId: 1, externalId: "a", categoryId: 2, tagIds: [], previousCategoryId: 1, previousTagIds: [] }], skippedMissingInLunchMoney: 0, unchanged: 1 },
      { changes: [], skippedMissingInLunchMoney: 2, unchanged: 3 },
    ]);
    expect(summary).toEqual({ wouldUpdate: 1, unchanged: 4, skippedMissingInLunchMoney: 2 });
  });

  it("rejects unknown tag names during planning", () => {
    expect(() =>
      planReapplyForAccount(
        [tx({ tags: ["not-created"] })],
        new Map([[listed().externalId, listed()]]),
        tagMap,
        tagIdByName,
        tagNameById,
      ),
    ).toThrow(/Unknown tag/);
  });
});