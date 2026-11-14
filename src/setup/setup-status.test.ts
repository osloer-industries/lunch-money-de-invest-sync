import { describe, expect, it } from "vitest";
import { isPromptInterrupted, SETUP_PAUSED_MESSAGE, reportSetupError } from "./setup-status.js";

describe("setup status", () => {
  it("detects prompt interruption", () => {
    const error = new Error("User force closed the prompt");
    error.name = "ExitPromptError";
    expect(isPromptInterrupted(error)).toBe(true);
  });

  it("prints pause message on interrupt", () => {
    const error = new Error("User force closed the prompt");
    error.name = "ExitPromptError";
    const lines: string[] = [];
    const original = console.error;
    console.error = (line: string) => lines.push(line);
    try {
      reportSetupError(error);
    } finally {
      console.error = original;
    }
    expect(lines.join("\n")).toContain(SETUP_PAUSED_MESSAGE);
  });
});