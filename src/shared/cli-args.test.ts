import { describe, expect, it } from "vitest";
import { exportTypeSummaryPath, parseCliArgv } from "./cli-args.js";

describe("cli-args", () => {
  it("wraps parseArgs failures", () => {
    expect(() =>
      parseCliArgv(["--unknown"], { options: {}, strict: true }, "bad"),
    ).toThrow(/bad:/);
  });

  it("reads export-type-summary only when non-empty", () => {
    expect(exportTypeSummaryPath({ "export-type-summary": "out.json" })).toBe("out.json");
    expect(exportTypeSummaryPath({ "export-type-summary": "" })).toBeNull();
    expect(exportTypeSummaryPath({})).toBeNull();
  });
});
