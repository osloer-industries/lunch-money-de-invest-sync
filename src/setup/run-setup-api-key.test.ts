import { describe, expect, it, vi } from "vitest";
import { runSetup } from "./run-setup.js";
import type { SetupCliOptions } from "./setup-options.js";
import type {
  LunchMoneySetupClient,
  PromptChoice,
  SetupFilesystem,
  SetupPrompter,
} from "./types.js";
import { MemoryLunchMoneyApiKeyStore } from "../shared/lunch-money-api-key-store.js";

const baseOptions = (): SetupCliOptions => ({
  nonInteractive: false,
  skipBrokerCheck: true,
  yes: true,
  tradeRepublic: false,
  scalableCapital: false,
  owner: null,
  lunchMoneyAssetId: null,
  tradeRepublicAssetId: null,
  scalableAssetId: null,
  portfolioId: null,
  categories: false,
  exportTypeSummary: null,
  replaceApiKey: false,
  clearApiKey: false,
  help: false,
});

function fakeLmClient(): LunchMoneySetupClient {
  return {
    manualAccounts: {
      getAll: vi.fn().mockResolvedValue([{ id: 3, name: "TR operator-a" }]),
      create: vi.fn(),
    },
    categories: {
      getAll: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  } as unknown as LunchMoneySetupClient;
}

describe("runSetup API key storage", () => {
  it("reuses a stored API key without prompting", async () => {
    const store = new MemoryLunchMoneyApiKeyStore();
    await store.set("lm_stored_key");
    const password = vi.fn();
    const prompter: SetupPrompter = {
      password,
      input: vi.fn(() => Promise.resolve("")),
      select: <T extends string>(
        _message: string,
        choices: readonly PromptChoice<T>[],
      ): Promise<T> => Promise.resolve(choices[0]?.value as T),
      checkbox: vi.fn(() => Promise.resolve([])),
      search: vi.fn(() => Promise.resolve("")),
      confirm: vi.fn(() => Promise.resolve(false)),
      print: vi.fn(),
      waitForEnter: vi.fn(),
    };
    const filesystem: SetupFilesystem = {
      exists: () => false,
      readText: () => null,
      writeText: () => Promise.resolve(),
      chmod: () => Promise.resolve(),
    };
    await expect(
      runSetup(baseOptions(), {
        prompter,
        filesystem,
        runners: {},
        nodeVersion: "v24.0.0",
        createLunchMoneyClient: () => fakeLmClient(),
        apiKeyStore: store,
        runSync: vi.fn(),
      }),
    ).rejects.toThrow(/Select at least one broker/);
    expect(password).not.toHaveBeenCalled();
  });

});