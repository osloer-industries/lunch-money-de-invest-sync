import { describe, expect, it } from "vitest";
import type { CanonicalTransaction } from "./transaction.js";
import { tagSharedExpenses } from "./tagging.js";

function tx(overrides: Partial<CanonicalTransaction> = {}): CanonicalTransaction {
  return {
    externalId: "id-1",
    date: "2026-07-01",
    amount: -10,
    currency: "eur",
    payee: "Supermarket",
    source: "trade-republic",
    ...overrides,
  };
}

describe("tagSharedExpenses", () => {
  it("leaves transactions untouched when no shared cards are configured", () => {
    const result = tagSharedExpenses([tx()], []);
    expect(result[0]?.tags).toBeUndefined();
  });

  it("tags a transaction whose notes mention a shared card's last 4 digits", () => {
    const result = tagSharedExpenses([tx({ notes: "Card ending 1234" })], ["1234"]);
    expect(result[0]?.tags).toEqual(["shared"]);
  });

  it("tags a transaction whose payee mentions a shared card's last 4 digits", () => {
    const result = tagSharedExpenses([tx({ payee: "Store 1234" })], ["1234"]);
    expect(result[0]?.tags).toEqual(["shared"]);
  });

  it("doesn't tag a transaction that matches no configured card", () => {
    const result = tagSharedExpenses([tx({ notes: "Card ending 9999" })], ["1234"]);
    expect(result[0]?.tags).toBeUndefined();
  });

  it("preserves existing tags and doesn't duplicate the shared tag", () => {
    const result = tagSharedExpenses([tx({ notes: "1234", tags: ["shared", "groceries"] })], ["1234"]);
    expect(result[0]?.tags).toEqual(["shared", "groceries"]);
  });

  it("doesn't mutate the input transactions", () => {
    const original = tx({ notes: "1234" });
    tagSharedExpenses([original], ["1234"]);
    expect(original.tags).toBeUndefined();
  });
});
