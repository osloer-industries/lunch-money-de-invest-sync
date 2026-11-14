import { describe, expect, it } from "vitest";
import type { CanonicalTransaction } from "../shared/transaction.js";
import { computePytrLastDays, filterTransactionsSince, parseSinceDate } from "./since.js";

function tx(date: string): CanonicalTransaction {
  return {
    externalId: `id:${date}`,
    date,
    amount: 1,
    currency: "eur",
    payee: "Broker transfer",
    canonicalType: "deposit",
    source: "trade-republic",
  };
}

describe("since helpers", () => {
  it("parses ISO calendar dates", () => {
    expect(parseSinceDate(" 2024-06-01 ")).toBe("2024-06-01");
    expect(() => parseSinceDate("06-01-2024")).toThrow();
  });

  it("filters inclusively by date", () => {
    const rows = [tx("2024-05-31"), tx("2024-06-01"), tx("2024-06-02")];
    expect(filterTransactionsSince(rows, "2024-06-01").map((row) => row.date)).toEqual([
      "2024-06-01",
      "2024-06-02",
    ]);
  });

  it("computes pytr last_days including both endpoints", () => {
    expect(computePytrLastDays("2024-06-01", "2024-06-01")).toBe(1);
    expect(computePytrLastDays("2024-06-01", "2024-06-03")).toBe(3);
    expect(computePytrLastDays("2024-06-03", "2024-06-01")).toBe(1);
  });

  it("rejects invalid calendar strings", () => {
    expect(() => parseSinceDate("2024-13-40")).toThrow();
  });
});