import { z } from "zod";

/**
 * Bump when intentional breaking changes ship to `--json` / NDJSON outputs (#83).
 * Contract tests pin this version; update docs/scriptable-cli.md when it changes.
 */
export const SCRIPTABLE_JSON_CONTRACT_VERSION = 1;

export const scriptableCliErrorSchema = z.object({
  ok: z.literal(false),
  error: z.string().min(1),
});

export const brokerLoginEventDataSchema = z.discriminatedUnion("broker", [
  z.object({
    kind: z.literal("broker_login"),
    broker: z.literal("trade-republic"),
    phase: z.enum(["waiting_for_app_approval", "approval_countdown", "approved", "rejected", "timed_out"]),
    seconds_left: z.number().int().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal("broker_login"),
    broker: z.literal("scalable-capital"),
    phase: z.enum(["session_needed", "session_active", "login_required"]),
  }),
]);

export const brokerLoginEventEnvelopeSchema = z.object({
  event: z.literal("broker_login"),
  at: z.string().min(1),
  data: brokerLoginEventDataSchema,
});

const dryRunReviewRowSchema = z.object({
  externalId: z.string(),
  date: z.string(),
  amountPlain: z.string(),
  payee: z.string(),
  tags: z.array(z.string()),
  categoryLabel: z.string(),
  canonicalType: z.string(),
  action: z.enum(["insert", "skip_duplicate"]),
});

const dryRunProfileSummarySchema = z.object({
  broker: z.enum(["trade-republic", "scalable-capital"]),
  owner: z.string(),
  wouldInsert: z.number().int().nonnegative(),
  wouldSkip: z.number().int().nonnegative(),
  uncategorisedCount: z.number().int().nonnegative(),
  uncategorisedShare: z.number(),
  balanceLines: z.array(z.string()).optional(),
  rows: z.array(dryRunReviewRowSchema),
});

const syncAccountResultSchema = z.object({
  owner: z.string(),
  source: z.enum(["trade-republic", "scalable-capital"]),
  lunchMoneyAssetId: z.number().int().positive(),
  firstSyncForAccount: z.boolean(),
  existingBrokerExternalIds: z.number().int().nonnegative(),
  dryRun: z.boolean(),
  insertedCount: z.number().int().nonnegative().optional(),
  skippedCount: z.number().int().nonnegative().optional(),
  wouldInsert: z.number().int().nonnegative().optional(),
  wouldSkip: z.number().int().nonnegative().optional(),
  dryRunSummary: dryRunProfileSummarySchema.optional(),
  balanceFailures: z.number().int().nonnegative().optional(),
});

export const syncDryRunJsonSchema = z.object({
  ok: z.literal(true),
  balanceFailures: z.number().int().nonnegative(),
  accounts: z.array(syncAccountResultSchema),
  dryRunReview: z.object({
    aggregateUncategorisedShare: z.number(),
    uncategorisedShareExceedsThreshold: z.boolean(),
  }),
});

export const syncLiveJsonSchema = z.object({
  ok: z.literal(true),
  balanceFailures: z.number().int().nonnegative(),
  accounts: z.array(syncAccountResultSchema),
});

export const categoriesListJsonSchema = z.object({
  categoryMap: z.record(z.string(), z.number().int().positive()),
  tagMap: z.record(z.string(), z.array(z.string().min(1))),
  rows: z.array(
    z.object({
      canonicalType: z.string(),
      categoryId: z.number().int().positive().nullable(),
      categoryName: z.string().nullable(),
      tags: z.array(z.string()),
    }),
  ),
  missingApi: z.boolean(),
});

export const categoriesListLunchMoneyJsonSchema = z.object({
  categories: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      is_income: z.boolean(),
      exclude_from_budget: z.boolean(),
      exclude_from_totals: z.boolean(),
    }),
  ),
  tags: z.array(z.object({ id: z.number().int().positive(), name: z.string() })),
});

export const categoriesApplyJsonSchema = z.object({
  command: z.literal("apply"),
  changed: z.boolean(),
  categoryMap: z.record(z.string(), z.number().int().positive()),
  tagMap: z.record(z.string(), z.array(z.string().min(1))),
});

export function assertScriptableJsonContract<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${label} JSON contract mismatch: ${parsed.error.message}`);
  }
  return parsed.data;
}