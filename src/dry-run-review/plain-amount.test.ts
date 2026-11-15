import { describe, expect, it } from "vitest";
import { formatPlainCanonicalAmount } from "./plain-amount.js";

describe("formatPlainCanonicalAmount", () => {
  it("labels outflows and inflows in plain language", () => {
    expect(formatPlainCanonicalAmount(-500, "eur")).toBe("€500.00 out");
    expect(formatPlainCanonicalAmount(200, "eur")).toBe("€200.00 in");
    expect(formatPlainCanonicalAmount(0, "eur")).toBe("€0.00");
  });

  it("falls back to currency code when no symbol is known", () => {
    expect(formatPlainCanonicalAmount(10, "chf")).toBe("10.00 CHF in");
  });
});