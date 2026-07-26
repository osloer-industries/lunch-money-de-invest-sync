import { z } from "zod";

/**
 * The local proxy (ffischbach/unofficial-scalable-capital-api) normalizes Scalable
 * Capital's GraphQL transaction categories (BrokerCashTransaction,
 * BrokerSecurityTransaction, BrokerNonTradeSecurityTransaction, BrokerEltifTransaction)
 * into REST JSON via `GET /transactions`. The proxy's README doesn't publish an example
 * response, so this schema is a best-effort mapping of the underlying GraphQL fields —
 * verify field names against your own proxy's output and adjust before relying on this.
 */
export const scalableCapitalTransactionSchema = z.object({
  id: z.string(),
  date: z.string(),
  /** e.g. "BrokerCashTransaction", "BrokerSecurityTransaction", ... */
  type: z.string(),
  description: z.string().optional().default(""),
  amount: z.number(),
  currency: z.string().default("EUR"),
  isin: z.string().optional(),
});
export type ScalableCapitalTransaction = z.infer<typeof scalableCapitalTransactionSchema>;

export const transactionsResponseSchema = z.object({
  transactions: z.array(scalableCapitalTransactionSchema),
  cursor: z.string().nullable().optional(),
  total: z.number().optional(),
});
export type TransactionsResponse = z.infer<typeof transactionsResponseSchema>;

export interface ScalableCapitalProxyConfig {
  proxyUrl: string;
  proxyToken?: string;
}
