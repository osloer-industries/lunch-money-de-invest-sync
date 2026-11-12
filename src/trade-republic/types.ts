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
});
export type PytrTimelineEvent = z.infer<typeof pytrTimelineEventSchema>;

export const pytrAllEventsSchema = z.array(pytrTimelineEventSchema);

export type TradeRepublicWafTokenMode = "default" | "playwright" | "awswaf" | "no-waf";

export interface TradeRepublicPytrConfig {
  readonly pytrCommand?: readonly string[];
  /** Absolute path to the pytr data directory (typically ends with `.pytr`). */
  readonly pytrHome?: string;
  readonly loginV2?: boolean;
  readonly wafTokenMode?: TradeRepublicWafTokenMode;
  /** Passed through to pytr `--account` when syncing a non-primary TR account. */
  readonly account?: string;
  readonly pytrMinVersion?: string;
}
