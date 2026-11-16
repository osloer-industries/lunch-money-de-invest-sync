import { describe, expect, it } from "vitest";
import { applyMappingMutations, mapsAreEqual } from "./apply-mapping.js";

describe("applyMappingMutations", () => {
  it("merges assignments idempotently", () => {
    const base = { categoryMap: { deposit: 1 }, tagMap: {} };
    const once = applyMappingMutations(base, {
      categoryAssignments: [{ type: "deposit", categoryId: 2 }],
    });
    const twice = applyMappingMutations(once, {
      categoryAssignments: [{ type: "deposit", categoryId: 2 }],
    });
    expect(mapsAreEqual(once, twice)).toBe(true);
    expect(once.categoryMap.deposit).toBe(2);
  });

  it("applies tag and file payloads", () => {
    const maps = applyMappingMutations(
      { categoryMap: {}, tagMap: {} },
      {
        fromFile: { categoryMap: { buy: 3 }, tagMap: { buy: ["investment"] } },
        tagAssignments: [{ type: "deposit", tags: ["bank"] }],
      },
    );
    expect(maps.categoryMap.buy).toBe(3);
    expect(maps.tagMap.buy).toEqual(["investment"]);
    expect(maps.tagMap.deposit).toEqual(["bank"]);
  });

  it("rejects unknown canonical types", () => {
    expect(() =>
      applyMappingMutations({ categoryMap: {}, tagMap: {} }, {
        categoryAssignments: [{ type: "not-a-type", categoryId: 1 }],
      }),
    ).toThrow(/Unknown canonical type/);
  });
});