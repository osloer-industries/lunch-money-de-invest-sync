import { describe, expect, it, vi } from "vitest";
import { reportSetupError, statusError, statusOk } from "./setup-status.js";

describe("setup-status", () => {
  it("formats status lines", () => {
    expect(statusOk("done")).toBe("✓ done");
    expect(statusError("nope")).toBe("✗ nope");
  });

  it("prints message-only errors unless DEBUG", () => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.DEBUG;
    reportSetupError(new Error("friendly"));
    expect(stderr).toHaveBeenCalledWith("friendly");
    stderr.mockRestore();
  });

  it("prints full errors when DEBUG=1", () => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.DEBUG = "1";
    const err = new Error("verbose");
    reportSetupError(err);
    expect(stderr).toHaveBeenCalledWith(err);
    delete process.env.DEBUG;
    stderr.mockRestore();
  });
});
