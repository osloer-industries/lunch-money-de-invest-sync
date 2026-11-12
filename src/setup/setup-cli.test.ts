import { describe, expect, it } from "vitest";
import { assertInteractiveSetupAllowed, runSetupCli } from "../setup.js";

function withStdinIsTTY<T>(value: boolean | undefined, run: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  if (value === undefined) {
    Reflect.deleteProperty(process.stdin, "isTTY");
  } else {
    Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
  }
  try {
    return run();
  } finally {
    if (descriptor) {
      Object.defineProperty(process.stdin, "isTTY", descriptor);
    } else {
      Reflect.deleteProperty(process.stdin, "isTTY");
    }
  }
}

describe("assertInteractiveSetupAllowed", () => {
  it("allows non-interactive setup without a TTY", () => {
    withStdinIsTTY(false, () => {
      expect(() => assertInteractiveSetupAllowed({ help: false, nonInteractive: true } as never)).not.toThrow();
    });
  });

  it("rejects interactive setup when stdin is not a TTY", () => {
    withStdinIsTTY(false, () => {
      expect(() => assertInteractiveSetupAllowed({ help: false, nonInteractive: false } as never)).toThrow(/TTY/);
    });
  });
});

describe("runSetupCli", () => {
  it("prints help without requiring a TTY", async () => {
    const lines: string[] = [];
    await withStdinIsTTY(false, () => runSetupCli(["--help"], { logger: (line) => lines.push(line) }));
    expect(lines.join("\n")).toContain("npm run setup");
  });
});
