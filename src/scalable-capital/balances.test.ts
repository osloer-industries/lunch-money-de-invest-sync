import { describe, expect, it, vi } from "vitest";
import {
  fetchScalableBrokerValuation,
  fetchScalableCashBalance,
  fetchScalableOvernightBalance,
  parseScBrokerValuation,
  parseScCashBalance,
  parseScOvernightBalance,
} from "./balances.js";
import type { ScCliRunner } from "../shared/subprocess-cli.js";

function ok(command: string, data: unknown): string {
  return JSON.stringify({ ok: true, command, data });
}

function failure(code: string, hints?: string[]): string {
  return JSON.stringify({ ok: false, command: "x", error: { code }, ...(hints ? { hints } : {}) });
}

function runnerReturning(...stdouts: string[]): ScCliRunner & { run: ReturnType<typeof vi.fn> } {
  const run = vi.fn();
  for (const stdout of stdouts) {
    run.mockResolvedValueOnce({ stdout, stderr: "", exitCode: 0 });
  }
  return { run };
}

const overview = {
  result: {
    valuation: { securities: "1000.00", crypto: 25.5, total: "1100.00" },
    timestamps: { valuation_timestamp_utc: "2026-07-01T16:00:00Z" },
    account_holder: "should be dropped",
  },
};

describe("parseScBrokerValuation", () => {
  it("adds crypto to securities and keeps the valuation timestamp", () => {
    expect(parseScBrokerValuation({ ok: true, data: overview })).toEqual({
      holdingsValue: 1025.5,
      asOf: "2026-07-01T16:00:00Z",
    });
  });

  it("treats missing crypto and timestamps as absent", () => {
    expect(
      parseScBrokerValuation({ ok: true, data: { result: { valuation: { securities: 500, crypto: null } } } }),
    ).toEqual({ holdingsValue: 500 });
  });

  it("ignores an unparseable valuation timestamp", () => {
    const data = { result: { valuation: { securities: 1 }, timestamps: { valuation_timestamp_utc: "soon" } } };
    expect(parseScBrokerValuation({ ok: true, data })).toEqual({ holdingsValue: 1 });
  });

  it("rejects an unexpected data shape", () => {
    expect(() => parseScBrokerValuation({ ok: true, data: { result: {} } })).toThrow(
      /broker overview data didn't match/,
    );
  });

  it("rejects a non-numeric securities value", () => {
    expect(() =>
      parseScBrokerValuation({ ok: true, data: { result: { valuation: { securities: "n/a" } } } }),
    ).toThrow(/valuation.securities is not numeric/);
  });
});

describe("parseScCashBalance / parseScOvernightBalance", () => {
  it("reads cash_balance and overnight balance", () => {
    expect(parseScCashBalance({ ok: true, data: { result: { cash_balance: "12.34", buying_power: "9" } } })).toBe(
      12.34,
    );
    expect(parseScOvernightBalance({ ok: true, data: { result: { balance: 5000 } } })).toBe(5000);
  });

  it("rejects missing fields", () => {
    expect(() => parseScCashBalance({ ok: true, data: { result: {} } })).toThrow(/cash-breakdown/);
    expect(() => parseScOvernightBalance({ ok: true, data: {} })).toThrow(/overnight data/);
  });
});

describe("fetch helpers", () => {
  it("passes --portfolio-id and SC_CONFIG_DIR to broker commands", async () => {
    const runner = runnerReturning(ok("broker.overview", overview), ok("broker.cash-breakdown", { result: { cash_balance: 3 } }));
    const config = { portfolioId: "p-1", scConfigDir: "/tmp/sc-config" };
    await expect(fetchScalableBrokerValuation(runner, config)).resolves.toMatchObject({ holdingsValue: 1025.5 });
    await expect(fetchScalableCashBalance(runner, config)).resolves.toBe(3);
    expect(runner.run.mock.calls).toEqual([
      [["broker", "overview", "--json", "--portfolio-id", "p-1"], { SC_CONFIG_DIR: "/tmp/sc-config" }],
      [["broker", "cash-breakdown", "--json", "--portfolio-id", "p-1"], { SC_CONFIG_DIR: "/tmp/sc-config" }],
    ]);
  });

  it("runs `sc overnight --json` without a portfolio id", async () => {
    const runner = runnerReturning(ok("overnight", { result: { balance: "250.00" }, savings_account_id: "s-1" }));
    await expect(fetchScalableOvernightBalance(runner, { portfolioId: "p-1" })).resolves.toBe(250);
    expect(runner.run).toHaveBeenCalledWith(["overnight", "--json"], undefined);
  });

  it("retries once on refresh_retryable", async () => {
    const runner = runnerReturning(failure("refresh_retryable"), ok("overnight", { result: { balance: 1 } }));
    await expect(fetchScalableOvernightBalance(runner, {})).resolves.toBe(1);
    expect(runner.run).toHaveBeenCalledTimes(2);
  });

  it("surfaces error envelopes with an actionable message", async () => {
    await expect(fetchScalableCashBalance(runnerReturning(failure("no_session")), {})).rejects.toThrow(/sc login/);
    await expect(
      fetchScalableBrokerValuation(runnerReturning(failure("forbidden", ["enable Agentic Investing"])), {}),
    ).rejects.toThrow("Scalable CLI command failed (forbidden): enable Agentic Investing");
    await expect(fetchScalableOvernightBalance(runnerReturning(failure("boom")), {})).rejects.toThrow(
      "Scalable CLI command failed (boom)",
    );
  });

  it("explains a missing sc binary", async () => {
    const runner = { run: vi.fn().mockRejectedValue(Object.assign(new Error("spawn"), { code: "ENOENT" })) };
    await expect(fetchScalableCashBalance(runner, {})).rejects.toThrow(/was not found/);
  });

  it("rethrows other spawn errors unchanged", async () => {
    const runner = { run: vi.fn().mockRejectedValue(new Error("timed out")) };
    await expect(fetchScalableCashBalance(runner, {})).rejects.toThrow("timed out");
  });
});
