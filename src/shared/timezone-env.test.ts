import { describe, expect, it } from "vitest";

const expectedIsoForLocalMidnight = {
  UTC: "2026-01-15T00:00:00.000Z",
  "Europe/Berlin": "2026-01-14T23:00:00.000Z",
} as const;

describe("test timezone environment", () => {
  it("honors TZ from the process environment and defaults to UTC", () => {
    const tz = process.env.TZ ?? "";
    expect(Object.keys(expectedIsoForLocalMidnight)).toContain(tz);
    let expectedIso: string | undefined;
    if (tz === "UTC") {
      expectedIso = expectedIsoForLocalMidnight.UTC;
    } else if (tz === "Europe/Berlin") {
      expectedIso = expectedIsoForLocalMidnight["Europe/Berlin"];
    }
    if (expectedIso === undefined) {
      throw new Error(`unexpected TZ value in tests: ${tz}`);
    }
    expect(new Date(2026, 0, 15, 0, 0, 0, 0).toISOString()).toBe(expectedIso);
  });
});
