/** Fix ISO offsets written without a colon before minutes (for example `+0000`). */
export function normalizeIsoOffsetWithoutColon(isoTimestamp: string): string {
  if (isoTimestamp.length < 5) {
    return isoTimestamp;
  }
  const tail = isoTimestamp.slice(-5);
  const sign = tail[0];
  if (sign !== "+" && sign !== "-") {
    return isoTimestamp;
  }
  if (!/^\d{4}$/.test(tail.slice(1))) {
    return isoTimestamp;
  }
  return `${isoTimestamp.slice(0, -5)}${tail.slice(0, 3)}:${tail.slice(3)}`;
}

/** Lunch Money `date` uses the UTC calendar day of a broker event timestamp. */
export function utcCalendarDateFromIsoTimestamp(isoTimestamp: string, label = "Event"): string {
  const millis = Date.parse(isoTimestamp);
  if (!Number.isFinite(millis)) {
    throw new TypeError(`${label} timestamp is not valid ISO-8601: ${isoTimestamp}`);
  }
  return new Date(millis).toISOString().slice(0, 10);
}
