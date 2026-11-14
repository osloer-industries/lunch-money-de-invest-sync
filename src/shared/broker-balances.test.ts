import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchTradeRepublicPortfolio = vi.hoisted(() => vi.fn());
const fetchScalableBrokerValuation = vi.hoisted(() => vi.fn());
const fetchScalableCashBalance = vi.hoisted(() => vi.fn());
const fetchScalableOvernightBalance = vi.hoisted(() => vi.fn());
const createDefaultScCliRunner = vi.hoisted(() => vi.fn(() => ({ run: vi.fn() })));
const createDefaultPytrCliRunner = vi.hoisted(() => vi.fn(() => ({ run: vi.fn() })));

vi.mock("../trade-republic/portfolio.js", () => ({ fetchTradeRepublicPortfolio }));
vi.mock("../trade-republic/client.js", () => ({ createDefaultPytrCliRunner }));
vi.mock("../scalable-capital/client.js", () => ({ createDefaultScCliRunner }));
vi.mock("../scalable-capital/balances.js", () => ({
  fetchScalableBrokerValuation,
  fetchScalableCashBalance,
  fetchScalableOvernightBalance,
}));

import { readScalableCapitalBalances, readTradeRepublicBalances } from "./broker-balances.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readTradeRepublicBalances", () => {
  it("returns holdings and cash from one pytr portfolio run", async () => {
    fetchTradeRepublicPortfolio.mockResolvedValue({
      positionCount: 2,
      securitiesValue: 1000,
      cash: { currency: "eur", amount: 50 },
      missingPriceCount: 0,
    });
    await expect(
      readTradeRepublicBalances({ owner: "me", lunchMoneyAssetId: 1, pytrHome: "/data/me/.pytr" }),
    ).resolves.toEqual({
      holdings: { ok: true, value: 1000, currency: "eur" },
      cash: { ok: true, value: 50, currency: "eur" },
      notes: [],
    });
    expect(fetchTradeRepublicPortfolio).toHaveBeenCalledWith(expect.anything(), { pytrHome: "/data/me/.pytr" });
  });

  it("notes unpriced positions and a missing cash line", async () => {
    fetchTradeRepublicPortfolio.mockResolvedValue({
      positionCount: 0,
      securitiesValue: 0,
      cash: null,
      missingPriceCount: 1,
    });
    const snapshot = await readTradeRepublicBalances({ owner: "me", lunchMoneyAssetId: 1 });
    expect(snapshot.cash).toEqual({ ok: false, error: "pytr portfolio did not print a `Cash` line" });
    expect(snapshot.notes).toEqual(["pytr could not price 1 position(s); holdings value excludes them"]);
  });

  it("turns a pytr failure into failed readings instead of throwing", async () => {
    fetchTradeRepublicPortfolio.mockRejectedValue(new Error("pytr session expired"));
    const snapshot = await readTradeRepublicBalances({ owner: "me", lunchMoneyAssetId: 1 });
    expect(snapshot.holdings).toEqual({ ok: false, error: "pytr session expired" });
    expect(snapshot.cash).toEqual({ ok: false, error: "pytr session expired" });
  });
});

describe("readScalableCapitalBalances", () => {
  it("reads only cash when no balance accounts are configured", async () => {
    fetchScalableCashBalance.mockResolvedValue(5);
    await expect(readScalableCapitalBalances({ owner: "me", lunchMoneyAssetId: 1 })).resolves.toEqual({
      cash: { ok: true, value: 5, currency: "eur" },
      notes: [],
    });
    expect(fetchScalableBrokerValuation).not.toHaveBeenCalled();
    expect(fetchScalableOvernightBalance).not.toHaveBeenCalled();
  });

  it("reads holdings, cash and overnight savings for a fully tracked profile", async () => {
    fetchScalableBrokerValuation.mockResolvedValue({ holdingsValue: 900, asOf: "2026-07-01T16:00:00Z" });
    fetchScalableCashBalance.mockResolvedValue(5);
    fetchScalableOvernightBalance.mockRejectedValue("overnight unavailable");
    const snapshot = await readScalableCapitalBalances({
      owner: "me",
      lunchMoneyAssetId: 1,
      holdingsAccountId: 2,
      savingsAccountId: 3,
      portfolioId: "p-1",
    });
    expect(snapshot).toEqual({
      holdings: { ok: true, value: 900, currency: "eur", asOf: "2026-07-01T16:00:00Z" },
      cash: { ok: true, value: 5, currency: "eur" },
      savings: { ok: false, error: "overnight unavailable" },
      notes: [],
    });
    expect(fetchScalableBrokerValuation).toHaveBeenCalledWith(expect.anything(), { portfolioId: "p-1" });
  });

  it("omits asOf when the overview has no timestamp", async () => {
    fetchScalableBrokerValuation.mockResolvedValue({ holdingsValue: 1 });
    fetchScalableCashBalance.mockResolvedValue(0);
    const snapshot = await readScalableCapitalBalances({ owner: "me", lunchMoneyAssetId: 1, holdingsAccountId: 2 });
    expect(snapshot.holdings).toEqual({ ok: true, value: 1, currency: "eur" });
  });
});
