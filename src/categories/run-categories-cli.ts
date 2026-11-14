import type { LunchMoneyClient } from "@lunch-money/lunch-money-js-v2";
import { createLunchMoneyClient, resolveTagIds } from "../lunch-money/client.js";
import { applyCategoryTagMappings } from "../shared/apply-mappings.js";
import type { SyncConfig, TradeRepublicProfile, ScalableCapitalProfile } from "../shared/config.js";
import { readConfigFromDiskForCli } from "../shared/config.js";
import { ensureLunchMoneyApiKeyForCli } from "../shared/bootstrap-lunch-money-api-key.js";
import { createDefaultLunchMoneyApiKeyStore } from "../shared/lunch-money-api-key-store.js";
import type { LunchMoneyApiKeyStore } from "../shared/lunch-money-api-key-store.js";
import { tagSharedExpenses } from "../shared/tagging.js";
import { forEachProfileSequentially } from "../shared/sequential-profiles.js";
import type { CanonicalTransaction } from "../shared/transaction.js";
import type { BrokerCollectors } from "../sync.js";
import { createLiveCollectors } from "../sync.js";
import { createInquirerPrompter } from "../setup/inquirer-prompter.js";
import type { CategoryMappingSetupClient, SetupFilesystem, SetupPrompter } from "../setup/types.js";
import { loadBrokerTransactionsByExternalId } from "./lm-transactions.js";
import { buildMappingRows, formatMappingListLines } from "./mapping-view.js";
import { runMappingEditSession } from "./mapping-edit-session.js";
import { readMapsFromFilesystem, writeMapsToFilesystem } from "./mapping-store.js";
import type { CategoryTagMaps } from "./mapping-mutations.js";
import {
  parseCategoriesCliOptions,
  CATEGORIES_HELP_TEXT,
  parsedCategoryAssignments,
  parsedTagAssignments,
  type CategoriesCliOptions,
} from "./categories-options.js";
import { executeReapplyChanges } from "./reapply-execute.js";
import { planReapplyForAccount, summarizeReapplyPlan, type ReapplyChange } from "./reapply-plan.js";
import { readFile } from "node:fs/promises";
import { assertInteractiveTerminal, parseMappingFileJson, writeStdoutJson } from "../shared/scriptable-cli.js";
import { applyMappingMutations, mapsAreEqual } from "./apply-mapping.js";

export type CategoriesLogger = (line: string) => void;

type Profile = TradeRepublicProfile | ScalableCapitalProfile;

export interface CategoriesCliDeps {
  readonly readConfig?: typeof readConfigFromDiskForCli;
  readonly createClient?: typeof createLunchMoneyClient;
  readonly collectors?: BrokerCollectors;
  readonly logger?: CategoriesLogger;
  readonly apiKeyStore?: LunchMoneyApiKeyStore;
  readonly filesystem: SetupFilesystem;
  readonly prompter?: SetupPrompter;
  readonly confirmReapply?: (prompt: string) => Promise<boolean>;
}

function defaultLogger(line: string): void {
  console.log(line);
}

function categoryNameMap(categories: ReadonlyArray<{ id: number; name: string }>): Map<number, string> {
  return new Map(categories.map((category) => [category.id, category.name]));
}

function tagNameMaps(tags: ReadonlyArray<{ id: number; name: string }>): {
  byName: Map<string, number>;
  byId: Map<number, string>;
} {
  const byName = new Map(tags.map((tag) => [tag.name, tag.id]));
  const byId = new Map(tags.map((tag) => [tag.id, tag.name]));
  return { byName, byId };
}

async function listMappings(
  client: CategoryMappingSetupClient,
  maps: CategoryTagMaps,
  logger: CategoriesLogger,
  json: boolean,
): Promise<void> {
  let categoryNameById = new Map<number, string>();
  let missingApi = false;
  try {
    const categories = await client.categories.getAll();
    categoryNameById = categoryNameMap(categories);
  } catch {
    missingApi = true;
  }
  const rows = buildMappingRows(maps, categoryNameById);
  if (json) {
    writeStdoutJson({
      categoryMap: maps.categoryMap,
      tagMap: maps.tagMap,
      rows: rows.map((row) => ({
        canonicalType: row.canonicalType,
        categoryId: row.categoryId ?? null,
        categoryName: row.categoryName ?? null,
        tags: row.tags,
      })),
      missingApi,
    });
    return;
  }
  for (const line of formatMappingListLines(rows, missingApi)) {
    logger(line);
  }
}

async function listLunchMoneyCatalog(
  client: LunchMoneyClient,
  json: boolean,
  logger: CategoriesLogger,
): Promise<void> {
  const [categories, tags] = await Promise.all([client.categories.getAll(), client.tags.getAll()]);
  const payload = {
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      is_income: category.is_income,
      exclude_from_budget: category.exclude_from_budget,
      exclude_from_totals: category.exclude_from_totals,
    })),
    tags: tags.map((tag) => ({ id: tag.id, name: tag.name })),
  };
  if (json) {
    writeStdoutJson(payload);
    return;
  }
  logger("Lunch Money categories:");
  for (const category of payload.categories) {
    logger(`  ${category.id}: ${category.name}`);
  }
  logger("");
  logger("Lunch Money tags:");
  for (const tag of payload.tags) {
    logger(`  ${tag.id}: ${tag.name}`);
  }
}

async function editMappings(
  client: CategoryMappingSetupClient,
  filesystem: SetupFilesystem,
  prompter: SetupPrompter,
  initialMaps: CategoryTagMaps,
  logger: CategoriesLogger,
): Promise<void> {
  const result = await runMappingEditSession(prompter, client, initialMaps, {
    onPersist: async (maps) => {
      await writeMapsToFilesystem(filesystem, maps);
    },
  });
  if (!result.saved) {
    logger("No changes were saved.");
  }
}

async function mappedTransactionsForProfile(
  config: SyncConfig,
  collect: (profile: Profile) => Promise<CanonicalTransaction[]>,
  profile: Profile,
): Promise<CanonicalTransaction[]> {
  const raw = await collect(profile);
  return tagSharedExpenses(
    applyCategoryTagMappings(raw, config.categoryMap, config.tagMap),
    config.sharedCardLast4,
  );
}

interface PlannedReapplyRow extends ReapplyChange {
  readonly owner: string;
  readonly source: string;
}

interface ReapplyContext {
  readonly config: SyncConfig;
  readonly client: LunchMoneyClient;
  readonly collectors: BrokerCollectors;
  readonly dryRun: boolean;
  readonly logger: CategoriesLogger;
  readonly confirm: (prompt: string) => Promise<boolean>;
}

async function reapplyMappings(context: ReapplyContext): Promise<void> {
  const { config, client, collectors, dryRun, logger, confirm } = context;
  const tags = await client.tags.getAll();
  const { byName, byId } = tagNameMaps(tags);
  const jobs = [
    {
      source: "trade-republic" as const,
      profiles: config.tradeRepublicProfiles,
      collect: collectors.collectTradeRepublic,
    },
    {
      source: "scalable-capital" as const,
      profiles: config.scalableCapitalProfiles,
      collect: collectors.collectScalableCapital,
    },
  ];

  const plans: ReturnType<typeof planReapplyForAccount>[] = [];
  const allChanges: PlannedReapplyRow[] = [];

  await forEachProfileSequentially(jobs, async (job) => {
    await forEachProfileSequentially(job.profiles, async (profile) => {
      const mapped = await mappedTransactionsForProfile(config, job.collect, profile);
      const tagNames = [...new Set(mapped.flatMap((tx) => tx.tags ?? []))];
      const resolved = await resolveTagIds(client, tagNames);
      for (const [name, id] of resolved) {
        byName.set(name, id);
        byId.set(id, name);
      }
      const lunchMoney = await loadBrokerTransactionsByExternalId(client, profile.lunchMoneyAssetId);
      const plan = planReapplyForAccount(mapped, lunchMoney, config.tagMap, byName, byId);
      plans.push(plan);
      for (const change of plan.changes) {
        allChanges.push({ ...change, owner: profile.owner, source: job.source });
      }
      logger(
        `[${job.source}:${profile.owner}] plan: ${plan.changes.length} to update, ${plan.unchanged} already match, ${plan.skippedMissingInLunchMoney} not in Lunch Money yet`,
      );
    });
  });

  const summary = summarizeReapplyPlan(plans);
  if (dryRun) {
    for (const item of allChanges) {
      logger(
        `  would update ${item.externalId} category ${item.previousCategoryId ?? "none"} → ${item.categoryId ?? "none"}`,
      );
    }
    logger(
      `Dry-run: would update ${summary.wouldUpdate}, leave ${summary.unchanged} unchanged, skip ${summary.skippedMissingInLunchMoney} not synced yet.`,
    );
    return;
  }

  if (allChanges.length === 0) {
    logger("Nothing to update — every synced transaction already matches the mapping.");
    return;
  }

  if (!(await confirm("Apply these category and tag changes in Lunch Money?"))) {
    logger("Re-apply cancelled.");
    return;
  }

  const executed = await executeReapplyChanges(client, allChanges);
  logger(`Updated ${executed.updatedCount} transaction(s) in Lunch Money.`);
}

async function loadAuthedClient(
  deps: CategoriesCliDeps,
): Promise<{ config: SyncConfig; client: LunchMoneyClient }> {
  await ensureLunchMoneyApiKeyForCli(deps.apiKeyStore ?? createDefaultLunchMoneyApiKeyStore());
  const config = (deps.readConfig ?? readConfigFromDiskForCli)();
  const client = (deps.createClient ?? createLunchMoneyClient)(config.lunchMoneyApiKey);
  return { config, client };
}

function defaultConfirmReapply(
  deps: CategoriesCliDeps,
  cli: CategoriesCliOptions,
): (prompt: string) => Promise<boolean> {
  return (prompt: string) => {
    if (cli.yes || cli.nonInteractive) {
      if (!cli.yes) {
        return Promise.reject(
          new Error("Re-apply without --dry-run requires --yes in --non-interactive mode."),
        );
      }
      return Promise.resolve(true);
    }
    if (!process.stdin.isTTY) {
      return Promise.reject(
        new Error("Re-apply without --dry-run needs an interactive terminal, or use --dry-run with --json."),
      );
    }
    const prompter = deps.prompter ?? createInquirerPrompter();
    return prompter.confirm(prompt, false);
  };
}

async function runListCommand(deps: CategoriesCliDeps, maps: CategoryTagMaps, cli: CategoriesCliOptions): Promise<void> {
  const logger = deps.logger ?? defaultLogger;
  const { client } = await loadAuthedClient(deps);
  await listMappings(client, maps, logger, cli.json);
}

async function runApplyCommand(deps: CategoriesCliDeps, cli: CategoriesCliOptions, maps: CategoryTagMaps): Promise<void> {
  assertInteractiveTerminal("categories apply", cli.nonInteractive || cli.json);
  if (!cli.applyFromPath && cli.categoryMapAssignments.length === 0 && cli.tagMapAssignments.length === 0) {
    throw new Error("apply requires --from <mapping.json> and/or --map / --tag assignments");
  }
  let fromFile: { categoryMap?: Record<string, number>; tagMap?: Record<string, string[]> } | undefined;
  if (cli.applyFromPath) {
    const raw = await readFile(cli.applyFromPath, "utf8");
    const parsed = parseMappingFileJson(raw, cli.applyFromPath);
    fromFile = {
      ...(parsed.categoryMap ? { categoryMap: parsed.categoryMap } : {}),
      ...(parsed.tagMap ? { tagMap: parsed.tagMap } : {}),
    };
  }
  const nextMaps = applyMappingMutations(maps, {
    ...(fromFile ? { fromFile } : {}),
    categoryAssignments: parsedCategoryAssignments(cli.categoryMapAssignments),
    tagAssignments: parsedTagAssignments(cli.tagMapAssignments),
  });
  const unchanged = mapsAreEqual(maps, nextMaps);
  if (!unchanged) {
    await writeMapsToFilesystem(deps.filesystem, nextMaps);
  }
  const logger = deps.logger ?? defaultLogger;
  if (cli.json) {
    writeStdoutJson({
      command: "apply",
      changed: !unchanged,
      categoryMap: nextMaps.categoryMap,
      tagMap: nextMaps.tagMap,
    });
    return;
  }
  logger(unchanged ? "Mapping already up to date — no changes written." : "Saved category/tag mapping to config.json.");
}

async function runEditCommand(deps: CategoriesCliDeps, maps: CategoryTagMaps, cli: CategoriesCliOptions): Promise<void> {
  assertInteractiveTerminal("categories edit", cli.nonInteractive);
  if (!process.stdin.isTTY && !deps.prompter) {
    throw new Error("Edit requires an interactive terminal.");
  }
  const logger = deps.logger ?? defaultLogger;
  const { client } = await loadAuthedClient(deps);
  const prompter = deps.prompter ?? createInquirerPrompter();
  await editMappings(client, deps.filesystem, prompter, maps, logger);
}

async function runReapplyCommand(deps: CategoriesCliDeps, cli: CategoriesCliOptions): Promise<void> {
  const logger = deps.logger ?? defaultLogger;
  const { config, client } = await loadAuthedClient(deps);
  const confirm = deps.confirmReapply ?? defaultConfirmReapply(deps, cli);
  await reapplyMappings({
    config,
    client,
    collectors: deps.collectors ?? createLiveCollectors(),
    dryRun: cli.dryRun,
    logger,
    confirm,
  });
}

export async function runCategoriesCli(argv: readonly string[], deps: CategoriesCliDeps): Promise<void> {
  const cli = parseCategoriesCliOptions(argv);
  if (cli.help || cli.command === null) {
    (deps.logger ?? defaultLogger)(CATEGORIES_HELP_TEXT);
    return;
  }
  const maps = readMapsFromFilesystem(deps.filesystem);
  if (cli.command === "list") {
    await runListCommand(deps, maps, cli);
    return;
  }
  if (cli.command === "list-lunch-money") {
    const logger = deps.logger ?? defaultLogger;
    const { client } = await loadAuthedClient(deps);
    await listLunchMoneyCatalog(client, cli.json, logger);
    return;
  }
  if (cli.command === "apply") {
    await runApplyCommand(deps, cli, maps);
    return;
  }
  if (cli.command === "edit") {
    await runEditCommand(deps, maps, cli);
    return;
  }
  await runReapplyCommand(deps, cli);
}