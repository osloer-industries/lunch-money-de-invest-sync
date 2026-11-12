import { describe, expect, it } from "vitest";
import { parseStoredMaps } from "./config-maps.js";

describe("parseStoredMaps", () => {
  it("parses valid category and tag maps", () => {
    const parsed = parseStoredMaps({
      categoryMap: { deposit: 1 },
      tagMap: { deposit: ["investment"] },
    });
    expect(parsed.categoryMap.deposit).toBe(1);
    expect(parsed.tagMap.deposit).toEqual(["investment"]);
  });

  it("rejects invalid keys by returning empty maps", () => {
    const parsed = parseStoredMaps({
      categoryMap: { "not-a-type": 1 },
      tagMap: { bad: ["x"] },
    });
    expect(parsed.categoryMap).toEqual({});
    expect(parsed.tagMap).toEqual({});
  });
});
