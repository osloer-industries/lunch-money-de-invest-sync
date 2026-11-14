import { describe, expect, it, vi } from "vitest";
import { getManualAccountBalance, setManualAccountBalance } from "./manual-account-balance.js";

function fakeClient(balance = "12.3400", currency = "EUR") {
  return {
    manualAccounts: {
      get: vi.fn().mockResolvedValue({ balance, currency }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

describe("getManualAccountBalance", () => {
  it("parses the string balance and lower-cases the currency", async () => {
    const client = fakeClient();
    await expect(getManualAccountBalance(client, 7)).resolves.toEqual({ balance: 12.34, currency: "eur" });
    expect(client.manualAccounts.get).toHaveBeenCalledWith(7);
  });

  it("rejects a non-numeric balance", async () => {
    await expect(getManualAccountBalance(fakeClient("abc"), 7)).rejects.toThrow(/non-numeric balance/);
  });
});

describe("setManualAccountBalance", () => {
  it("sends a 2-decimal balance and balance_as_of when known", async () => {
    const client = fakeClient();
    await setManualAccountBalance(client, 7, 1000.5, "2026-07-01T16:00:00Z");
    await setManualAccountBalance(client, 8, 5);
    expect(client.manualAccounts.update.mock.calls).toEqual([
      [7, { balance: "1000.50", balance_as_of: "2026-07-01T16:00:00Z" }],
      [8, { balance: "5.00" }],
    ]);
  });
});
