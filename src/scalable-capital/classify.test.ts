import { describe, expect, it } from "vitest";
import { classifyScalableSummary } from "./classify.js";

describe("classifyScalableSummary", () => {
  it("classifies security buys and cash deposits", () => {
    expect(
      classifyScalableSummary({
        id: "tx-1",
        summary_type: "BrokerSecurityTransactionSummary",
        description: "Buy ETF",
        amount: "100",
        currency: "EUR",
        last_event_datetime: "2026-01-01T00:00:00Z",
      })?.canonicalType,
    ).toBe("buy");
    expect(
      classifyScalableSummary({
        id: "tx-2",
        summary_type: "BrokerCashTransactionSummary",
        description: "Deposit",
        amount: "50",
        currency: "EUR",
        last_event_datetime: "2026-01-02T00:00:00Z",
      })?.canonicalType,
    ).toBe("deposit");
  });

  it("classifies savings plans and unknown cash rows", () => {
    expect(
      classifyScalableSummary({
        id: "tx-sp",
        summary_type: "BrokerSecurityTransactionSummary",
        description: "Sparplan ETF",
        amount: "25",
        currency: "EUR",
        last_event_datetime: "2026-02-01T00:00:00Z",
      })?.canonicalType,
    ).toBe("savings-plan");
    expect(
      classifyScalableSummary({
        id: "tx-unk",
        summary_type: "BrokerCashTransactionSummary",
        description: "Misc adjustment",
        amount: "3",
        currency: "EUR",
        last_event_datetime: "2026-02-02T00:00:00Z",
      })?.canonicalType,
    ).toBe("unknown");
  });

  it("classifies sells, fees, and skips cancellations", () => {
    expect(
      classifyScalableSummary({
        id: "tx-sell",
        summary_type: "BrokerSecurityTransactionSummary",
        description: "Sell ETF",
        amount: "90",
        currency: "EUR",
        last_event_datetime: "2026-01-03T00:00:00Z",
      })?.canonicalType,
    ).toBe("sell");
    expect(
      classifyScalableSummary({
        id: "tx-fee",
        summary_type: "BrokerCashTransactionSummary",
        description: "Custody fee",
        amount: "-1",
        currency: "EUR",
        last_event_datetime: "2026-01-04T00:00:00Z",
      })?.canonicalType,
    ).toBe("fee");
    expect(
      classifyScalableSummary({
        id: "tx-x",
        summary_type: "BrokerCashTransactionSummary",
        description: "Deposit",
        amount: "1",
        currency: "EUR",
        is_cancellation: true,
        last_event_datetime: "2026-01-05T00:00:00Z",
      }),
    ).toBeNull();
  });
});
