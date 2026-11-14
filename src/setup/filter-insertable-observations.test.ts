import { describe, expect, it } from "vitest";
import { filterInsertableTypeObservations } from "./filter-insertable-observations.js";
import type { TypeObservation } from "../shared/canonical-type.js";

const scBuy: TypeObservation = {
  canonicalType: "buy",
  brokerSubtype: "BrokerSecurityTransactionSummary",
  source: "scalable-capital",
  amount: 50,
  currency: "eur",
  payee: "Buy ETF",
  date: "2026-01-01",
};

const scDeposit: TypeObservation = {
  canonicalType: "deposit",
  brokerSubtype: "BrokerCashTransactionSummary",
  source: "scalable-capital",
  amount: 50,
  currency: "eur",
  payee: "Deposit",
  date: "2026-01-01",
};

describe("filterInsertableTypeObservations", () => {
  it("drops Scalable security summaries when only Scalable profiles exist", () => {
    const result = filterInsertableTypeObservations([scBuy, scDeposit], {
      lunchMoneyApiKey: "k",
      sharedCardLast4: [],
      tradeRepublicProfiles: [],
      scalableCapitalProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }],
      categoryMap: {},
      tagMap: {},
    });
    expect(result).toEqual([scDeposit]);
  });

  it("keeps Scalable security summaries when Trade Republic profiles also exist", () => {
    const result = filterInsertableTypeObservations([scBuy], {
      lunchMoneyApiKey: "k",
      sharedCardLast4: [],
      tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }],
      scalableCapitalProfiles: [{ owner: "operator-b", lunchMoneyAssetId: 2 }],
      categoryMap: {},
      tagMap: {},
    });
    expect(result).toEqual([scBuy]);
  });
});