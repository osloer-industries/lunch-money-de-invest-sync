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
import { parseCategoriesCliOptions, CATEGORIES_HELP_TEXT, type CategoriesCliOptions } from "./categories-options.js";
import { executeReapplyChanges } from "./reapply-execute.js";
import { planReapplyForAccount, summarizeReapplyPlan, type ReapplyChange } from "./reapply-plan.js";

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
  for (const line of formatMappingListLines(rows, missingApi)) {
    logger(line);
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

function defaultConfirmReapply(deps: CategoriesCliDeps): (prompt: string) => Promise<boolean> {
  return (prompt: string) => {
    if (!process.stdin.isTTY) {
      return Promise.reject(
        new Error("Re-apply without --dry-run needs an interactive terminal, or use --dry-run first."),
      );
    }
    const prompter = deps.prompter ?? createInquirerPrompter();
    return prompter.confirm(prompt, false);
  };
}

async function runListCommand(deps: CategoriesCliDeps, maps: CategoryTagMaps): Promise<void> {
  const logger = deps.logger ?? defaultLogger;
  const { client } = await loadAuthedClient(deps);
  await listMappings(client, maps, logger);
}

async function runEditCommand(deps: CategoriesCliDeps, maps: CategoryTagMaps): Promise<void> {
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
  const confirm = deps.confirmReapply ?? defaultConfirmReapply(deps);
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
    await runListCommand(deps, maps);
    return;
  }
  if (cli.command === "edit") {
    await runEditCommand(deps, maps);
    return;
  }
  await runReapplyCommand(deps, cli);
}