import { describe, expect, it, vi } from "vitest";
import { fetchAllScalableCapitalTransactions } from "./client.js";
import type { HttpFetch } from "./client.js";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

describe("fetchAllScalableCapitalTransactions", () => {
  it("returns transactions from a single page with no cursor", async () => {
    const fetchFn: HttpFetch = vi.fn().mockResolvedValue(
      jsonResponse({
        transactions: [
          { id: "1", date: "2026-07-01", type: "BrokerCashTransaction", amount: -10, currency: "EUR" },
        ],
        cursor: null,
      }),
    );

    const result = await fetchAllScalableCapitalTransactions(fetchFn, { proxyUrl: "http://localhost:3141" });
    expect(result).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("follows the cursor across multiple pages", async () => {
    const fetchFn: HttpFetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          transactions: [{ id: "1", date: "2026-07-01", type: "BrokerCashTransaction", amount: -1, currency: "EUR" }],
          cursor: "page-2",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          transactions: [{ id: "2", date: "2026-07-02", type: "BrokerCashTransaction", amount: -2, currency: "EUR" }],
          cursor: null,
        }),
      );

    const result = await fetchAllScalableCapitalTransactions(fetchFn, { proxyUrl: "http://localhost:3141" });
    expect(result.map((tx) => tx.id)).toEqual(["1", "2"]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const secondCallUrl = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as string;
    expect(secondCallUrl).toContain("cursor=page-2");
  });

  it("sends the gateway token header when configured", async () => {
    const fetchFn: HttpFetch = vi.fn().mockResolvedValue(jsonResponse({ transactions: [], cursor: null }));
    await fetchAllScalableCapitalTransactions(fetchFn, {
      proxyUrl: "http://localhost:3141",
      proxyToken: "secret-token",
    });
    const init = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(init.headers["X-Gateway-Token"]).toBe("secret-token");
  });

  it("throws a clear error on a non-ok response", async () => {
    const fetchFn: HttpFetch = vi.fn().mockResolvedValue(jsonResponse({}, false, 401));
    await expect(
      fetchAllScalableCapitalTransactions(fetchFn, { proxyUrl: "http://localhost:3141" }),
    ).rejects.toThrow(/status 401/);
  });

  it("throws a clear error when the response body doesn't match the expected shape", async () => {
    const fetchFn: HttpFetch = vi.fn().mockResolvedValue(jsonResponse({ nope: true }));
    await expect(
      fetchAllScalableCapitalTransactions(fetchFn, { proxyUrl: "http://localhost:3141" }),
    ).rejects.toThrow(/didn't match the expected shape/);
  });

  it("stops and throws if the cursor never terminates", async () => {
    const fetchFn: HttpFetch = vi.fn().mockResolvedValue(
      jsonResponse({ transactions: [], cursor: "same-cursor-forever" }),
    );
    await expect(
      fetchAllScalableCapitalTransactions(fetchFn, { proxyUrl: "http://localhost:3141" }),
    ).rejects.toThrow(/Stopped after/);
  });
});
