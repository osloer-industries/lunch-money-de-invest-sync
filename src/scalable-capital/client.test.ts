import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { fetchAllScalableCapitalTransactions, fetchAllScalableTransactionSummaries } from "./client.js";
import type { ScCliRunner } from "../shared/subprocess-cli.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadFixture(name: string): string {
  return readFileSync(path.join(fixturesDir, name), "utf-8");
}

function runnerFromResponses(responses: string[]): ScCliRunner {
  const queue = [...responses];
  return {
    run: vi.fn(() => {
      const stdout = queue.shift();
      if (stdout === undefined) {
        throw new Error("unexpected extra sc invocation");
      }
      return Promise.resolve({ stdout, stderr: "", exitCode: 0 });
    }),
  };
}

function security(id: string, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    id,
    summary_type: "BrokerSecurityTransactionSummary",
    last_event_datetime: "2026-03-08T12:00:00Z",
    description: "Example ETF",
    amount: "-50",
    currency: "EUR",
    ...extra,
  };
}

describe("fetchAllScalableCapitalTransactions", () => {
  it("returns normalized cash transactions from a single page", async () => {
    const runner = runnerFromResponses([loadFixture("broker-transactions-page-2.json")]);
    const result = await fetchAllScalableCapitalTransactions(runner, {});
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "tx-cash-2",
      type: "BrokerCashTransaction",
      amount: -2.5,
    });
  });

  it("follows cursor pagination and includes executed security trades", async () => {
    const runner = runnerFromResponses([
      loadFixture("broker-transactions-page-1.json"),
      loadFixture("broker-transactions-page-2.json"),
    ]);
    const result = await fetchAllScalableCapitalTransactions(runner, {});
    expect(result.map((tx) => [tx.id, tx.type])).toEqual([
      ["tx-cash-1", "BrokerCashTransaction"],
      ["tx-security-1", "BrokerSecurityTransaction"],
      ["tx-cash-2", "BrokerCashTransaction"],
    ]);
    expect(runner.run).toHaveBeenCalledTimes(2);
    const secondArgs = (runner.run as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as string[];
    expect(secondArgs).toContain("--cursor");
    expect(secondArgs).toContain("page-2");
  });

  it("fetchAllScalableTransactionSummaries returns raw items including security rows", async () => {
    const runner = runnerFromResponses([
      loadFixture("broker-transactions-page-1.json"),
      loadFixture("broker-transactions-page-2.json"),
    ]);
    const summaries = await fetchAllScalableTransactionSummaries(runner, {});
    expect(summaries.map((row) => row.id)).toEqual(["tx-cash-1", "tx-security-1", "tx-cash-2"]);
    expect(runner.run).toHaveBeenCalledTimes(2);
  });

  it("passes portfolio id and SC_CONFIG_DIR when configured", async () => {
    const runner = runnerFromResponses([loadFixture("broker-transactions-page-2.json")]);
    await fetchAllScalableCapitalTransactions(runner, {
      portfolioId: "portfolio-operator-b",
      scConfigDir: "/tmp/sc-operator-b",
    });
    const args = (runner.run as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string[];
    const env = (runner.run as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as Record<string, string>;
    expect(args).toContain("--portfolio-id");
    expect(args).toContain("portfolio-operator-b");
    expect(env.SC_CONFIG_DIR).toBe("/tmp/sc-operator-b");
  });

  it("throws a clear error when the CLI reports no session", async () => {
    const runner = runnerFromResponses([loadFixture("broker-transactions-no-session.json")]);
    await expect(fetchAllScalableCapitalTransactions(runner, {})).rejects.toThrow(/sc login/i);
  });

  it("throws when sc is missing on PATH", async () => {
    const runner: ScCliRunner = {
      run: vi.fn(() =>
        Promise.reject(Object.assign(new Error("spawn sc ENOENT"), { code: "ENOENT" })),
      ),
    };
    await expect(fetchAllScalableCapitalTransactions(runner, {})).rejects.toThrow(/was not found/);
  });

  it("retries once when the CLI reports refresh_retryable", async () => {
    const runner = runnerFromResponses([
      loadFixture("broker-transactions-refresh-retry.json"),
      loadFixture("broker-transactions-page-2.json"),
    ]);
    const result = await fetchAllScalableCapitalTransactions(runner, {});
    expect(result).toHaveLength(1);
    expect(runner.run).toHaveBeenCalledTimes(2);
  });

  it("throws for generic CLI failures with hints", async () => {
    const runner = runnerFromResponses([
      JSON.stringify({
        ok: false,
        command: "broker.transactions",
        error: { code: "rate_limited" },
        hints: ["Wait before retrying."],
      }),
    ]);
    await expect(fetchAllScalableCapitalTransactions(runner, {})).rejects.toThrow(/rate_limited/);
  });

  it("skips cancellation cash summaries", async () => {
    const body = JSON.parse(loadFixture("broker-transactions-page-2.json")) as {
      data: { result: { items: unknown[] } };
    };
    body.data.result.items = [
      {
        id: "tx-cancel",
        summary_type: "BrokerCashTransactionSummary",
        is_cancellation: true,
        last_event_datetime: "2026-03-08T12:00:00Z",
        amount: "1",
        currency: "EUR",
      },
    ];
    const runner = runnerFromResponses([JSON.stringify(body)]);
    const result = await fetchAllScalableCapitalTransactions(runner, {});
    expect(result).toEqual([]);
  });

  it("keeps security type and side, and skips trades that moved no cash", async () => {
    const body = JSON.parse(loadFixture("broker-transactions-page-2.json")) as {
      data: { result: { items: unknown[] } };
    };
    body.data.result.items = [
      security("sp-1", { status: "SETTLED", security_transaction_type: " SAVINGS_PLAN ", side: "BUY" }),
      security("sell-1", { status: "filled", side: "SELL" }),
      security("confirmed-1", { status: "CONFIRMED" }),
      security("no-status-1", {}),
      security("pending-1", { status: "PENDING" }),
      security("partial-1", { status: "partial filled" }),
      security("cancelled-1", { status: "CANCELLED" }),
      security("rejected-1", { status: "REJECTED" }),
      security("expired-1", { status: "EXPIRED" }),
      security("storno-1", { status: "FILLED", is_cancellation: true }),
      security("delivery-1", { status: "SETTLED", security_transaction_type: "TRANSFER_IN" }),
      security("swap-1", { status: "SETTLED", security_transaction_type: "SWAP_OUT" }),
      { id: "other-1", summary_type: "BrokerCryptoTransactionSummary", amount: "1" },
    ];
    const result = await fetchAllScalableCapitalTransactions(runnerFromResponses([JSON.stringify(body)]), {});
    expect(result.map((tx) => tx.id)).toEqual(["sp-1", "sell-1", "confirmed-1", "no-status-1"]);
    expect(result[0]).toMatchObject({ securityTransactionType: "SAVINGS_PLAN", side: "BUY", amount: -50 });
    expect(result[2]).not.toHaveProperty("side");
  });

  it("throws when an executed security trade is missing last_event_datetime", async () => {
    const body = JSON.parse(loadFixture("broker-transactions-page-2.json")) as {
      data: { result: { items: unknown[] } };
    };
    body.data.result.items = [
      { id: "tx-sec", summary_type: "BrokerSecurityTransactionSummary", status: "FILLED", amount: "-1" },
    ];
    await expect(
      fetchAllScalableCapitalTransactions(runnerFromResponses([JSON.stringify(body)]), {}),
    ).rejects.toThrow("Scalable CLI security transaction tx-sec is missing last_event_datetime");
  });

  it("keeps the structured cash_transaction_type for classification", async () => {
    const body = JSON.parse(loadFixture("broker-transactions-page-2.json")) as {
      data: { result: { items: unknown[] } };
    };
    body.data.result.items = [
      {
        id: "tx-internal",
        summary_type: "BrokerCashTransactionSummary",
        cash_transaction_type: " CASH_TRANSFER_IN ",
        last_event_datetime: "2026-03-08T12:00:00Z",
        description: "Interne Überweisung",
        amount: "100",
        currency: "EUR",
      },
      {
        id: "tx-plain",
        summary_type: "BrokerCashTransactionSummary",
        cash_transaction_type: null,
        last_event_datetime: "2026-03-08T12:00:00Z",
        amount: "1",
        currency: "EUR",
      },
    ];
    const runner = runnerFromResponses([JSON.stringify(body)]);
    const result = await fetchAllScalableCapitalTransactions(runner, {});
    expect(result[0]?.cashTransactionType).toBe("CASH_TRANSFER_IN");
    expect(result[1]).not.toHaveProperty("cashTransactionType");
  });

  it("throws when a cash item is missing last_event_datetime", async () => {
    const body = JSON.parse(loadFixture("broker-transactions-page-2.json")) as {
      data: { result: { items: unknown[] } };
    };
    body.data.result.items = [
      {
        id: "tx-missing-date",
        summary_type: "BrokerCashTransactionSummary",
        is_cancellation: false,
        amount: "1",
        currency: "EUR",
      },
    ];
    const runner = runnerFromResponses([JSON.stringify(body)]);
    await expect(fetchAllScalableCapitalTransactions(runner, {})).rejects.toThrow(/last_event_datetime/);
  });

  it("throws when broker result data does not match the schema", async () => {
    const runner = runnerFromResponses([
      JSON.stringify({ ok: true, command: "broker.transactions", data: { unexpected: true } }),
    ]);
    await expect(fetchAllScalableCapitalTransactions(runner, {})).rejects.toThrow(
      /didn't match the expected shape/,
    );
  });

  it("throws when stdout is not JSON", async () => {
    const runner = runnerFromResponses(["not-json"]);
    await expect(fetchAllScalableCapitalTransactions(runner, {})).rejects.toThrow(/not valid JSON/);
  });

  it("stops and throws if the cursor never terminates", async () => {
    const looping = JSON.parse(loadFixture("broker-transactions-page-1.json")) as {
      data: { result: { cursor: string } };
    };
    looping.data.result.cursor = "same-cursor-forever";
    const runner = runnerFromResponses(Array.from({ length: 60 }, () => JSON.stringify(looping)));
    await expect(fetchAllScalableCapitalTransactions(runner, {})).rejects.toThrow(/Stopped after/);
  });
});
