import { describe, expect, it } from "vitest";
import {
  normalizeIsoOffsetWithoutColon,
  utcCalendarDateFromIsoTimestamp,
} from "./utc-calendar-date.js";

describe("normalizeIsoOffsetWithoutColon", () => {
  it("inserts a colon in a trailing numeric offset", () => {
    expect(normalizeIsoOffsetWithoutColon("2024-01-15T12:00:00+0000")).toBe(
      "2024-01-15T12:00:00+00:00",
    );
  });

  it("leaves short or already-normal timestamps unchanged", () => {
    expect(normalizeIsoOffsetWithoutColon("short")).toBe("short");
    expect(normalizeIsoOffsetWithoutColon("2024-01-15T12:00:00Z")).toBe("2024-01-15T12:00:00Z");
  });
});

describe("utcCalendarDateFromIsoTimestamp", () => {
  it("returns the UTC calendar day", () => {
    expect(utcCalendarDateFromIsoTimestamp("2024-06-01T23:30:00.000Z")).toBe("2024-06-01");
  });

  it("throws TypeError for unparseable input", () => {
    expect(() => utcCalendarDateFromIsoTimestamp("not-a-date", "Example")).toThrow(TypeError);
    expect(() => utcCalendarDateFromIsoTimestamp("not-a-date", "Example")).toThrow(/Example/);
  });
});
