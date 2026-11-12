import {
  normalizeIsoOffsetWithoutColon,
  utcCalendarDateFromIsoTimestamp,
} from "../shared/utc-calendar-date.js";

export function tradeRepublicEventCalendarDate(isoTimestamp: string): string {
  return utcCalendarDateFromIsoTimestamp(
    normalizeIsoOffsetWithoutColon(isoTimestamp),
    "Trade Republic event",
  );
}
