import { describe, expect, it } from "vitest";

const expectedIsoForLocalMidnight = {
  UTC: "2026-01-15T00:00:00.000Z",
  "Europe/Berlin": "2026-01-14T23:00:00.000Z",
} as const;

describe("test timezone environment", () => {
  it("honors TZ from the process environment and defaults to UTC", () => {
    const tz = process.env.TZ ?? "";
    expect(Object.keys(expectedIsoForLocalMidnight)).toContain(tz);
    const expectedIso = expectedIsoForLocalMidnight[tz as keyof typeof expectedIsoForLocalMidnight];
    expect(new Date(2026, 0, 15, 0, 0, 0, 0).toISOString()).toBe(expectedIso);
  });
});
