import { beforeEach, describe, expect, it, vi } from "vitest";
import { envelopeBrokerLoginEvent } from "./cli-events.js";
import { runCategoriesCli } from "../categories/run-categories-cli.js";
import { runSyncCli } from "../sync.js";
import type { SetupFilesystem } from "../setup/types.js";
import type { SyncConfig } from "./config.js";
import {
  assertScriptableJsonContract,
  brokerLoginEventEnvelopeSchema,
  categoriesApplyJsonSchema,
  categoriesListJsonSchema,
  categoriesListLunchMoneyJsonSchema,
  SCRIPTABLE_JSON_CONTRACT_VERSION,
  scriptableCliErrorSchema,
  syncDryRunJsonSchema,
  syncLiveJsonSchema,
} from "./scriptable-json-contract.js";
import {
  parityDryRunClient,
  parityDryRunCollectors,
  paritySyncConfig,
} from "../dry-run-review/parity-fixture.js";

function parseLastStdoutJson(stdout: ReturnType<typeof vi.spyOn>, index = 0): unknown {
  const line = String(stdout.mock.calls[index]?.[0]);
  return JSON.parse(line);
}

describe("scriptable JSON contract", () => {
  beforeEach(() => {
    process.env["LUNCH_MONEY_API_KEY"] = "lm_test";
  });

  it("pins contract version for documentation", () => {
    expect(SCRIPTABLE_JSON_CONTRACT_VERSION).toBe(1);
  });

  it("validates broker login NDJSON envelopes", () => {
    const envelope = envelopeBrokerLoginEvent({
      kind: "broker_login",
      broker: "scalable-capital",
      phase: "session_active",
    });
    const envelopeParsed = assertScriptableJsonContract(
      brokerLoginEventEnvelopeSchema,
      envelope,
      "broker_login",
    );
    expect(envelopeParsed.data.phase).toBe("session_active");
  });

  it("locks sync --dry-run --json shape", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runSyncCli(["--dry-run", "--json", "--non-interactive"], {
      readConfig: () => paritySyncConfig(),
      createClient: () => parityDryRunClient() as never,
      collectors: parityDryRunCollectors(),
    });
    const parsed = assertScriptableJsonContract(
      syncDryRunJsonSchema,
      parseLastStdoutJson(stdout),
      "sync dry-run",
    );
    expect(parsed.accounts).toHaveLength(2);
    expect(parsed.dryRunReview.uncategorisedShareExceedsThreshold).toBe(true);
    stdout.mockRestore();
  });

  it("locks sync live --json shape", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runSyncCli(["--json", "--non-interactive"], {
      readConfig: () => paritySyncConfig(),
      createClient: () => parityDryRunClient() as never,
      collectors: parityDryRunCollectors(),
    });
    const live = assertScriptableJsonContract(syncLiveJsonSchema, parseLastStdoutJson(stdout), "sync live");
    expect(live.accounts).toHaveLength(2);
    expect("dryRunReview" in live).toBe(false);
    stdout.mockRestore();
  });

  it("locks categories list / apply --json shapes", async () => {
    const config: SyncConfig = {
      lunchMoneyApiKey: "k",
      sharedCardLast4: [],
      tradeRepublicProfiles: [],
      scalableCapitalProfiles: [],
      categoryMap: { deposit: 9 },
      tagMap: { deposit: ["bank"] },
    };
    const filesystem: SetupFilesystem = {
      exists: () => true,
      readText: () => JSON.stringify({ categoryMap: config.categoryMap, tagMap: config.tagMap }),
      writeText: vi.fn(),
      chmod: vi.fn(),
    };
    const client = {
      categories: {
        getAll: vi.fn().mockResolvedValue([
          { id: 9, name: "Transfer", is_income: false, exclude_from_budget: false, exclude_from_totals: false },
        ]),
      },
      tags: { getAll: vi.fn().mockResolvedValue([{ id: 2, name: "bank" }]) },
    };
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runCategoriesCli(["list", "--json"], {
      filesystem,
      readConfig: () => config,
      createClient: () => client as never,
    });
    const list = assertScriptableJsonContract(
      categoriesListJsonSchema,
      parseLastStdoutJson(stdout, 0),
      "categories list",
    );
    expect(list.rows.length).toBeGreaterThan(0);

    await runCategoriesCli(["list-lunch-money", "--json"], {
      filesystem,
      readConfig: () => config,
      createClient: () => client as never,
    });
    const catalog = assertScriptableJsonContract(
      categoriesListLunchMoneyJsonSchema,
      parseLastStdoutJson(stdout, 1),
      "categories list-lunch-money",
    );
    expect(catalog.tags).toHaveLength(1);

    await runCategoriesCli(["apply", "--non-interactive", "--map", "buy=9", "--json"], {
      filesystem,
      readConfig: () => config,
      createClient: () => client as never,
    });
    const applied = assertScriptableJsonContract(
      categoriesApplyJsonSchema,
      parseLastStdoutJson(stdout, 2),
      "categories apply",
    );
    expect(applied.changed).toBe(true);
    stdout.mockRestore();
  });

  it("locks scriptable JSON error shape", () => {
    const errorPayload = assertScriptableJsonContract(
      scriptableCliErrorSchema,
      { ok: false, error: "missing input" },
      "cli error",
    );
    expect(errorPayload.error).toContain("missing input");
  });
});