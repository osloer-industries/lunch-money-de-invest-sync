import { describe, expect, it, vi, type MockInstance } from "vitest";
import type { CategoryMappingSetupClient, SetupFilesystem, SetupPrompter } from "../setup/types.js";
import { runDryRunCollection } from "./collect.js";
import {
  dryRunAggregateUncategorisedShareExceedsThreshold,
  runDryRunTerminalReview,
} from "./terminal-review.js";
import { brokerBalanceLines } from "./balance-lines.js";
import type { DryRunReviewSummary } from "./types.js";
import {
  parityDryRunClient,
  parityDryRunCollectors,
  parityScalableCapitalBalances,
  paritySyncConfig,
  parityTradeRepublicBalances,
} from "./parity-fixture.js";
import { runSync, type BrokerCollectors, type LunchMoneySyncClient } from "../sync.js";
import type { SyncRunJsonResult } from "../sync-result.js";

function stubPrompter(overrides: Partial<SetupPrompter> = {}): SetupPrompter {
  return {
    password: vi.fn(),
    input: vi.fn(),
    select: vi.fn().mockResolvedValue("next"),
    checkbox: vi.fn(),
    search: vi.fn(),
    confirm: vi.fn().mockResolvedValue(false),
    print: vi.fn(),
    waitForEnter: vi.fn(),
    ...overrides,
  };
}

function terminalReviewDeps(prompter: SetupPrompter): {
  prompter: SetupPrompter;
  client: CategoryMappingSetupClient;
  filesystem: SetupFilesystem;
} {
  return {
    prompter,
    client: {
      categories: {
        getAll: vi.fn().mockResolvedValue([{ id: 11, name: "Transfer", is_group: false, group_id: null }]),
        create: vi.fn(),
        get: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
    filesystem: {
      exists: vi.fn().mockReturnValue(true),
      readText: vi.fn().mockReturnValue("{}"),
      writeText: vi.fn().mockResolvedValue(undefined),
      chmod: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function profileKey(broker: string, owner: string): string {
  return `${broker}:${owner}`;
}

function assertTerminalMatchesReview(
  print: MockInstance<(line: string) => void>,
  review: DryRunReviewSummary,
  thresholdExceeded: boolean,
): void {
  const printedWarning = print.mock.calls.some((call) => (call[0] ?? "").includes("Warning"));
  expect(printedWarning).toBe(thresholdExceeded);

  for (const profile of review.profiles) {
    expect(print).toHaveBeenCalledWith(
      expect.stringContaining(
        `Would insert ${profile.wouldInsert}, skip ${profile.wouldSkip} duplicate(s). ` +
          `${profile.uncategorisedCount} uncategorised`,
      ),
    );
    for (const line of profile.balanceLines ?? []) {
      expect(print).toHaveBeenCalledWith(`  ${line}`);
    }
  }
}

function assertJsonMatchesReview(jsonResult: SyncRunJsonResult, review: DryRunReviewSummary, thresholdExceeded: boolean): void {
  expect(jsonResult.dryRunReview?.aggregateUncategorisedShare).toBe(review.aggregateUncategorisedShare);
  expect(jsonResult.dryRunReview?.uncategorisedShareExceedsThreshold).toBe(thresholdExceeded);

  const byKey = new Map(
    jsonResult.accounts.map((account) => [profileKey(account.source, account.owner), account.dryRunSummary]),
  );
  for (const profile of review.profiles) {
    const jsonProfile = byKey.get(profileKey(profile.broker, profile.owner));
    expect(jsonProfile).toBeDefined();
    expect(jsonProfile?.wouldInsert).toBe(profile.wouldInsert);
    expect(jsonProfile?.wouldSkip).toBe(profile.wouldSkip);
    expect(jsonProfile?.uncategorisedCount).toBe(profile.uncategorisedCount);
    expect(jsonProfile?.uncategorisedShare).toBe(profile.uncategorisedShare);
    expect(jsonProfile?.rows).toHaveLength(profile.rows.length);
    expect(jsonProfile?.balanceLines).toEqual(profile.balanceLines);
  }
}

describe("dry-run terminal and JSON parity", () => {
  it("reports the same metrics from runDryRunCollection, terminal review, and sync --dry-run --json", async () => {
    const config = paritySyncConfig();
    const client = parityDryRunClient() as LunchMoneySyncClient;
    const collectors = parityDryRunCollectors();
    const selection = {
      includeBrokers: new Set(["trade-republic", "scalable-capital"] as const),
      owners: [] as string[],
    };

    const review = await runDryRunCollection(config, client, collectors, selection);
    expect(review.profiles).toHaveLength(2);
    expect(review.aggregateUncategorisedShare).toBeGreaterThan(0.1);

    const expectedBalances = new Map([
      [profileKey("trade-republic", "operator-tr"), brokerBalanceLines(parityTradeRepublicBalances)],
      [profileKey("scalable-capital", "operator-sc"), brokerBalanceLines(parityScalableCapitalBalances)],
    ]);
    for (const profile of review.profiles) {
      expect(profile.balanceLines).toEqual(expectedBalances.get(profileKey(profile.broker, profile.owner)));
    }

    const print = vi.fn();
    await runDryRunTerminalReview(
      review,
      { categoryMap: config.categoryMap, tagMap: config.tagMap },
      terminalReviewDeps(stubPrompter({ print })),
    );

    const thresholdExceeded = dryRunAggregateUncategorisedShareExceedsThreshold(review);
    assertTerminalMatchesReview(print, review, thresholdExceeded);

    const jsonResult = await runSync(config, client, collectors as BrokerCollectors, () => {}, {
      includeBrokers: selection.includeBrokers,
      owners: selection.owners,
      dryRun: true,
      json: true,
      reconcileCash: false,
    });
    if (!("dryRunReview" in jsonResult)) {
      throw new Error("expected JSON dry-run payload");
    }
    assertJsonMatchesReview(jsonResult, review, thresholdExceeded);
  });
});