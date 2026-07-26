import { z } from "zod";

/**
 * Shape returned by the `timeline` topic of the unofficial `trade-republic-api` package
 * (see its `TimelineEvent`/`TimeLineResponse` interfaces). Trade Republic doesn't publish
 * this schema, so we validate defensively rather than trusting the library's static types.
 */
export const timelineEventSchema = z.object({
  type: z.string(),
  data: z.object({
    id: z.string(),
    /** Epoch milliseconds. */
    timestamp: z.number(),
    title: z.string(),
    body: z.string().optional().default(""),
    /** Signed EUR amount; 0 (or absent in practice) for purely informational events. */
    cashChangeAmount: z.number(),
  }),
});
export type TimelineEvent = z.infer<typeof timelineEventSchema>;

export const timelineResponseSchema = z.object({
  data: z.array(timelineEventSchema),
});
export type TimelineResponse = z.infer<typeof timelineResponseSchema>;

export interface TradeRepublicCredentials {
  phoneNumber: string;
  pin: string;
}
