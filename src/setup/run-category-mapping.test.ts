import { describe, expect, it, vi } from "vitest";
import type { SyncConfig } from "../shared/config.js";
import { runCategoryMappingSetup } from "./run-category-mapping.js";
import type { SetupCliOptions } from "./setup-options.js";
import type { CategoryMappingSetupClient, SetupFilesystem, SetupPrompter } from "./types.js";
import type { TypeObservation } from "../shared/canonical-type.js";

const options: SetupCliOptions = {
  nonInteractive: false,
  skipBrokerCheck: true,
  yes: false,
  tradeRepublic: false,
  scalableCapital: false,
  owner: null,
  lunchMoneyAssetId: null,
  tradeRepublicAssetId: null,
  scalableAssetId: null,
  portfolioId: null,
  categories: true,
  exportTypeSummary: null,
  help: false,
};

function fakeCategoryFilesystem(): SetupFilesystem {
  return {
    exists: () => false,
    readText: () => null,
    writeText: async () => {},
    chmod: async () => {},
  };
}

const observations: TypeObservation[] = [
  {
    canonicalType: "deposit",
    brokerSubtype: "BrokerCashTransactionSummary",
    source: "scalable-capital",
    amount: 100,
    currency: "eur",
    payee: "Deposit",
    date: "2026-01-01",
  },
];

function prompter(config: {
  confirms?: boolean[];
  searches?: string[];
  checkboxes?: string[][];
}): SetupPrompter {
  let confirmIndex = 0;
  let searchIndex = 0;
  let checkboxIndex = 0;
  return {
    password: vi.fn(),
    input: vi.fn(),
    select: vi.fn(),
    search: vi.fn(async () => config.searches?.[searchIndex++] ?? SKIP_PLACEHOLDER),
    checkbox: vi.fn(async () => config.checkboxes?.[checkboxIndex++] ?? []),
    confirm: vi.fn(async () => config.confirms?.[confirmIndex++] ?? false),
    print: vi.fn(),
    waitForEnter: vi.fn(),
  };
}

const SKIP_PLACEHOLDER = "__skip__";

function readConfigFixture(overrides: Partial<SyncConfig> = {}): SyncConfig {
  return {
    lunchMoneyApiKey: "k",
    sharedCardLast4: [],
    tradeRepublicProfiles: [],
    scalableCapitalProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }],
    categoryMap: {},
    tagMap: {},
    ...overrides,
  };
}

function stubCategoryClient(
  getAll: ReturnType<typeof vi.fn>,
  create: ReturnType<typeof vi.fn> = vi.fn(),
): CategoryMappingSetupClient {
  return {
    categories: {
      getAll,
      create,
      get: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  } as CategoryMappingSetupClient;
}

const buyObservation: TypeObservation = {
  canonicalType: "buy",
  brokerSubtype: "BrokerSecurityTransactionSummary",
  source: "scalable-capital",
  amount: -50,
  currency: "eur",
  payee: "Buy",
  date: "2026-01-01",
};

describe("runCategoryMappingSetup", () => {
  it("rejects non-interactive mode", async () => {
    await expect(
      runCategoryMappingSetup(
        { ...options, nonInteractive: true },
        {
          prompter: prompter({}),
          filesystem: fakeCategoryFilesystem(),
          createClient: () => stubCategoryClient(vi.fn()),
        },
      ),
    ).rejects.toThrow(/interactive/);
  });

  it("writes categoryMap and tagMap into config.json", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const writes: string[] = [];
    const filesystem: SetupFilesystem = {
      exists: () => true,
      readText: () => "{}",
      writeText: async (_path, content) => {
        writes.push(content);
      },
      chmod: async () => {},
    };
    const result = await runCategoryMappingSetup(options, {
      prompter: prompter({
        confirms: [true, true, false],
        searches: ["99"],
        checkboxes: [[]],
      }),
      filesystem,
      readConfig: () => readConfigFixture(),
      createClient: () =>
        stubCategoryClient(
          vi.fn().mockResolvedValue([
            {
              id: 99,
              name: "Payment, Transfer",
              is_income: false,
              exclude_from_budget: true,
              exclude_from_totals: true,
              is_group: false,
            },
          ]),
        ),
      collectObservations: async () => observations,
    });
    expect(result.categoryMap.deposit).toBe(99);
    expect(writes[0]).toContain("categoryMap");
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("creates Saveback income when the operator picks income treatment", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const create = vi.fn().mockResolvedValue({ id: 88, name: "Saveback income" });
    const savebackObservation: TypeObservation = {
      canonicalType: "saveback",
      brokerSubtype: "benefits_saveback_execution",
      source: "trade-republic",
      amount: -5,
      currency: "eur",
      payee: "Saveback",
      date: "2026-01-01",
    };
    const result = await runCategoryMappingSetup(options, {
      prompter: {
        ...prompter({
          confirms: [true, true, true, false],
          searches: ["__new__"],
        }),
        select: vi.fn().mockResolvedValue("saveback-income"),
      },
      filesystem: fakeCategoryFilesystem(),
      readConfig: () =>
        readConfigFixture({ tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }] }),
      createClient: () => stubCategoryClient(vi.fn().mockResolvedValue([]), create),
      collectObservations: async () => [savebackObservation],
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Saveback income", is_income: true }),
    );
    expect(result.categoryMap.saveback).toBe(88);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("does not offer create-new for unknown types", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const unknownObservation: TypeObservation = {
      canonicalType: "unknown",
      brokerSubtype: "CARD_PAYMENT",
      source: "trade-republic",
      amount: -12,
      currency: "eur",
      payee: "Merchant",
      date: "2026-01-01",
    };
    const search = vi.fn().mockResolvedValue(SKIP_PLACEHOLDER);
    await runCategoryMappingSetup(options, {
      prompter: {
        ...prompter({ confirms: [true, false, false], searches: [SKIP_PLACEHOLDER] }),
        search,
      },
      filesystem: fakeCategoryFilesystem(),
      readConfig: () =>
        readConfigFixture({ tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }] }),
      createClient: () => stubCategoryClient(vi.fn().mockResolvedValue([])),
      collectObservations: async () => [unknownObservation],
    });
    const choices = search.mock.calls[0]?.[1] as Array<{ value: string }>;
    expect(choices.some((choice) => choice.value === "__new__")).toBe(false);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("creates a category when the operator confirms new", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const create = vi.fn().mockResolvedValue({ id: 42, name: "Investments" });
    const result = await runCategoryMappingSetup(options, {
      prompter: prompter({
        confirms: [true, true, true, false],
        searches: ["__new__"],
      }),
      filesystem: fakeCategoryFilesystem(),
      readConfig: () => readConfigFixture(),
      createClient: () => stubCategoryClient(vi.fn().mockResolvedValue([]), create),
      collectObservations: async () => [buyObservation],
    });
    expect(create).toHaveBeenCalled();
    expect(result.categoryMap.buy).toBe(42);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("requires broker profiles in config.json", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    await expect(
      runCategoryMappingSetup(options, {
        prompter: prompter({}),
        filesystem: fakeCategoryFilesystem(),
        readConfig: () => readConfigFixture({ scalableCapitalProfiles: [] }),
        createClient: () => stubCategoryClient(vi.fn()),
      }),
    ).rejects.toThrow(/no broker profiles/);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("rejects empty broker history", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    await expect(
      runCategoryMappingSetup(options, {
        prompter: prompter({}),
        filesystem: fakeCategoryFilesystem(),
        readConfig: () =>
          readConfigFixture({ scalableCapitalProfiles: [], tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }] }),
        createClient: () => stubCategoryClient(vi.fn()),
        collectObservations: async () => [],
      }),
    ).rejects.toThrow(/No classifiable/);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("rejects invalid category ids", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    await expect(
      runCategoryMappingSetup(options, {
        prompter: prompter({
          confirms: [true, true, false],
          searches: ["nope"],
          checkboxes: [["tag-one"]],
        }),
        filesystem: fakeCategoryFilesystem(),
        readConfig: () =>
          readConfigFixture({ scalableCapitalProfiles: [], tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }] }),
        createClient: () =>
          stubCategoryClient(
            vi.fn().mockResolvedValue([
              {
                id: 1,
                name: "Payment, Transfer",
                is_income: false,
                exclude_from_budget: true,
                exclude_from_totals: true,
                is_group: false,
              },
            ]),
          ),
        collectObservations: async () => observations,
      }),
    ).rejects.toThrow(/positive integer/);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("merges existing categoryMap and tagMap on disk", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const writes: string[] = [];
    const result = await runCategoryMappingSetup(options, {
      prompter: prompter({
        confirms: [true, true, false],
        searches: ["99"],
        checkboxes: [[]],
      }),
      filesystem: {
        exists: () => true,
        readText: () =>
          JSON.stringify({ categoryMap: { sell: 5 }, tagMap: { sell: ["invest"] }, lunchMoneyApiKey: "k" }),
        writeText: async (_path, content) => {
          writes.push(content);
        },
        chmod: async () => {},
      },
      readConfig: () => readConfigFixture({ categoryMap: { sell: 5 }, tagMap: { sell: ["invest"] } }),
      createClient: () =>
        stubCategoryClient(
          vi.fn().mockResolvedValue([
            {
              id: 99,
              name: "Payment, Transfer",
              is_income: false,
              exclude_from_budget: true,
              exclude_from_totals: true,
              is_group: false,
            },
          ]),
        ),
      collectObservations: async () => observations,
    });
    expect(result.categoryMap.deposit).toBe(99);
    expect(result.categoryMap.sell).toBe(5);
    expect(JSON.parse(writes[0] ?? "{}").tagMap.sell).toEqual(["invest"]);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("writes export-type-summary when requested", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const writes = new Map<string, string>();
    const result = await runCategoryMappingSetup(
      { ...options, exportTypeSummary: "summary.json" },
      {
        prompter: prompter({ confirms: [false, false, false] }),
        filesystem: {
          exists: () => false,
          readText: () => null,
          writeText: async (filePath, content) => {
            writes.set(filePath, content);
          },
          chmod: async () => {},
        },
        readConfig: () =>
          readConfigFixture({ scalableCapitalProfiles: [], tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }] }),
        createClient: () => stubCategoryClient(vi.fn().mockResolvedValue([])),
        collectObservations: async () => observations,
      },
    );
    expect(result.exportPath).toContain("summary.json");
    const summaryBody = [...writes.values()].find((body) => body.includes("amountBucket"));
    expect(summaryBody).toBeDefined();
    delete process.env["LUNCH_MONEY_API_KEY"];
  });
});
