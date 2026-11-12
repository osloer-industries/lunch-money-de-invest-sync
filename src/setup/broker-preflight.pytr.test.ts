import { describe, expect, it, vi } from "vitest";
import { confirmPytrCredentialStorage, promptPytrLoginPreferences } from "./broker-preflight.js";
import type { SetupPrompter } from "./types.js";

function prompter(overrides: Partial<SetupPrompter> = {}): SetupPrompter {
  return {
    password: vi.fn(),
    input: vi.fn(),
    select: vi.fn().mockResolvedValue("awswaf"),
    checkbox: vi.fn(),
    search: vi.fn(),
    confirm: vi.fn().mockResolvedValue(true),
    print: vi.fn(),
    waitForEnter: vi.fn(),
    ...overrides,
  };
}

describe("promptPytrLoginPreferences", () => {
  it("maps awswaf selection to wafTokenMode", async () => {
    const prefs = await promptPytrLoginPreferences(prompter());
    expect(prefs).toEqual({ loginV2: false, wafTokenMode: "awswaf" });
  });
});

describe("confirmPytrCredentialStorage", () => {
  it("rejects when the operator declines", async () => {
    await expect(
      confirmPytrCredentialStorage(
        prompter({ confirm: vi.fn().mockResolvedValue(false) }),
        "pytr login --v2 --store_credentials",
      ),
    ).rejects.toThrow(/credential storage/);
  });
});
