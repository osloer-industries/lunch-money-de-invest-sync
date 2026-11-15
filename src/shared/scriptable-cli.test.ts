import { describe, expect, it } from "vitest";
import {
  assertInteractiveTerminal,
  parseCategoryMapAssignment,
  parseMappingFileJson,
  parseScriptableFlags,
  parseTagMapAssignment,
} from "./scriptable-cli.js";

describe("parseScriptableFlags", () => {
  it("detects json, events, and non-interactive", () => {
    const parsed = parseScriptableFlags(["--json", "--events", "--non-interactive", "list"]);
    expect(parsed.flags).toEqual({ json: true, events: true, nonInteractive: true });
    expect(parsed.rest).toEqual(["list"]);
  });
});

describe("assertInteractiveTerminal", () => {
  it("allows non-interactive bypass", () => {
    expect(() => assertInteractiveTerminal("test", true)).not.toThrow();
  });

  it("throws when stdin is not a TTY", () => {
    const tty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    expect(() => assertInteractiveTerminal("test", false)).toThrow(/requires an interactive terminal/);
    if (tty) {
      Object.defineProperty(process.stdin, "isTTY", tty);
    }
  });
});

describe("mapping helpers", () => {
  it("parses mapping files", () => {
    const payload = parseMappingFileJson('{"categoryMap":{"deposit":9}}', "mapping.json");
    expect(payload.categoryMap).toEqual({ deposit: 9 });
  });

  it("rejects invalid mapping files", () => {
    expect(() => parseMappingFileJson("{}", "mapping.json")).toThrow(/must include categoryMap/);
    expect(() => parseMappingFileJson("not-json", "mapping.json")).toThrow(/Invalid JSON/);
  });

  it("parses map and tag assignments", () => {
    expect(parseCategoryMapAssignment("deposit=9")).toEqual({ type: "deposit", categoryId: 9 });
    expect(parseTagMapAssignment("deposit=bank,savings")).toEqual({
      type: "deposit",
      tags: ["bank", "savings"],
    });
  });
});