import { describe, expect, it } from "vitest";
import { groupTypeObservations } from "./canonical-type.js";

describe("groupTypeObservations", () => {
  it("groups rows by source, canonical type, and broker subtype", () => {
    const groups = groupTypeObservations([
      {
        canonicalType: "deposit",
        brokerSubtype: "BrokerCashTransactionSummary",
        source: "scalable-capital",
        amount: 10,
        currency: "eur",
        payee: "Deposit",
        date: "2026-01-01",
      },
      {
        canonicalType: "deposit",
        brokerSubtype: "BrokerCashTransactionSummary",
        source: "scalable-capital",
        amount: 20,
        currency: "eur",
        payee: "Deposit",
        date: "2026-01-02",
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.count).toBe(2);
  });
});
