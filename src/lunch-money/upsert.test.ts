import { describe, expect, it, vi } from "vitest";
import type { CanonicalTransaction } from "../shared/transaction.js";
import { summarizeInsertResult, toInsertPayload, upsertTransactions } from "./upsert.js";
import type { TransactionsApi } from "./upsert.js";

function tx(overrides: Partial<CanonicalTransaction> = {}): CanonicalTransaction {
  return {
    externalId: "tr:evt-1",
    date: "2026-07-01",
    amount: -12.5,
    currency: "eur",
    payee: "Some Payee",
    canonicalType: "unknown",
    source: "trade-republic",
    ...overrides,
  };
}

describe("toInsertPayload", () => {
  it("maps canonical fields onto the Lunch Money insert shape", () => {
    const payload = toInsertPayload([tx()], 42, new Map());
    expect(payload.transactions).toEqual([
      {
        date: "2026-07-01",
        amount: -12.5,
        currency: "eur",
        payee: "Some Payee",
        notes: null,
        manual_account_id: 42,
        external_id: "tr:evt-1",
        category_id: null,
        tag_ids: [],
      },
    ]);
    expect(payload.skip_duplicates).toBe(false);
  });

  it("includes category_id when set on the canonical transaction", () => {
    const payload = toInsertPayload([tx({ categoryId: 77 })], 42, new Map());
    expect(payload.transactions[0]?.category_id).toBe(77);
  });

  it("resolves tag names to ids", () => {
    const payload = toInsertPayload(
      [tx({ tags: ["shared"] })],
      42,
      new Map([["shared", 7]]),
    );
    expect(payload.transactions[0]?.tag_ids).toEqual([7]);
  });

  it("throws if a transaction references a tag that wasn't resolved", () => {
    expect(() => toInsertPayload([tx({ tags: ["shared"] })], 42, new Map())).toThrow(/shared/);
  });
});

describe("summarizeInsertResult", () => {
  it("counts inserted and skipped transactions", () => {
    const summary = summarizeInsertResult({
      transactions: [{ id: 1 } as never, { id: 2 } as never],
      skipped_duplicates: [
        {
          reason: "duplicate_external_id",
          request_transaction: { external_id: "tr:evt-9" } as never,
        },
      ],
    });
    expect(summary).toEqual({
      insertedCount: 2,
      skippedCount: 1,
      skippedExternalIds: ["tr:evt-9"],
    });
  });

  it("ignores skipped entries without an external id", () => {
    const summary = summarizeInsertResult({
      transactions: [],
      skipped_duplicates: [{ reason: "duplicate_payee_amount_date" }],
    });
    expect(summary.skippedExternalIds).toEqual([]);
  });
});

describe("upsertTransactions", () => {
  it("skips the network call entirely for an empty batch", async () => {
    const create = vi.fn();
    const client: TransactionsApi = { transactions: { create } };
    const summary = await upsertTransactions(client, [], 42, new Map());
    expect(create).not.toHaveBeenCalled();
    expect(summary).toEqual({ insertedCount: 0, skippedCount: 0, skippedExternalIds: [] });
  });

  it("sends the built payload and summarizes the response", async () => {
    const create = vi.fn().mockResolvedValue({
      transactions: [{ id: 1 } as never],
      skipped_duplicates: [],
    });
    const client: TransactionsApi = { transactions: { create } };
    const summary = await upsertTransactions(client, [tx()], 42, new Map());
    expect(create).toHaveBeenCalledWith(toInsertPayload([tx()], 42, new Map()));
    expect(summary.insertedCount).toBe(1);
  });
});
