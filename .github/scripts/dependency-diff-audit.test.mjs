import { describe, expect, it } from "vitest";
import {
  FAIL_RANK,
  collectAdvisories,
  findNewlyIntroducedHighCritical,
  parseAuditJson,
  rank,
} from "./dependency-diff-audit.mjs";

describe("parseAuditJson", () => {
  it("parses valid audit JSON", () => {
    expect(parseAuditJson('{"vulnerabilities":{}}', "test")).toEqual({
      vulnerabilities: {},
    });
  });

  it("throws on empty output", () => {
    expect(() => parseAuditJson("", "test")).toThrow(/no JSON/);
    expect(() => parseAuditJson("   ", "test")).toThrow(/no JSON/);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseAuditJson("{not-json", "test")).toThrow(/invalid JSON/);
  });
});

describe("collectAdvisories", () => {
  it("keys advisories by URL and respects via severity", () => {
    const audit = {
      vulnerabilities: {
        "left-pad": {
          severity: "moderate",
          via: [
            {
              source: 999,
              name: "left-pad",
              severity: "high",
              url: "https://example.com/advisories/999",
              title: "Prototype pollution",
            },
            "lodash",
          ],
        },
      },
    };
    const map = collectAdvisories(audit);
    expect(map.size).toBe(1);
    expect(map.get("https://example.com/advisories/999")).toEqual({
      severity: "high",
      name: "left-pad",
      title: "Prototype pollution",
    });
  });
});

describe("findNewlyIntroducedHighCritical", () => {
  it("ignores advisories already on base and below fail rank", () => {
    const base = collectAdvisories({
      vulnerabilities: {
        kept: {
          severity: "high",
          via: [{ url: "https://example.com/a/1", title: "Kept", severity: "high" }],
        },
      },
    });
    const head = collectAdvisories({
      vulnerabilities: {
        kept: {
          severity: "high",
          via: [{ url: "https://example.com/a/1", title: "Kept", severity: "high" }],
        },
        newMod: {
          severity: "moderate",
          via: [{ url: "https://example.com/a/2", title: "New mod", severity: "moderate" }],
        },
        newHigh: {
          severity: "high",
          via: [{ url: "https://example.com/a/3", title: "New high", severity: "high" }],
        },
      },
    });

    const found = findNewlyIntroducedHighCritical(head, base, FAIL_RANK);
    expect(found).toHaveLength(1);
    expect(found[0].key).toBe("https://example.com/a/3");
    expect(found[0].severity).toBe("high");
  });

  it("includes critical newly introduced advisories", () => {
    const head = collectAdvisories({
      vulnerabilities: {
        pkg: {
          severity: "critical",
          via: [{ url: "https://example.com/a/c", title: "Critical", severity: "critical" }],
        },
      },
    });
    const found = findNewlyIntroducedHighCritical(head, new Map(), FAIL_RANK);
    expect(found).toHaveLength(1);
    expect(rank(found[0].severity)).toBeGreaterThanOrEqual(FAIL_RANK);
  });
});
