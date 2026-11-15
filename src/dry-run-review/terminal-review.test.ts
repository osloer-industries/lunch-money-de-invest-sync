import { describe, expect, it, vi } from "vitest";
import type { CategoryMappingSetupClient, SetupFilesystem, SetupPrompter } from "../setup/types.js";
import type { DryRunProfileSummary, DryRunReviewSummary } from "./types.js";
import { runDryRunTerminalReview } from "./terminal-review.js";

function profile(overrides: Partial<DryRunProfileSummary> = {}): DryRunProfileSummary {
  return {
    broker: "trade-republic",
    owner: "operator-a",
    stepIndex: 1,
    stepTotal: 1,
    wouldInsert: 2,
    wouldSkip: 0,
    uncategorisedCount: 0,
    needsReviewCount: 0,
    uncategorisedShare: 0,
    dateFrom: "2024-01-01",
    dateTo: "2024-02-01",
    inTotalPlain: "€10.00 in",
    outTotalPlain: "€20.00 out",
    categoryBuckets: [
      {
        categoryLabel: "Investments",
        categoryId: 5,
        count: 2,
        rows: [
          {
            externalId: "trade-republic:evt-1",
            date: "2024-01-01",
            amountPlain: "€10.00 out",
            payee: "Broad market ETF",
            tags: [],
            categoryLabel: "Investments",
            canonicalType: "buy",
            action: "insert",
          },
        ],
      },
    ],
    rows: [],
    ...overrides,
  };
}

function summary(overrides: Partial<DryRunReviewSummary> = {}): DryRunReviewSummary {
  return {
    profiles: [profile()],
    totalWouldInsert: 2,
    totalWouldSkip: 0,
    aggregateUncategorisedShare: 0,
    allRowsAreInserts: true,
    ...overrides,
  };
}

function prompter(overrides: Partial<SetupPrompter> = {}): SetupPrompter {
  return {
    password: vi.fn(),
    input: vi.fn().mockResolvedValue(""),
    select: vi.fn().mockResolvedValue("next"),
    checkbox: vi.fn().mockResolvedValue([]),
    search: vi.fn(),
    confirm: vi.fn().mockResolvedValue(false),
    print: vi.fn(),
    waitForEnter: vi.fn(),
    ...overrides,
  };
}

function filesystem(): SetupFilesystem {
  return {
    exists: vi.fn().mockReturnValue(true),
    readText: vi.fn().mockReturnValue("{}"),
    writeText: vi.fn().mockResolvedValue(undefined),
    chmod: vi.fn().mockResolvedValue(undefined),
  };
}

function client(): CategoryMappingSetupClient {
  return {
    categories: {
      getAll: vi.fn().mockResolvedValue([{ id: 5, name: "Investments", is_group: false, group_id: null }]),
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe("runDryRunTerminalReview", () => {
  it("stops when the operator declines the final gate", async () => {
    const result = await runDryRunTerminalReview(
      summary(),
      { categoryMap: {}, tagMap: {} },
      { prompter: prompter(), client: client(), filesystem: filesystem() },
    );
    expect(result.proceed).toBe(false);
  });

  it("warns when many rows are uncategorised", async () => {
    const print = vi.fn();
    await runDryRunTerminalReview(
      summary({ aggregateUncategorisedShare: 0.25, profiles: [profile({ uncategorisedShare: 0.25 })] }),
      { categoryMap: {}, tagMap: {} },
      { prompter: prompter({ print, confirm: vi.fn().mockResolvedValue(false) }), client: client(), filesystem: filesystem() },
    );
    expect(print).toHaveBeenCalledWith(expect.stringContaining("Warning"));
  });

  it("pages forward and back inside a category bucket", async () => {
    const manyRows = Array.from({ length: 10 }, (_, index) => ({
      externalId: `trade-republic:evt-${index}`,
      date: "2024-01-01",
      amountPlain: "€10.00 out",
      payee: `ETF purchase ${index}`,
      tags: [],
      categoryLabel: "Investments",
      canonicalType: "buy" as const,
      action: "insert" as const,
    }));
    const select = vi
      .fn()
      .mockResolvedValueOnce("0")
      .mockResolvedValueOnce("next")
      .mockResolvedValueOnce("prev")
      .mockResolvedValueOnce("back")
      .mockResolvedValueOnce("next");
    const print = vi.fn();
    await runDryRunTerminalReview(
      summary({ profiles: [profile({ categoryBuckets: [{ categoryLabel: "Investments", categoryId: 5, count: 10, rows: manyRows }] })] }),
      { categoryMap: {}, tagMap: {} },
      { prompter: prompter({ select, print, confirm: vi.fn().mockResolvedValue(false) }), client: client(), filesystem: filesystem() },
    );
    expect(select).toHaveBeenCalledWith("Review rows", expect.arrayContaining([{ name: "Next page →", value: "next" }]));
    expect(print).toHaveBeenCalledWith(expect.stringContaining("Page 2 of 2"));
  });

  it("saves syncSince and returns proceed when confirmed", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const select = vi.fn().mockResolvedValueOnce("since").mockResolvedValueOnce("next");
    const input = vi.fn().mockResolvedValue("2024-06-01");
    const result = await runDryRunTerminalReview(
      summary(),
      { categoryMap: {}, tagMap: {} },
      {
        prompter: prompter({ select, input, confirm: vi.fn().mockResolvedValue(true) }),
        client: client(),
        filesystem: { ...filesystem(), writeText },
      },
    );
    expect(writeText).toHaveBeenCalled();
    expect(result.proceed).toBe(true);
    expect(result.syncSince).toBe("2024-06-01");
  });

  it("prints the first-sync warning when every row would be new", async () => {
    const print = vi.fn();
    await runDryRunTerminalReview(
      summary({ allRowsAreInserts: true }),
      { categoryMap: {}, tagMap: {} },
      { prompter: prompter({ print, confirm: vi.fn().mockResolvedValue(false) }), client: client(), filesystem: filesystem() },
    );
    expect(print).toHaveBeenCalledWith(expect.stringContaining("First-sync note"));
  });

  it("persists category mapping when the operator fixes a type", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const select = vi
      .fn()
      .mockResolvedValueOnce("fix")
      .mockResolvedValueOnce("deposit")
      .mockResolvedValueOnce("next");
    const search = vi.fn().mockResolvedValue("5");
    const confirm = vi.fn().mockResolvedValue(false);
    const result = await runDryRunTerminalReview(
      summary(),
      { categoryMap: {}, tagMap: {} },
      {
        prompter: prompter({ select, search, confirm }),
        client: client(),
        filesystem: { ...filesystem(), writeText },
      },
    );
    expect(writeText).toHaveBeenCalled();
    expect(result.maps.categoryMap.deposit).toBe(5);
  });
});