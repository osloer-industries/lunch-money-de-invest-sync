import { describe, expect, it } from "vitest";
import { formatMoney, parseBrokerDecimal } from "./decimal.js";

describe("parseBrokerDecimal", () => {
  it.each([
    [1234.5, 1234.5],
    ["1234.56", 1234.56],
    ["-12.5", -12.5],
    ["+3", 3],
    ["1,234.56", 1234.56],
    ["1.234,56", 1234.56],
    ["12,5", 12.5],
    ["1.234.567", 1_234_567],
    ["1,234,567", 1_234_567],
    ["1 234,56", 1234.56],
    ["1 234.5", 1234.5],
    ["0", 0],
  ])("parses %j", (input, expected) => {
    expect(parseBrokerDecimal(input)).toBe(expected);
  });

  it.each([[Number.NaN], [Number.POSITIVE_INFINITY], [""], ["abc"], ["12 EUR"], [null], [undefined], [{}]])(
    "returns null for %j",
    (input) => {
      expect(parseBrokerDecimal(input)).toBeNull();
    },
  );
});

describe("formatMoney", () => {
  it("formats with grouping, two decimals and an upper-case currency", () => {
    expect(formatMoney(1234.5, "eur")).toBe("1,234.50 EUR");
    expect(formatMoney(-2, "EUR")).toBe("-2.00 EUR");
  });
});
