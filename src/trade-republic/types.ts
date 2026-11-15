import { z } from "zod";

const pytrAmountSchema = z
  .object({
    currency: z.string(),
    value: z.number(),
    fractionDigits: z.number().optional(),
  })
  .nullable()
  .optional();

/** Shape of one enriched timeline row in pytr's `all_events.json` (validated at the boundary). */
export const pytrTimelineEventSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().min(1),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  amount: pytrAmountSchema,
  eventType: z.string().nullable().optional(),
  hidden: z.boolean().optional(),
  deleted: z.boolean().optional(),
  /** Timeline status, e.g. `EXECUTED` or `CANCELED` (cancelled/declined rows never moved cash). */
  status: z.string().nullable().optional(),
  /** Raw detail payload; only the header section's `data.status` is read (see broker-type-classification). */
  details: z.unknown().optional(),
});
export type PytrTimelineEvent = z.infer<typeof pytrTimelineEventSchema>;

export const pytrAllEventsSchema = z.array(pytrTimelineEventSchema);

export interface TradeRepublicPytrConfig {
  readonly pytrCommand?: readonly string[];
  /** Absolute path to the pytr data directory (typically ends with `.pytr`). */
  readonly pytrHome?: string;
  /** Passed through to pytr `--account` when syncing a non-primary TR account. */
  readonly account?: string;
  readonly pytrMinVersion?: string;
  readonly cliSubprocessTimeoutMs?: number;
}
