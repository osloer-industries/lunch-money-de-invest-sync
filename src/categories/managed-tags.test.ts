import { describe, expect, it } from "vitest";
import { collectManagedTagNames } from "./managed-tags.js";

describe("collectManagedTagNames", () => {
  it("includes suggested tags when tagMap is empty", () => {
    const names = collectManagedTagNames({});
    expect(names.has("saveback")).toBe(true);
    expect(names.has("shared")).toBe(true);
  });

  it("includes operator tags and built-in markers", () => {
    const names = collectManagedTagNames({ dividend: ["extra"] });
    expect(names.has("needs-review")).toBe(true);
    expect(names.has("dividend")).toBe(true);
    expect(names.has("extra")).toBe(true);
  });
});