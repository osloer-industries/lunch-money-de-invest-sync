import { describe, expect, it } from "vitest";
import {
  type CategoryTagMaps,
  cloneMaps,
  removeTypeMappings,
  setCategoryForType,
  setTagsForType,
} from "./mapping-mutations.js";

describe("mapping-mutations", () => {
  it("clones maps without sharing tag arrays", () => {
    const maps: CategoryTagMaps = { categoryMap: { deposit: 1 }, tagMap: { deposit: ["a"] } };
    const copy = cloneMaps(maps);
    copy.tagMap.deposit?.push("b");
    expect(maps.tagMap.deposit).toEqual(["a"]);
  });

  it("sets and clears category and tag entries", () => {
    let maps: CategoryTagMaps = { categoryMap: {}, tagMap: {} };
    maps = setCategoryForType(maps, "deposit", 12);
    maps = setTagsForType(maps, "deposit", ["bank"]);
    expect(maps.categoryMap.deposit).toBe(12);
    expect(maps.tagMap.deposit).toEqual(["bank"]);

    maps = setCategoryForType(maps, "deposit", undefined);
    expect(maps.categoryMap.deposit).toBeUndefined();

    maps = setTagsForType(maps, "deposit", []);
    expect(maps.tagMap.deposit).toBeUndefined();

    maps = setCategoryForType(maps, "fee", 3);
    maps = removeTypeMappings(maps, "fee");
    expect(maps.categoryMap.fee).toBeUndefined();
    expect(maps.tagMap.fee).toBeUndefined();
  });
});