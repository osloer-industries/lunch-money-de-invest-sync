import { describe, expect, it } from "vitest";
import { parseCategoriesCliOptions } from "./categories-options.js";

describe("parseCategoriesCliOptions", () => {
  it("parses help", () => {
    expect(parseCategoriesCliOptions(["--help"]).help).toBe(true);
  });

  it("parses list, edit, reapply, apply, and list-lunch-money", () => {
    expect(parseCategoriesCliOptions(["list"]).command).toBe("list");
    expect(parseCategoriesCliOptions(["edit"]).command).toBe("edit");
    expect(parseCategoriesCliOptions(["reapply", "--dry-run"]).dryRun).toBe(true);
    expect(parseCategoriesCliOptions(["apply", "--map", "deposit=1"]).command).toBe("apply");
    expect(parseCategoriesCliOptions(["list-lunch-money", "--json"]).json).toBe(true);
  });

  it("rejects unknown commands", () => {
    expect(() => parseCategoriesCliOptions(["nope"])).toThrow(/Unknown command/);
  });

  it("wraps parseArgs failures", () => {
    expect(() => parseCategoriesCliOptions(["--not-a-real-flag"])).toThrow(/Invalid categories arguments/);
  });

  it("rejects extra positionals", () => {
    expect(() => parseCategoriesCliOptions(["list", "extra"])).toThrow(/Too many arguments/);
  });
});