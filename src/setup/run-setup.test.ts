import { describe, expect, it, vi } from "vitest";

const runCategoryMappingSetup = vi.hoisted(() => vi.fn().mockResolvedValue({ kind: "completed" as const }));

vi.mock("./run-category-mapping.js", () => ({
  runCategoryMappingSetup,
}));

import { MemoryLunchMoneyApiKeyStore } from "../shared/lunch-money-api-key-store.js";
import { manualAccountChoices, runSetup } from "./run-setup.js";
import type { SetupCliOptions } from "./setup-options.js";
import type { LunchMoneySetupClient, PromptChoice, SetupFilesystem, SetupPrompter } from "./types.js";

interface FakePrompterOptions {
  readonly password?: string;
  readonly brokers?: string[];
  readonly inputs?: string[];
  readonly selects?: string[];
  readonly confirms?: (message: string) => boolean;
}

function fakePrompter(options: FakePrompterOptions): SetupPrompter {
  let inputIndex = 0;
  let selectIndex = 0;
  return {
    password: vi.fn<() => Promise<string>>(async () => options.password ?? ""),
    input: vi.fn<() => Promise<string>>(async () => options.inputs?.[inputIndex++] ?? ""),
    checkbox: vi.fn<() => Promise<string[]>>(async () => options.brokers ?? []),
    async select<T extends string>(_message: string, _choices: readonly PromptChoice<T>[]): Promise<T> {
      const value = options.selects?.[selectIndex++] ?? "";
      return value as T;
    },
    search: vi.fn<() => Promise<string>>(async () => ""),
    confirm: vi.fn<(message: string, defaultValue?: boolean) => Promise<boolean>>(
      async (message: string, defaultValue?: boolean) =>
        options.confirms ? options.confirms(message) : (defaultValue ?? true),
    ),
    print: vi.fn<(line: string) => void>(),
    waitForEnter: vi.fn<() => Promise<void>>(async () => undefined),
  };
}

function fakeFilesystem(): SetupFilesystem {
  const files = new Map<string, string>();
  return {
    exists: vi.fn((path) => files.has(path)),
    readText: vi.fn((path) => files.get(path) ?? null),
    writeText: vi.fn(async (path, content) => {
      files.set(path, content);
    }),
    chmod: vi.fn(async () => undefined),
  };
}

function defaultRunSetupDeps(
  overrides: Partial<{
    prompter: SetupPrompter;
    filesystem: SetupFilesystem;
    runners: import("./types.js").SetupBrokerRunners;
    runSync: typeof import("../sync.js").runSyncCli;
    createLunchMoneyClient: () => LunchMoneySetupClient;
  }> = {},
) {
  return {
    prompter: fakePrompter({}),
    filesystem: fakeFilesystem(),
    runners: {},
    nodeVersion: "v24.0.0",
    createLunchMoneyClient: () => fakeLmClient(),
    apiKeyStore: new MemoryLunchMoneyApiKeyStore(),
    ...overrides,
  };
}

function pytrCredentialStorageAccepted(message: string): boolean {
  return message.includes("login command") || message.includes("Accept and run");
}

function fakeLmClient(): LunchMoneySetupClient {
  return {
    manualAccounts: {
      getAll: vi.fn().mockResolvedValue([{ id: 3, name: "TR operator-a" }]),
      create: vi.fn().mockResolvedValue({ id: 99, name: "Trade Republic (operator-a)" }),
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

function trInteractivePrompter(overrides: Partial<FakePrompterOptions> = {}): SetupPrompter {
  const userConfirms = overrides.confirms;
  return fakePrompter({
    password: "lm_test_key",
    brokers: ["trade-republic"],
    inputs: ["operator-a", "[]"],
    selects: ["3"],
    ...overrides,
    confirms: (message) => {
      if (pytrCredentialStorageAccepted(message)) {
        return true;
      }
      if (userConfirms) {
        return userConfirms(message);
      }
      return false;
    },
  });
}

function baseSetupOptions(overrides: Partial<SetupCliOptions> = {}): SetupCliOptions {
  return {
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
    ...overrides,
  };
}

describe("runSetup", () => {
  it("rejects non-interactive mode without a broker flag", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    await expect(
      runSetup(
        baseSetupOptions({
          nonInteractive: true,
          tradeRepublic: false,
          scalableCapital: false,
          owner: "operator-a",
          lunchMoneyAssetId: 3,
        }),
        defaultRunSetupDeps(),
      ),
    ).rejects.toThrow(/requires --trade-republic/);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("rejects incomplete non-interactive flags", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    await expect(
      runSetup(
        baseSetupOptions({
          nonInteractive: true,
          tradeRepublic: true,
          lunchMoneyAssetId: 3,
        }),
        defaultRunSetupDeps(),
      ),
    ).rejects.toThrow(/requires --owner/);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("requires an API key in non-interactive mode", async () => {
    delete process.env["LUNCH_MONEY_API_KEY"];
    await expect(
      runSetup(
        baseSetupOptions({
          nonInteractive: true,
          tradeRepublic: true,
          owner: "operator-a",
          lunchMoneyAssetId: 1,
        }),
        defaultRunSetupDeps(),
      ),
    ).rejects.toThrow(/Lunch Money API key is not stored/);
  });

  it("writes config.json in non-interactive mode without persisting the API key", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const filesystem = fakeFilesystem();
    const result = await runSetup(
      baseSetupOptions({
        nonInteractive: true,
        tradeRepublic: true,
        owner: "operator-a",
        lunchMoneyAssetId: 3,
      }),
      defaultRunSetupDeps({ filesystem, runSync: vi.fn().mockResolvedValue(undefined) }),
    );
    if (result.kind !== "completed") {
      throw new Error("expected completed setup");
    }
    expect(result.config.tradeRepublicProfiles[0]?.owner).toBe("operator-a");
    const written = String((filesystem.writeText as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] ?? "");
    expect(written).not.toContain("lm_test_key");
    expect(written).not.toContain("lunchMoneyApiKey");
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("writes per-broker manual account ids into config", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const filesystem = fakeFilesystem();
    const result = await runSetup(
      baseSetupOptions({
        nonInteractive: true,
        tradeRepublic: true,
        scalableCapital: true,
        owner: "operator-a",
        tradeRepublicAssetId: 3,
        scalableAssetId: 4,
      }),
      defaultRunSetupDeps({ filesystem }),
    );
    if (result.kind !== "completed") {
      throw new Error("expected completed setup");
    }
    expect(result.config.tradeRepublicProfiles[0]?.lunchMoneyAssetId).toBe(3);
    expect(result.config.scalableCapitalProfiles[0]?.lunchMoneyAssetId).toBe(4);
    const written = JSON.parse(filesystem.readText(result.files.configPath) ?? "");
    expect(written.tradeRepublicProfiles[0]?.lunchMoneyAssetId).toBe(3);
    expect(written.scalableCapitalProfiles[0]?.lunchMoneyAssetId).toBe(4);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("rejects when no broker is selected", async () => {
    await expect(
      runSetup(
        baseSetupOptions(),
        defaultRunSetupDeps({
          prompter: fakePrompter({ password: "lm_test_key", brokers: [] }),
        }),
      ),
    ).rejects.toThrow(/at least one broker/);
  });

  it("reuses an existing manual account when create hits a duplicate name", async () => {
    const lm = fakeLmClient();
  const accounts = [
    { id: 3, name: "Trade Republic (operator-a)" },
  ];
  (lm.manualAccounts.getAll as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce(accounts)
    .mockResolvedValueOnce(accounts)
    .mockResolvedValue(accounts);
    (lm.manualAccounts.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("ASSET_DISPLAY_NAME_ALREADY_EXISTS"),
    );
    const result = await runSetup(
      baseSetupOptions(),
      defaultRunSetupDeps({
        prompter: trInteractivePrompter({
          confirms: (message) =>
            message.includes("credential") || message.includes("already exists") || message.includes('Create manual'),
        }),
        createLunchMoneyClient: () => lm,
        runSync: vi.fn().mockResolvedValue(undefined),
      }),
    );
    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") {
      throw new Error("expected completed setup");
    }
    expect(result.config.tradeRepublicProfiles[0]?.lunchMoneyAssetId).toBe(3);
  });

  it("runs the interactive Trade Republic flow", async () => {
    const result = await runSetup(
      baseSetupOptions(),
      defaultRunSetupDeps({
        prompter: trInteractivePrompter(),
        runSync: vi.fn().mockResolvedValue(undefined),
      }),
    );
    expect(result.kind).toBe("completed");
  });

  it("supports scalable capital in non-interactive mode", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const result = await runSetup(
      baseSetupOptions({
        nonInteractive: true,
        scalableCapital: true,
        owner: "operator-b",
        lunchMoneyAssetId: 4,
        portfolioId: "portfolio-operator-b",
      }),
      defaultRunSetupDeps(),
    );
    expect(result.kind).toBe("completed");
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("configures scalable capital interactively with portfolio selection", async () => {
    const scRunner = {
      run: vi.fn().mockResolvedValue({
        stdout: JSON.stringify({
          ok: true,
          command: "broker.portfolios",
          data: {
            portfolios: [
              { id: "portfolio-operator-a", name: "A" },
              { id: "portfolio-operator-b", name: "B" },
            ],
          },
        }),
        stderr: "",
        exitCode: 0,
      }),
    };
    const result = await runSetup(
      baseSetupOptions(),
      defaultRunSetupDeps({
        prompter: fakePrompter({
          password: "lm_test_key",
          brokers: ["scalable-capital"],
          inputs: ["operator-b", "[]"],
          selects: ["3", "portfolio-operator-b"],
        }),
        runners: { sc: scRunner },
        runSync: vi.fn().mockResolvedValue(undefined),
      }),
    );
    if (result.kind !== "completed") {
      throw new Error("expected completed setup");
    }
    expect(result.config.scalableCapitalProfiles[0]?.portfolioId).toBe("portfolio-operator-b");
  });

  it("rejects an unknown manual account id", async () => {
    await expect(
      runSetup(
        baseSetupOptions(),
        defaultRunSetupDeps({
          prompter: trInteractivePrompter({ selects: ["999"] }),
        }),
      ),
    ).rejects.toThrow(/was not returned/);
  });

  it("validates sharedCardLast4 JSON", async () => {
    await expect(
      runSetup(
        baseSetupOptions(),
        defaultRunSetupDeps({
          prompter: trInteractivePrompter({ inputs: ["operator-a", '["12"]'] }),
        }),
      ),
    ).rejects.toThrow();
  });

  it("offers category mapping with default Yes after a dry-run", async () => {
    let categoryMappingDefault: boolean | undefined;
    const prompter = trInteractivePrompter();
    prompter.confirm = vi.fn(async (message: string, defaultYes?: boolean) => {
      if (message.includes("category mapping")) {
        categoryMappingDefault = defaultYes;
        return false;
      }
      if (message.includes("dry-run")) {
        return true;
      }
      if (pytrCredentialStorageAccepted(message)) {
        return true;
      }
      return defaultYes ?? true;
    });
    const result = await runSetup(
      baseSetupOptions(),
      defaultRunSetupDeps({
        prompter,
        runSync: vi.fn().mockResolvedValue(undefined),
      }),
    );
    expect(result.kind).toBe("completed");
    expect(categoryMappingDefault).toBe(true);
    expect(runCategoryMappingSetup).not.toHaveBeenCalled();
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("hands a Lunch Money client factory to category mapping when the operator accepts", async () => {
    runCategoryMappingSetup.mockClear();
    const lm = fakeLmClient();
    const prompter = trInteractivePrompter({
      confirms: (message) => message.includes("dry-run") || message.includes("category mapping"),
    });
    const result = await runSetup(
      baseSetupOptions(),
      defaultRunSetupDeps({
        prompter,
        runSync: vi.fn().mockResolvedValue(undefined),
        createLunchMoneyClient: () => lm,
      }),
    );
    expect(result.kind).toBe("completed");
    expect(runCategoryMappingSetup).toHaveBeenCalledTimes(1);
    const deps = runCategoryMappingSetup.mock.calls[0]?.[1] as {
      createClient?: (apiKey: string) => unknown;
    };
    expect(typeof deps.createClient).toBe("function");
    expect(deps.createClient?.("lm_test_key")).toBe(lm);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("creates a Lunch Money manual account when the operator selects new", async () => {
    const lm = fakeLmClient();
    const result = await runSetup(
      baseSetupOptions(),
      defaultRunSetupDeps({
        prompter: trInteractivePrompter({
          selects: ["__new__"],
          confirms: (message) =>
            message.includes("Create Lunch Money manual account") ||
            message.includes("credential") ||
            message.includes("login command"),
        }),
        runSync: vi.fn().mockResolvedValue(undefined),
        createLunchMoneyClient: () => lm,
      }),
    );
    expect(result.kind).toBe("completed");
    expect(lm.manualAccounts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Trade Republic (operator-a)",
        institution_name: "Trade Republic",
      }),
    );
  });

  it("re-prompts when the Lunch Money API key input is empty", async () => {
    const prompter = trInteractivePrompter({
      confirms: (message) => pytrCredentialStorageAccepted(message) || message.includes("dry-run"),
    });
  (prompter.password as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("lm_test_key");
    await expect(
      runSetup(
        baseSetupOptions(),
        defaultRunSetupDeps({
          prompter,
          runSync: vi.fn().mockResolvedValue(undefined),
        }),
      ),
    ).resolves.toMatchObject({ kind: "completed" });
    expect(prompter.password).toHaveBeenCalledTimes(2);
  });

  it("does not prompt to overwrite config saved incrementally during setup", async () => {
    const confirms: string[] = [];
    const result = await runSetup(
      baseSetupOptions(),
      defaultRunSetupDeps({
        prompter: trInteractivePrompter({
          confirms: (message) => {
            confirms.push(message);
            return (
              pytrCredentialStorageAccepted(message) ||
              message.includes("dry-run") ||
              message.includes("category mapping")
            );
          },
        }),
        runSync: vi.fn().mockResolvedValue(undefined),
      }),
    );
    expect(result.kind).toBe("completed");
    expect(confirms.some((message) => message.includes("overwrite"))).toBe(false);
  });

  it("defaults the profile label to me and uses it in the manual account name", async () => {
    const previousUser = process.env.USER;
    process.env.USER = "alice";
    const lm = fakeLmClient();
    try {
      const prompter = trInteractivePrompter({
        inputs: ["", ""],
        selects: ["__new__"],
        confirms: (message) =>
          message.includes("Create Lunch Money manual account") ||
          message.includes("credential") ||
          message.includes("login command"),
      });
      const result = await runSetup(
        baseSetupOptions(),
        defaultRunSetupDeps({
          prompter,
          createLunchMoneyClient: () => lm,
          runSync: vi.fn().mockResolvedValue(undefined),
        }),
      );
      expect(result.kind).toBe("completed");
      if (result.kind !== "completed") {
        throw new Error("expected completed setup");
      }
      expect(prompter.input).toHaveBeenCalledWith("Trade Republic profile label", "me");
      expect(lm.manualAccounts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Trade Republic (me)",
          institution_name: "Trade Republic",
        }),
      );
      expect(result.config.tradeRepublicProfiles[0]?.owner).toBe("me");
    } finally {
      if (previousUser === undefined) {
        delete process.env.USER;
      } else {
        process.env.USER = previousUser;
      }
    }
  });
});

describe("manualAccountChoices", () => {
  it("defaults to creating the broker-specific account when none matches", () => {
    const choices = manualAccountChoices(
      [
        { id: 1, name: "Checking" },
        { id: 2, name: "Savings" },
      ],
      "Scalable Capital (operator-a)",
    );
    expect(choices.map((choice) => choice.value)).toEqual(["__new__", "1", "2"]);
    expect(choices[0]?.name).toBe('Create new manual account "Scalable Capital (operator-a)"');
  });

  it("defaults to an existing account that already has the broker-specific name", () => {
    const choices = manualAccountChoices(
      [
        { id: 1, name: "Checking" },
        { id: 7, name: "trade republic (operator-a)" },
      ],
      "Trade Republic (operator-a)",
    );
    expect(choices.map((choice) => choice.value)).toEqual(["7", "__new__", "1"]);
  });
});
