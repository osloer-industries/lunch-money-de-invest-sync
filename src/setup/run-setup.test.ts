import { describe, expect, it, vi } from "vitest";
import { runSetup } from "./run-setup.js";
import type { LunchMoneySetupClient, SetupFilesystem, SetupPrompter } from "./types.js";

function fakePrompter(answers: string[]): SetupPrompter {
  let index = 0;
  return {
    question: vi.fn(async () => answers[index++] ?? ""),
    confirm: vi.fn(async () => true),
    print: vi.fn(),
    waitForEnter: vi.fn(async () => undefined),
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

function fakeLmClient(): LunchMoneySetupClient {
  return {
    manualAccounts: {
      getAll: vi.fn().mockResolvedValue([{ id: 3, name: "TR operator-a" }]),
      create: vi.fn().mockResolvedValue({ id: 99, name: "Broker (operator-a)" }),
    },
  } as unknown as LunchMoneySetupClient;
}

describe("runSetup", () => {
  it("rejects incomplete non-interactive flags", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    await expect(
      runSetup(
        {
          nonInteractive: true,
          skipBrokerCheck: true,
          yes: true,
          tradeRepublic: true,
          scalableCapital: false,
          owner: null,
          lunchMoneyAssetId: 3,
          portfolioId: null,
          help: false,
        },
        {
          prompter: fakePrompter([]),
          filesystem: fakeFilesystem(),
          runners: {},
          nodeVersion: "v24.0.0",
          createLunchMoneyClient: () => fakeLmClient(),
        },
      ),
    ).rejects.toThrow(/requires --owner/);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("requires an API key in non-interactive mode", async () => {
    delete process.env["LUNCH_MONEY_API_KEY"];
    await expect(
      runSetup(
        {
          nonInteractive: true,
          skipBrokerCheck: true,
          yes: true,
          tradeRepublic: true,
          scalableCapital: false,
          owner: "operator-a",
          lunchMoneyAssetId: 1,
          portfolioId: null,
          help: false,
        },
        {
          prompter: fakePrompter([]),
          filesystem: fakeFilesystem(),
          runners: {},
          nodeVersion: "v24.0.0",
          createLunchMoneyClient: () => fakeLmClient(),
        },
      ),
    ).rejects.toThrow(/LUNCH_MONEY_API_KEY/);
  });
  it("writes .env and config.json in non-interactive mode", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const result = await runSetup(
      {
        nonInteractive: true,
        skipBrokerCheck: true,
        yes: true,
        tradeRepublic: true,
        scalableCapital: false,
        owner: "operator-a",
        lunchMoneyAssetId: 3,
        portfolioId: null,
        help: false,
      },
      {
        prompter: fakePrompter([]),
        filesystem: fakeFilesystem(),
        runners: {},
        nodeVersion: "v24.0.0",
        runSync: vi.fn().mockResolvedValue(undefined),
        createLunchMoneyClient: () => fakeLmClient(),
      },
    );
    if (result.kind !== "completed") {
      throw new Error("expected completed setup");
    }
    expect(result.config.tradeRepublicProfiles[0]?.owner).toBe("operator-a");
    expect(result.files.envPath.endsWith(".env")).toBe(true);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("runs the interactive Trade Republic flow", async () => {
  const prompt = fakePrompter(["lm_test_key", "operator-a", "3", "[]"]);
  prompt.confirm = vi.fn(async (message: string) => !message.includes("Scalable"));
    const result = await runSetup(
      {
        nonInteractive: false,
        skipBrokerCheck: true,
        yes: true,
        tradeRepublic: false,
        scalableCapital: false,
        owner: null,
        lunchMoneyAssetId: null,
        portfolioId: null,
        help: false,
      },
      {
        prompter: prompt,
        filesystem: fakeFilesystem(),
        runners: {},
        nodeVersion: "v24.0.0",
        runSync: vi.fn().mockResolvedValue(undefined),
        createLunchMoneyClient: () => fakeLmClient(),
      },
    );
    expect(result.kind).toBe("completed");
  });

  it("supports scalable capital in non-interactive mode", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const result = await runSetup(
      {
        nonInteractive: true,
        skipBrokerCheck: true,
        yes: true,
        tradeRepublic: false,
        scalableCapital: true,
        owner: "operator-b",
        lunchMoneyAssetId: 4,
        portfolioId: "portfolio-operator-b",
        help: false,
      },
      {
        prompter: fakePrompter([]),
        filesystem: fakeFilesystem(),
        runners: {},
        nodeVersion: "v24.0.0",
        createLunchMoneyClient: () => fakeLmClient(),
      },
    );
    expect(result.kind).toBe("completed");
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("configures scalable capital interactively with portfolio selection", async () => {
    const prompt = fakePrompter(["lm_test_key", "operator-b", "3", "portfolio-operator-b", "[]"]);
    prompt.confirm = vi.fn(async (message: string) => message.includes("Scalable"));
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
      {
        nonInteractive: false,
        skipBrokerCheck: true,
        yes: true,
        tradeRepublic: false,
        scalableCapital: false,
        owner: null,
        lunchMoneyAssetId: null,
        portfolioId: null,
        help: false,
      },
      {
        prompter: prompt,
        filesystem: fakeFilesystem(),
        runners: { sc: scRunner },
        nodeVersion: "v24.0.0",
        runSync: vi.fn().mockResolvedValue(undefined),
        createLunchMoneyClient: () => fakeLmClient(),
      },
    );
    if (result.kind !== "completed") {
      throw new Error("expected completed setup");
    }
    expect(result.config.scalableCapitalProfiles[0]?.portfolioId).toBe("portfolio-operator-b");
  });

  it("rejects an unknown manual account id", async () => {
    const prompt = fakePrompter(["lm_test_key", "operator-a", "999", "[]"]);
    prompt.confirm = vi.fn(async (message: string) => !message.includes("Scalable"));
    await expect(
      runSetup(
        {
          nonInteractive: false,
          skipBrokerCheck: true,
          yes: true,
          tradeRepublic: false,
          scalableCapital: false,
          owner: null,
          lunchMoneyAssetId: null,
          portfolioId: null,
          help: false,
        },
        {
          prompter: prompt,
          filesystem: fakeFilesystem(),
          runners: {},
          nodeVersion: "v24.0.0",
          createLunchMoneyClient: () => fakeLmClient(),
        },
      ),
    ).rejects.toThrow(/was not returned/);
  });

  it("validates sharedCardLast4 JSON", async () => {
    const prompt = fakePrompter(["lm_test_key", "operator-a", "3", '["12"]']);
    prompt.confirm = vi.fn(async (message: string) => !message.includes("Scalable"));
    await expect(
      runSetup(
        {
          nonInteractive: false,
          skipBrokerCheck: true,
          yes: true,
          tradeRepublic: false,
          scalableCapital: false,
          owner: null,
          lunchMoneyAssetId: null,
          portfolioId: null,
          help: false,
        },
        {
          prompter: prompt,
          filesystem: fakeFilesystem(),
          runners: {},
          nodeVersion: "v24.0.0",
          createLunchMoneyClient: () => fakeLmClient(),
        },
      ),
    ).rejects.toThrow();
  });

  it("refuses to overwrite an existing .env without confirmation", async () => {
    const fs = fakeFilesystem();
    (fs.exists as ReturnType<typeof vi.fn>).mockImplementation((path) => String(path).endsWith(".env"));
    const prompt = fakePrompter(["lm_test_key", "operator-a", "3", "[]"]);
    prompt.confirm = vi.fn(async (message: string) => {
      if (message.includes(".env")) {
        return false;
      }
      return !message.includes("Scalable");
    });
    await expect(
      runSetup(
        {
          nonInteractive: false,
          skipBrokerCheck: true,
          yes: false,
          tradeRepublic: false,
          scalableCapital: false,
          owner: null,
          lunchMoneyAssetId: null,
          portfolioId: null,
          help: false,
        },
        {
          prompter: prompt,
          filesystem: fs,
          runners: {},
          nodeVersion: "v24.0.0",
          runSync: vi.fn(),
          createLunchMoneyClient: () => fakeLmClient(),
        },
      ),
    ).rejects.toThrow(/overwrite existing .env/);
  });

  it("creates a Lunch Money manual account when the operator types new", async () => {
    const prompt = fakePrompter(["lm_test_key", "operator-a", "new", "[]"]);
    prompt.confirm = vi.fn(async (message: string) => {
      if (message.includes("Create a new")) {
        return true;
      }
      return !message.includes("Scalable");
    });
    const lm = fakeLmClient();
    const result = await runSetup(
      {
        nonInteractive: false,
        skipBrokerCheck: true,
        yes: true,
        tradeRepublic: false,
        scalableCapital: false,
        owner: null,
        lunchMoneyAssetId: null,
        portfolioId: null,
        help: false,
      },
      {
        prompter: prompt,
        filesystem: fakeFilesystem(),
        runners: {},
        nodeVersion: "v24.0.0",
        runSync: vi.fn().mockResolvedValue(undefined),
        createLunchMoneyClient: () => lm,
      },
    );
    expect(result.kind).toBe("completed");
    expect(lm.manualAccounts.create).toHaveBeenCalled();
  });
});
