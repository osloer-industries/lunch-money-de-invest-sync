import { describe, expect, it, vi } from "vitest";
import { syncBrokerBalances, type BalanceSyncParams } from "./sync-balances.js";
import type { BrokerBalanceSnapshot } from "./shared/broker-balances.js";

const CASH_ACCOUNT = 1;
const HOLDINGS_ACCOUNT = 2;
const SAVINGS_ACCOUNT = 3;

function fakeClient(balances: Record<number, string> = {}, currency = "eur") {
  return {
    manualAccounts: {
      get: vi.fn((id: number) => Promise.resolve({ balance: balances[id] ?? "0", currency })),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

function params(overrides: Partial<BalanceSyncParams> & { snapshot: BrokerBalanceSnapshot }) {
  const lines: string[] = [];
  const client = (overrides.client ?? fakeClient()) as ReturnType<typeof fakeClient>;
  const full: BalanceSyncParams = {
    label: "[scalable-capital:me]",
    cashAccountId: CASH_ACCOUNT,
    pendingCashDelta: 0,
    logger: (line) => lines.push(line),
    dryRun: false,
    reconcileCash: false,
    ...overrides,
    client,
  };
  return { full, lines, client };
}

const okReading = (value: number, asOf?: string) => ({
  ok: true as const,
  value,
  currency: "eur",
  ...(asOf ? { asOf } : {}),
});

describe("syncBrokerBalances — holdings and savings", () => {
  it("sets the holdings and savings balances on a real sync", async () => {
    const { full, lines, client } = params({
      holdingsAccountId: HOLDINGS_ACCOUNT,
      savingsAccountId: SAVINGS_ACCOUNT,
      snapshot: {
        holdings: okReading(1234.56, "2026-07-01T16:00:00Z"),
        savings: okReading(5000),
        notes: [],
      },
    });
    await expect(syncBrokerBalances(full)).resolves.toBe(0);
    expect(client.manualAccounts.update.mock.calls).toEqual([
      [HOLDINGS_ACCOUNT, { balance: "1234.56", balance_as_of: "2026-07-01T16:00:00Z" }],
      [SAVINGS_ACCOUNT, { balance: "5000.00" }],
    ]);
    expect(lines).toEqual([
      "[scalable-capital:me] holdings value set to 1,234.56 EUR (as of 2026-07-01T16:00:00Z)",
      "[scalable-capital:me] overnight savings balance set to 5,000.00 EUR",
    ]);
  });

  it("dry-run reports the target and the current Lunch Money balance without writing", async () => {
    const { full, lines, client } = params({
      dryRun: true,
      holdingsAccountId: HOLDINGS_ACCOUNT,
      client: fakeClient({ [HOLDINGS_ACCOUNT]: "1000.0000" }),
      snapshot: { holdings: okReading(1100), notes: [] },
    });
    await expect(syncBrokerBalances(full)).resolves.toBe(0);
    expect(client.manualAccounts.update).not.toHaveBeenCalled();
    expect(lines).toEqual([
      "[scalable-capital:me] dry-run: would set holdings value to 1,100.00 EUR; Lunch Money currently 1,000.00 EUR",
    ]);
  });

  it("skips accounts that are not configured", async () => {
    const { full, client } = params({ snapshot: { holdings: okReading(1), notes: [] } });
    await expect(syncBrokerBalances(full)).resolves.toBe(0);
    expect(client.manualAccounts.get).not.toHaveBeenCalled();
  });

  it("warns and counts a failure when the broker read failed, then continues", async () => {
    const { full, lines, client } = params({
      holdingsAccountId: HOLDINGS_ACCOUNT,
      savingsAccountId: SAVINGS_ACCOUNT,
      snapshot: { holdings: { ok: false, error: "sc timed out" }, savings: okReading(10), notes: [] },
    });
    await expect(syncBrokerBalances(full)).resolves.toBe(1);
    expect(lines[0]).toBe("[scalable-capital:me] warning: could not read holdings value from the broker — sc timed out");
    expect(client.manualAccounts.update).toHaveBeenCalledWith(SAVINGS_ACCOUNT, { balance: "10.00" });
  });

  it("warns and counts a failure when the Lunch Money update fails", async () => {
    const client = fakeClient();
    client.manualAccounts.update.mockRejectedValueOnce(new Error("404 Not Found"));
    const { full, lines } = params({
      client,
      holdingsAccountId: HOLDINGS_ACCOUNT,
      snapshot: { holdings: okReading(1), notes: [] },
    });
    await expect(syncBrokerBalances(full)).resolves.toBe(1);
    expect(lines[0]).toBe(
      "[scalable-capital:me] warning: could not update holdings value in Lunch Money account 2 — 404 Not Found",
    );
  });

  it("prints broker notes", async () => {
    const { full, lines } = params({ snapshot: { notes: ["pytr could not price 1 position(s)"] } });
    await syncBrokerBalances(full);
    expect(lines).toEqual(["[scalable-capital:me] note: pytr could not price 1 position(s)"]);
  });
});

describe("syncBrokerBalances — cash reconciliation", () => {
  it("reports a match within 1.00", async () => {
    const { full, lines, client } = params({
      client: fakeClient({ [CASH_ACCOUNT]: "100.50" }),
      snapshot: { cash: okReading(100), notes: [] },
    });
    await expect(syncBrokerBalances(full)).resolves.toBe(0);
    expect(lines).toEqual(["[scalable-capital:me] cash reconciled: Lunch Money 100.50 EUR, broker 100.00 EUR"]);
    expect(client.manualAccounts.update).not.toHaveBeenCalled();
  });

  it("treats exactly 1.00 as a match and 1.01 as a mismatch", async () => {
    const within = params({ client: fakeClient({ [CASH_ACCOUNT]: "101.00" }), snapshot: { cash: okReading(100), notes: [] } });
    await syncBrokerBalances(within.full);
    expect(within.lines[0]).toContain("cash reconciled");
    const beyond = params({ client: fakeClient({ [CASH_ACCOUNT]: "101.01" }), snapshot: { cash: okReading(100), notes: [] } });
    await syncBrokerBalances(beyond.full);
    expect(beyond.lines[0]).toContain("warning: cash mismatch");
  });

  it("warns on a mismatch without writing by default", async () => {
    const { full, lines, client } = params({
      client: fakeClient({ [CASH_ACCOUNT]: "5000" }),
      snapshot: { cash: okReading(5), notes: [] },
    });
    await expect(syncBrokerBalances(full)).resolves.toBe(0);
    expect(client.manualAccounts.update).not.toHaveBeenCalled();
    expect(lines[0]).toBe(
      "[scalable-capital:me] warning: cash mismatch — Lunch Money 5,000.00 EUR, broker 5.00 EUR (difference 4,995.00 EUR). " +
        "Check for missing or extra transactions and the account's starting balance, or re-run with --reconcile-cash to set the Lunch Money cash balance to the broker value.",
    );
  });

  it("sets the cash balance to the broker value with --reconcile-cash", async () => {
    const { full, lines, client } = params({
      reconcileCash: true,
      client: fakeClient({ [CASH_ACCOUNT]: "5000" }),
      snapshot: { cash: okReading(5), notes: [] },
    });
    await expect(syncBrokerBalances(full)).resolves.toBe(0);
    expect(client.manualAccounts.update).toHaveBeenCalledWith(CASH_ACCOUNT, { balance: "5.00" });
    expect(lines[0]).toBe(
      "[scalable-capital:me] cash balance set to broker value 5.00 EUR (--reconcile-cash; was 5,000.00 EUR)",
    );
  });

  it("only reports with --reconcile-cash in dry-run and includes pending inserts", async () => {
    const { full, lines, client } = params({
      dryRun: true,
      reconcileCash: true,
      pendingCashDelta: -50,
      client: fakeClient({ [CASH_ACCOUNT]: "100" }),
      snapshot: { cash: okReading(5), notes: [] },
    });
    await syncBrokerBalances(full);
    expect(client.manualAccounts.update).not.toHaveBeenCalled();
    expect(lines[0]).toBe(
      "[scalable-capital:me] dry-run: would set cash balance to 5.00 EUR (--reconcile-cash; Lunch Money (after pending inserts) 50.00 EUR)",
    );
  });

  it("counts pending dry-run inserts toward the expected balance", async () => {
    const { full, lines } = params({
      dryRun: true,
      pendingCashDelta: -95,
      client: fakeClient({ [CASH_ACCOUNT]: "100" }),
      snapshot: { cash: okReading(5), notes: [] },
    });
    await syncBrokerBalances(full);
    expect(lines[0]).toBe(
      "[scalable-capital:me] cash reconciled: Lunch Money (after pending inserts) 5.00 EUR, broker 5.00 EUR",
    );
  });

  it("skips the comparison when currencies differ", async () => {
    const { full, lines } = params({ client: fakeClient({}, "USD"), snapshot: { cash: okReading(5), notes: [] } });
    await expect(syncBrokerBalances(full)).resolves.toBe(0);
    expect(lines[0]).toContain("cash reconciliation skipped — Lunch Money account currency USD differs from broker EUR");
  });

  it("counts a failed broker cash read and a failed Lunch Money read as failures", async () => {
    const unreadable = params({ snapshot: { cash: { ok: false, error: "no Cash line" }, notes: [] } });
    await expect(syncBrokerBalances(unreadable.full)).resolves.toBe(1);
    expect(unreadable.lines[0]).toContain("could not read broker cash for reconciliation — no Cash line");

    const client = fakeClient();
    client.manualAccounts.get.mockRejectedValueOnce("offline");
    const lmDown = params({ client, snapshot: { cash: okReading(5), notes: [] } });
    await expect(syncBrokerBalances(lmDown.full)).resolves.toBe(1);
    expect(lmDown.lines[0]).toContain("cash reconciliation failed — offline");
  });
});
