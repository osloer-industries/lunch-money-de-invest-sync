import { z } from "zod";

/** Normalized cash transaction used by the mapper (broker backend id preserved for dedup). */
export const scalableCapitalTransactionSchema = z.object({
  id: z.string(),
  date: z.string(),
  /** Normalized cash rows use `BrokerCashTransaction`; mapper tests may pass other type strings. */
  type: z.string(),
  description: z.string().optional().default(""),
  amount: z.number(),
  currency: z.string().default("EUR"),
  isin: z.string().optional(),
  /** Backend `cashTransactionType` (e.g. DEPOSIT, WITHDRAWAL, CASH_TRANSFER_IN) when the CLI provides it. */
  cashTransactionType: z.string().optional(),
});
export type ScalableCapitalTransaction = z.infer<typeof scalableCapitalTransactionSchema>;

export const scTransactionSummarySchema = z.object({
  id: z.string(),
  summary_type: z.union([z.string(), z.null()]).optional(),
  currency: z.union([z.string(), z.null()]).optional(),
  status: z.union([z.string(), z.null()]).optional(),
  is_cancellation: z.union([z.boolean(), z.null()]).optional(),
  last_event_datetime: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  amount: z.union([z.string(), z.number(), z.null()]).optional(),
  /** Cash rows: backend `cashTransactionType` (DEPOSIT, WITHDRAWAL, CASH_TRANSFER_IN, INTEREST, …). */
  cash_transaction_type: z.union([z.string(), z.null()]).optional(),
  /** Security rows: backend `securityTransactionType` (e.g. SAVINGS_PLAN). */
  security_transaction_type: z.union([z.string(), z.null()]).optional(),
  /** Security rows: order side (BUY / SELL). */
  side: z.union([z.string(), z.null()]).optional(),
});
export type ScTransactionSummary = z.infer<typeof scTransactionSummarySchema>;

export const scBrokerTransactionsResultSchema = z.object({
  cursor: z.union([z.string(), z.null()]).optional(),
  items: z.array(scTransactionSummarySchema),
});

export const scBrokerTransactionsDataSchema = z.object({
  result: scBrokerTransactionsResultSchema,
});

export const scMachineEnvelopeSchema = z.object({
  ok: z.boolean(),
  command: z.string().optional(),
  data: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string().optional(),
    })
    .optional(),
  hints: z.array(z.string()).optional(),
});
export type ScMachineEnvelope = z.infer<typeof scMachineEnvelopeSchema>;

export interface ScalableCapitalCliConfig {
  /** Executable name or path (default `sc` on PATH). */
  scBinaryPath?: string;
  /** When set, passed as SC_CONFIG_DIR for the child process. */
  scConfigDir?: string;
  /** Passed as `sc broker transactions --portfolio-id` when the operator has multiple portfolios. */
  portfolioId?: string;
  cliSubprocessTimeoutMs?: number;
}
