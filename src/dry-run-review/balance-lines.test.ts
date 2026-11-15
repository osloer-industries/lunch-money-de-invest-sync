import { describe, expect, it } from "vitest";
import { brokerBalanceLines } from "./balance-lines.js";

describe("brokerBalanceLines", () => {
  it("formats successful readings in plain language", () => {
    const lines = brokerBalanceLines({
      holdings: { ok: true, value: 1200.5, currency: "eur" },
      cash: { ok: true, value: 42, currency: "eur" },
      notes: [],
    });
    expect(lines).toContain("Holdings (market value): 1,200.50 EUR");
    expect(lines).toContain("Broker cash: 42.00 EUR");
  });

  it("includes broker notes and failed readings", () => {
    const lines = brokerBalanceLines({
      savings: { ok: false, error: "not logged in" },
      notes: ["pricing skipped"],
    });
    expect(lines.some((line) => line.includes("could not read"))).toBe(true);
    expect(lines).toContain("Note: pricing skipped");
  });
});