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
  tradeRepublicHoldingsAccountId: null,
  scalableHoldingsAccountId: null,
  scalableSavingsAccountId: null,
  categories: true,
  exportTypeSummary: null,
  json: false,
  events: false,
  replaceApiKey: false,
  clearApiKey: false,
  help: false,
};

function fakeCategoryFilesystem(): SetupFilesystem {
  return {
    exists: () => false,
    readText: () => null,
    writeText: () => Promise.resolve(),
    chmod: () => Promise.resolve(),
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
    search: vi.fn(() => Promise.resolve(config.searches?.[searchIndex++] ?? SKIP_PLACEHOLDER)),
    checkbox: vi.fn(() => Promise.resolve(config.checkboxes?.[checkboxIndex++] ?? [])),
    confirm: vi.fn(() => Promise.resolve(config.confirms?.[confirmIndex++] ?? false)),
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
      writeText: (_path, content) => {
        writes.push(content);
        return Promise.resolve();
      },
      chmod: () => Promise.resolve(),
    };
    const result = await runCategoryMappingSetup(options, {
      prompter: prompter({
        confirms: [false],
        searches: ["99"],
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
      collectObservations: () => Promise.resolve(observations),
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
          confirms: [true, false],
          searches: ["__new__"],
        }),
        select: vi.fn().mockResolvedValue("saveback-income"),
      },
      filesystem: fakeCategoryFilesystem(),
      readConfig: () =>
        readConfigFixture({ tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }] }),
      createClient: () => stubCategoryClient(vi.fn().mockResolvedValue([]), create),
      collectObservations: () => Promise.resolve([savebackObservation]),
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
        ...prompter({ confirms: [false], searches: [SKIP_PLACEHOLDER] }),
        search,
      },
      filesystem: fakeCategoryFilesystem(),
      readConfig: () =>
        readConfigFixture({ tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }] }),
      createClient: () => stubCategoryClient(vi.fn().mockResolvedValue([])),
      collectObservations: () => Promise.resolve([unknownObservation]),
    });
    const choices = search.mock.calls[0]?.[1] as Array<{ value: string }>;
    expect(choices.some((choice) => choice.value === "__new__")).toBe(false);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("rejects mapping to a category group id", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    await expect(
      runCategoryMappingSetup(options, {
        prompter: prompter({
          confirms: [],
          searches: ["200"],
        }),
        filesystem: fakeCategoryFilesystem(),
        readConfig: () => readConfigFixture(),
        createClient: () =>
          stubCategoryClient(
            vi.fn().mockResolvedValue([
              {
                id: 200,
                name: "Investments",
                is_income: false,
                exclude_from_budget: true,
                exclude_from_totals: true,
                is_group: true,
              },
            ]),
          ),
        collectObservations: () => Promise.resolve(observations),
      }),
    ).rejects.toThrow(/category group/);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("warns when an existing category has different flags than the template", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const result = await runCategoryMappingSetup(options, {
      prompter: prompter({
        confirms: [false, false],
        searches: ["101"],
      }),
      filesystem: fakeCategoryFilesystem(),
      readConfig: () => readConfigFixture(),
      createClient: () =>
        stubCategoryClient(
          vi.fn().mockResolvedValue([
            {
              id: 101,
              name: "Savings",
              is_income: false,
              exclude_from_budget: false,
              exclude_from_totals: false,
              is_group: false,
            },
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
      collectObservations: () => Promise.resolve(observations),
    });
    expect(result.categoryMap.deposit).toBeUndefined();
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("prompts for Scalable security types even when only Scalable profiles exist", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const searchMessages: string[] = [];
    await runCategoryMappingSetup(options, {
      prompter: {
        ...prompter({}),
        search: vi.fn((message: string) => {
          searchMessages.push(message);
          return Promise.resolve(SKIP_PLACEHOLDER);
        }),
      },
      filesystem: fakeCategoryFilesystem(),
      readConfig: () => readConfigFixture(),
      createClient: () => stubCategoryClient(vi.fn().mockResolvedValue([])),
      collectObservations: () => Promise.resolve([buyObservation, observations[0]!]),
    });
    expect(searchMessages.some((message) => message.includes('"buy"'))).toBe(true);
    expect(searchMessages.some((message) => message.includes('"deposit"'))).toBe(true);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("creates a category when the operator confirms new", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const create = vi.fn().mockResolvedValue({ id: 42, name: "Investments" });
    const result = await runCategoryMappingSetup(options, {
      prompter: prompter({
        confirms: [true, false],
        searches: ["__new__"],
      }),
      filesystem: fakeCategoryFilesystem(),
      readConfig: () =>
        readConfigFixture({ tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }] }),
      createClient: () => stubCategoryClient(vi.fn().mockResolvedValue([]), create),
      collectObservations: () => Promise.resolve([buyObservation]),
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
        collectObservations: () => Promise.resolve([]),
      }),
    ).rejects.toThrow(/No classifiable/);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("rejects invalid category ids", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    await expect(
      runCategoryMappingSetup(options, {
        prompter: prompter({
          confirms: [false],
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
        collectObservations: () => Promise.resolve(observations),
      }),
    ).rejects.toThrow(/positive integer/);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("merges existing categoryMap and tagMap on disk", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const writes: string[] = [];
    const result = await runCategoryMappingSetup(options, {
      prompter: prompter({
        confirms: [false],
        searches: ["99"],
      }),
      filesystem: {
        exists: () => true,
        readText: () =>
          JSON.stringify({ categoryMap: { sell: 5 }, tagMap: { sell: ["invest"] }, lunchMoneyApiKey: "k" }),
        writeText: (_path, content) => {
          writes.push(content);
          return Promise.resolve();
        },
        chmod: () => Promise.resolve(),
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
      collectObservations: () => Promise.resolve(observations),
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
          writeText: (filePath, content) => {
            writes.set(filePath, content);
            return Promise.resolve();
          },
          chmod: () => Promise.resolve(),
        },
        readConfig: () =>
          readConfigFixture({ scalableCapitalProfiles: [], tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }] }),
        createClient: () => stubCategoryClient(vi.fn().mockResolvedValue([])),
        collectObservations: () => Promise.resolve(observations),
      },
    );
    expect(result.exportPath).toContain("summary.json");
    const summaryBody = [...writes.values()].find((body) => body.includes("amountBucket"));
    expect(summaryBody).toBeDefined();
    delete process.env["LUNCH_MONEY_API_KEY"];
  });
});

function category(
  id: number,
  name: string,
  flags: { is_income?: boolean; excluded?: boolean; is_group?: boolean } = {},
): Record<string, unknown> {
  return {
    id,
    name,
    is_income: flags.is_income ?? false,
    exclude_from_budget: flags.excluded ?? false,
    exclude_from_totals: flags.excluded ?? false,
    is_group: flags.is_group ?? false,
  };
}

function observation(canonicalType: TypeObservation["canonicalType"]): TypeObservation {
  return {
    canonicalType,
    brokerSubtype: `subtype-${canonicalType}`,
    source: "trade-republic",
    amount: -10,
    currency: "eur",
    payee: "Payee",
    date: "2026-01-01",
  };
}

const trConfig = (): SyncConfig =>
  readConfigFixture({
    scalableCapitalProfiles: [],
    tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }],
  });

/** Filesystem that keeps config.json in memory so incremental writes can be inspected. */
function memoryFilesystem(initial = "{}"): SetupFilesystem & { writes: string[] } {
  let current = initial;
  const writes: string[] = [];
  return {
    writes,
    exists: () => true,
    readText: () => current,
    writeText: (_path, content) => {
      current = content;
      writes.push(content);
      return Promise.resolve();
    },
    chmod: () => Promise.resolve(),
  };
}

function withTags(
  client: CategoryMappingSetupClient,
  getAll: () => Promise<Array<{ name: string }>>,
): CategoryMappingSetupClient {
  return { ...client, tags: { getAll } };
}

type Choice = { name: string; value: string; checked?: boolean };

describe("runCategoryMappingSetup — grouped journey", () => {
  it("asks once for buy and savings-plan and maps both to the matching existing category", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const search = vi.fn((_message: string, choices: readonly Choice[]) => Promise.resolve(choices[0]!.value));
    const result = await runCategoryMappingSetup(options, {
      prompter: { ...prompter({ confirms: [false] }), search },
      filesystem: memoryFilesystem(),
      readConfig: trConfig,
      createClient: () =>
        stubCategoryClient(
          vi.fn().mockResolvedValue([category(5, "Groceries"), category(7, "Investments", { excluded: true })]),
        ),
      collectObservations: () => Promise.resolve([observation("savings-plan"), observation("buy")]),
    });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0]?.[0]).toBe('Category for types "buy", "savings-plan"');
    expect(search.mock.calls[0]?.[1][0]).toEqual({ name: "[7] Investments", value: "7" });
    expect(result.categoryMap).toMatchObject({ buy: 7, "savings-plan": 7 });
    expect(result.tagMap).toMatchObject({ buy: [], "savings-plan": [] });
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("offers create-new Income first for dividend + interest and scopes their suggested tags", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const create = vi.fn().mockResolvedValue({ id: 31, name: "Income" });
    const search = vi.fn((_message: string, choices: readonly Choice[]) => Promise.resolve(choices[0]!.value));
    const checkbox = vi.fn((_message: string, choices: readonly Choice[]) =>
      Promise.resolve(choices.filter((choice) => choice.checked).map((choice) => choice.value)),
    );
    const result = await runCategoryMappingSetup(options, {
      prompter: { ...prompter({ confirms: [true, false] }), search, checkbox },
      filesystem: memoryFilesystem(),
      readConfig: trConfig,
      createClient: () => stubCategoryClient(vi.fn().mockResolvedValue([]), create),
      collectObservations: () => Promise.resolve([observation("interest"), observation("dividend")]),
    });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0]?.[1][0]).toEqual({ name: 'Create new category "Income"', value: "__new__" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Income", is_income: true, exclude_from_budget: false }),
    );
    expect(result.categoryMap).toMatchObject({ dividend: 31, interest: 31 });
    expect(checkbox.mock.calls[0]?.[1]).toEqual([
      { name: "dividend (suggested, dividend only)", value: "dividend", checked: true },
      { name: "interest (suggested, interest only)", value: "interest", checked: true },
    ]);
    expect(result.tagMap.dividend).toEqual(["dividend"]);
    expect(result.tagMap.interest).toEqual(["interest"]);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("defaults unknown to Skip, lists the transfer category next, and offers no create-new", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const search = vi.fn((_message: string, choices: readonly Choice[]) => Promise.resolve(choices[0]!.value));
    const confirm = vi.fn(() => Promise.resolve(false));
    const print = vi.fn();
    const result = await runCategoryMappingSetup(options, {
      prompter: { ...prompter({}), search, confirm, print },
      filesystem: memoryFilesystem(),
      readConfig: trConfig,
      createClient: () =>
        stubCategoryClient(vi.fn().mockResolvedValue([category(99, "Payment, Transfer", { excluded: true })])),
      collectObservations: () => Promise.resolve([observation("unknown")]),
    });
    const choices = search.mock.calls[0]?.[1] ?? [];
    expect(choices[0]).toEqual({ name: "Skip (no mapping)", value: "__skip__" });
    expect(choices[1]).toEqual({ name: "[99] Payment, Transfer", value: "99" });
    expect(choices.some((choice) => choice.value === "__new__")).toBe(false);
    expect(result.categoryMap.unknown).toBeUndefined();
    expect(result.tagMap.unknown).toEqual([]);
    expect(confirm).toHaveBeenCalledTimes(1); // only "Run a dry-run sync now?"
    expect(print.mock.calls.some(([line]) => String(line).includes("Unknown rows: Skip is the default"))).toBe(true);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("still lets unknown be mapped to the transfer category without a flag warning", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const search = vi.fn((_message: string, choices: readonly Choice[]) => Promise.resolve(choices[1]!.value));
    const confirm = vi.fn(() => Promise.resolve(false));
    const result = await runCategoryMappingSetup(options, {
      prompter: { ...prompter({}), search, confirm },
      filesystem: memoryFilesystem(),
      readConfig: trConfig,
      createClient: () =>
        stubCategoryClient(vi.fn().mockResolvedValue([category(99, "Payment, Transfer", { excluded: true })])),
      collectObservations: () => Promise.resolve([observation("unknown")]),
    });
    expect(result.categoryMap.unknown).toBe(99);
    expect(confirm).toHaveBeenCalledTimes(1);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("keeps unknown separate from transfer types so it can be skipped on its own", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const searchMessages: string[] = [];
    const search = vi.fn((message: string, choices: readonly Choice[]) => {
      searchMessages.push(message);
      return Promise.resolve(message.includes("unknown") ? "__skip__" : choices[0]!.value);
    });
    const result = await runCategoryMappingSetup(options, {
      prompter: { ...prompter({ confirms: [false] }), search },
      filesystem: memoryFilesystem(),
      readConfig: trConfig,
      createClient: () =>
        stubCategoryClient(vi.fn().mockResolvedValue([category(99, "Payment, Transfer", { excluded: true })])),
      collectObservations: () =>
        Promise.resolve([
          observation("unknown"),
          observation("deposit"),
          observation("withdrawal"),
          observation("transfer"),
        ]),
    });
    expect(searchMessages).toEqual([
      'Category for types "deposit", "transfer", "withdrawal"',
      'Category for type "unknown"',
    ]);
    expect(result.categoryMap).toMatchObject({ deposit: 99, transfer: 99, withdrawal: 99 });
    expect(result.categoryMap.unknown).toBeUndefined();
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("treats an empty tag submission as no tags and never opens an empty checkbox", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const checkbox = vi.fn();
    const input = vi.fn().mockResolvedValue("");
    const result = await runCategoryMappingSetup(options, {
      prompter: { ...prompter({ confirms: [false] }), checkbox, input },
      filesystem: memoryFilesystem(),
      readConfig: trConfig,
      createClient: () => withTags(stubCategoryClient(vi.fn().mockResolvedValue([])), () => Promise.resolve([])),
      collectObservations: () => Promise.resolve([observation("fee"), observation("tax"), observation("deposit")]),
    });
    expect(checkbox).not.toHaveBeenCalled();
    expect(input).toHaveBeenCalledTimes(3);
    expect(input.mock.calls[0]?.[0]).toContain("comma-separated, Enter for none");
    expect(result.tagMap).toMatchObject({ fee: [], tax: [], deposit: [] });
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("offers existing Lunch Money tags plus free text, deduplicated case-insensitively", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const checkbox = vi.fn((_message: string, _choices: readonly Choice[]) =>
      Promise.resolve(["saveback", "Holiday"]),
    );
    const input = vi.fn().mockResolvedValue(" broker , holiday ,, ");
    const result = await runCategoryMappingSetup(options, {
      prompter: { ...prompter({ confirms: [false] }), checkbox, input },
      filesystem: memoryFilesystem(),
      readConfig: trConfig,
      createClient: () =>
        withTags(stubCategoryClient(vi.fn().mockResolvedValue([])), () =>
          Promise.resolve([
            { name: "Holiday" },
            { name: "SAVEBACK" },
          ]),
        ),
      collectObservations: () => Promise.resolve([observation("saveback")]),
    });
    expect(checkbox.mock.calls[0]?.[1]).toEqual([
      { name: "saveback (suggested)", value: "saveback", checked: true },
      { name: "Holiday", value: "Holiday" },
    ]);
    expect(result.tagMap.saveback).toEqual(["saveback", "Holiday", "broker"]);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("continues with free-text tags when existing tags cannot be loaded", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const print = vi.fn();
    const result = await runCategoryMappingSetup(options, {
      prompter: { ...prompter({ confirms: [false] }), print, input: vi.fn().mockResolvedValue("manual") },
      filesystem: memoryFilesystem(),
      readConfig: trConfig,
      createClient: () =>
        withTags(stubCategoryClient(vi.fn().mockResolvedValue([])), () =>
          Promise.reject(new Error("network down")),
        ),
      collectObservations: () => Promise.resolve([observation("fee")]),
    });
    expect(print.mock.calls.some(([line]) => String(line).includes("Could not load existing"))).toBe(true);
    expect(result.tagMap.fee).toEqual(["manual"]);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("saves each group as soon as it is answered so an interruption keeps earlier answers", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const filesystem = memoryFilesystem(JSON.stringify({ lunchMoneyApiKey: "k", categoryMap: { sell: 5 } }));
    const search = vi
      .fn()
      .mockResolvedValueOnce("99")
      .mockRejectedValueOnce(new Error("User force closed the prompt"));
    await expect(
      runCategoryMappingSetup(options, {
        prompter: { ...prompter({}), search, input: vi.fn().mockResolvedValue("bank") },
        filesystem,
        readConfig: trConfig,
        createClient: () =>
          stubCategoryClient(vi.fn().mockResolvedValue([category(99, "Payment, Transfer", { excluded: true })])),
        collectObservations: () => Promise.resolve([observation("deposit"), observation("fee")]),
      }),
    ).rejects.toThrow(/force closed/);
    expect(filesystem.writes).toHaveLength(1);
    const saved = JSON.parse(filesystem.writes[0]!);
    expect(saved.categoryMap).toEqual({ sell: 5, deposit: 99 });
    expect(saved.tagMap).toEqual({ deposit: ["bank"] });
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("maps nothing when the operator declines creating the suggested category", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const create = vi.fn();
    const print = vi.fn();
    const result = await runCategoryMappingSetup(options, {
      prompter: { ...prompter({ confirms: [false, false], searches: ["__new__"] }), print },
      filesystem: memoryFilesystem(),
      readConfig: trConfig,
      createClient: () => stubCategoryClient(vi.fn().mockResolvedValue([]), create),
      collectObservations: () => Promise.resolve([observation("fee")]),
    });
    expect(create).not.toHaveBeenCalled();
    expect(result.categoryMap.fee).toBeUndefined();
    expect(print.mock.calls.some(([line]) => String(line).includes("Not created"))).toBe(true);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("maps nothing when the Saveback treatment choice is cancelled", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const create = vi.fn();
    const result = await runCategoryMappingSetup(options, {
      prompter: {
        ...prompter({ confirms: [false], searches: ["__new__"] }),
        select: vi.fn().mockResolvedValue("something-else"),
      },
      filesystem: memoryFilesystem(),
      readConfig: trConfig,
      createClient: () =>
        stubCategoryClient(vi.fn().mockResolvedValue([category(12, "Saveback income", { is_income: true })]), create),
      collectObservations: () => Promise.resolve([observation("saveback")]),
    });
    expect(create).not.toHaveBeenCalled();
    expect(result.categoryMap.saveback).toBeUndefined();
    delete process.env["LUNCH_MONEY_API_KEY"];
  });

  it("creates the excluded Saveback template and labels child categories with their group", async () => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test_key";
    const create = vi.fn().mockResolvedValue({ id: 13, name: "Investments" });
    let seenChoices: readonly Choice[] = [];
    const search = vi.fn((_message: string, choices: readonly Choice[]) => {
      seenChoices = choices;
      return Promise.resolve("__new__");
    });
    const result = await runCategoryMappingSetup(options, {
      prompter: {
        ...prompter({ confirms: [true, false] }),
        search,
        select: vi.fn().mockResolvedValue("saveback-excluded"),
      },
      filesystem: memoryFilesystem(),
      readConfig: trConfig,
      createClient: () =>
        stubCategoryClient(
          vi.fn().mockResolvedValue([category(20, "Money", { is_group: true }), { ...category(21, "Brokerage"), group_id: 20 }]),
          create,
        ),
      collectObservations: () => Promise.resolve([observation("saveback")]),
    });
    expect(seenChoices[0]).toEqual({ name: "Create new category (choose Saveback treatment)", value: "__new__" });
    expect(seenChoices).toContainEqual({ name: "[21] Brokerage (under Money)", value: "21" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "Investments", exclude_from_totals: true }));
    expect(result.categoryMap.saveback).toBe(13);
    delete process.env["LUNCH_MONEY_API_KEY"];
  });
});
