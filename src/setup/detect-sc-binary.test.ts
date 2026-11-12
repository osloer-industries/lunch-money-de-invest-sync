import { describe, expect, it, vi } from "vitest";
import { detectScBinaryPath } from "./detect-sc-binary.js";

describe("detectScBinaryPath", () => {
  it("returns absolute configured path unchanged", () => {
    expect(detectScBinaryPath("/opt/bin/sc", () => false)).toBe("/opt/bin/sc");
  });

  it("resolves sc under trusted dirs", () => {
    const exists = vi.fn((p: string) => p === "/usr/bin/sc");
    expect(detectScBinaryPath(undefined, exists)).toBe("/usr/bin/sc");
  });
});
