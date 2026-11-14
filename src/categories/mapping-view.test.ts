import { describe, expect, it } from "vitest";
import { buildMappingRows, formatMappingListLines } from "./mapping-view.js";

describe("mapping-view", () => {
  it("formats configured and missing rows", () => {
    const rows = buildMappingRows({ categoryMap: { deposit: 3 }, tagMap: { deposit: ["bank"] } }, new Map([[3, "Transfer"]]));
    const lines = formatMappingListLines(rows, false);
    expect(lines.join("\n")).toContain("Transfer (id 3)");
    expect(lines.join("\n")).toContain("no category");
  });

  it("labels output when category names are unavailable", () => {
    const rows = buildMappingRows({ categoryMap: {}, tagMap: {} }, new Map());
    expect(formatMappingListLines(rows, true)[0]).toContain("Lunch Money connection");
  });
});