import { describe, expect, it, vi } from "vitest";
import { detectPytrLauncher } from "./detect-pytr-command.js";

describe("detectPytrLauncher", () => {
  it("prefers uvx pytr when uvx is present and pytr is not", () => {
    const exists = vi.fn((p: string) => p.endsWith("/uvx"));
    expect(detectPytrLauncher(exists).pytrCommand).toEqual(["uvx", "pytr@0.4.10"]);
  });

  it("prefers direct pytr when available", () => {
    const exists = vi.fn((p: string) => p.endsWith("/pytr") || p.endsWith("/uvx"));
    expect(detectPytrLauncher(exists).pytrCommand).toEqual(["pytr"]);
  });
});
