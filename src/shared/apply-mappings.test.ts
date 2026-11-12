import { describe, expect, it } from "vitest";
import { applyCategoryTagMappings } from "./apply-mappings.js";
import type { CanonicalTransaction } from "./transaction.js";

function tx(overrides: Partial<CanonicalTransaction> = {}): CanonicalTransaction {
  return {
    externalId: "id-1",
    date: "2026-07-01",
    amount: -10,
    currency: "eur",
    payee: "Payee",
    canonicalType: "deposit",
    source: "scalable-capital",
    ...overrides,
  };
}

describe("applyCategoryTagMappings", () => {
  it("applies category ids and configured tags", () => {
    const result = applyCategoryTagMappings([tx()], { deposit: 42 }, { deposit: ["investment"] });
    expect(result[0]).toMatchObject({
      categoryId: 42,
      tags: ["investment"],
    });
  });

  it("adds needs-review for unknown types", () => {
    const result = applyCategoryTagMappings([tx({ canonicalType: "unknown" })], {}, {});
    expect(result[0]?.tags).toEqual(["needs-review"]);
  });
});
