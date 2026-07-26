import {
  transactionsResponseSchema,
  type ScalableCapitalProxyConfig,
  type ScalableCapitalTransaction,
} from "./types.js";

/** The subset of the fetch API this module needs, so tests can pass a stub. */
export interface HttpFetch {
  (url: string, init?: { headers?: Record<string, string> }): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}

const MAX_PAGES = 50;

function buildHeaders(config: ScalableCapitalProxyConfig): Record<string, string> {
  return config.proxyToken ? { "X-Gateway-Token": config.proxyToken } : {};
}

async function fetchTransactionsPage(
  fetchFn: HttpFetch,
  config: ScalableCapitalProxyConfig,
  params: { pageSize?: number; cursor?: string },
): Promise<{ transactions: ScalableCapitalTransaction[]; cursor: string | null | undefined }> {
  const url = new URL("/transactions", config.proxyUrl);
  if (params.pageSize) {
    url.searchParams.set("pageSize", String(params.pageSize));
  }
  if (params.cursor) {
    url.searchParams.set("cursor", params.cursor);
  }

  const response = await fetchFn(url.toString(), { headers: buildHeaders(config) });
  if (!response.ok) {
    throw new Error(`Scalable Capital proxy request to ${url.pathname} failed with status ${response.status}`);
  }

  const body = await response.json();
  const parsed = transactionsResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(
      `Scalable Capital /transactions response didn't match the expected shape: ${parsed.error.message}`,
    );
  }
  return { transactions: parsed.data.transactions, cursor: parsed.data.cursor };
}

/** Fetches every page of transaction history, following `cursor` until the proxy stops returning one. */
export async function fetchAllScalableCapitalTransactions(
  fetchFn: HttpFetch,
  config: ScalableCapitalProxyConfig,
  pageSize = 100,
): Promise<ScalableCapitalTransaction[]> {
  const all: ScalableCapitalTransaction[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await fetchTransactionsPage(fetchFn, config, cursor ? { pageSize, cursor } : { pageSize });
    all.push(...result.transactions);
    if (!result.cursor) {
      return all;
    }
    cursor = result.cursor;
  }

  throw new Error(`Stopped after ${MAX_PAGES} pages — check for a cursor loop in the proxy response`);
}
