import { describe, expect, it, vi } from "vitest";
import { promptSharedCardDigits, runSavedBrokerProfilesStep } from "./setup-profile-resume.js";
import type { PromptChoice, SetupFilesystem, SetupPrompter } from "./types.js";

function fakePrompter(
  overrides: {
    select?: <T extends string>(
      message: string,
      choices: readonly PromptChoice<T>[],
    ) => Promise<T>;
  } = {},
): SetupPrompter {
  return {
    password: vi.fn(),
    input: vi.fn(),
    select:
      overrides.select ??
      (async <T extends string>(_message: string, choices: readonly PromptChoice<T>[]): Promise<T> =>
        (choices[0]?.value ?? "keep") as T),
    checkbox: vi.fn(),
    search: vi.fn(),
    confirm: vi.fn(),
    print: vi.fn(),
    waitForEnter: vi.fn(),
  };
}

describe("runSavedBrokerProfilesStep", () => {
  it("continues when no profiles are saved", async () => {
    const fs: SetupFilesystem = {
      exists: () => false,
      readText: () => null,
      writeText: vi.fn(),
      chmod: vi.fn(),
    };
    const result = await runSavedBrokerProfilesStep(fakePrompter({}), fs, vi.fn());
    expect(result.kind).toBe("continue");
  });

  it("finishes when operator keeps saved profiles", async () => {
    const config = JSON.stringify({
      tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }],
      scalableCapitalProfiles: [],
    });
    const fs: SetupFilesystem = {
      exists: (p) => p.endsWith("config.json"),
      readText: () => config,
      writeText: vi.fn(),
      chmod: vi.fn(),
    };
    const result = await runSavedBrokerProfilesStep(
      fakePrompter({
        select: async <T extends string>(_message: string, _choices: readonly PromptChoice<T>[]): Promise<T> =>
          "keep" as T,
      }),
      fs,
      vi.fn(),
    );
    expect(result).toMatchObject({
      kind: "finished",
      tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }],
    });
  });
});

describe("promptSharedCardDigits", () => {
  it("reuses saved digits when keeping", async () => {
    const prompter = fakePrompter({
      select: async <T extends string>(_message: string, _choices: readonly PromptChoice<T>[]): Promise<T> =>
        "keep" as T,
    });
    const digits = await promptSharedCardDigits(prompter, ["1234", "5678"], (raw) => raw.split(","), vi.fn());
    expect(digits).toEqual(["1234", "5678"]);
  });
});