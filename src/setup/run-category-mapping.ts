import path from "node:path";
import type { CanonicalType } from "../shared/canonical-type.js";
import { canonicalTypeSchema, groupTypeObservations } from "../shared/canonical-type.js";
import { collectTypeObservations } from "../shared/collect-type-observations.js";
import { serializeTypeSummaryFromGroups } from "../shared/export-type-summary.js";
import { anonymizeTypeExample } from "../shared/anonymize.js";
import { parseStoredMaps } from "../shared/config-maps.js";
import { readConfigFromDisk, resolveConfigFilePath, type SyncConfig } from "../shared/config.js";
import { parseJsonText } from "../shared/config.js";
import type { TypeGroup } from "../shared/canonical-type.js";
import type { CategoryMappingSetupClient, SetupFilesystem, SetupPrompter } from "./types.js";
import { SUGGESTED_CATEGORIES, SUGGESTED_TAGS } from "./category-defaults.js";
import type { SetupCliOptions } from "./setup-options.js";

const CONFIG_FILENAME = "config.json";

async function listCategories(client: CategoryMappingSetupClient) {
  return client.categories.getAll();
}

async function pickCategoryId(
  prompter: SetupPrompter,
  client: CategoryMappingSetupClient,
  canonicalType: CanonicalType,
): Promise<number | undefined> {
  const categories = await listCategories(client);
  const suggestion = SUGGESTED_CATEGORIES[canonicalType];
  if (suggestion) {
    const match = categories.find(
      (category) => category.name.toLowerCase() === suggestion.name.toLowerCase(),
    );
    if (match) {
      prompter.print(`  Suggested category for ${canonicalType}: "${suggestion.name}" [id ${match.id}]`);
    } else {
      prompter.print(
        `  Suggested category for ${canonicalType}: "${suggestion.name}" (not found — pick id or create)`,
      );
    }
  }
  for (const category of categories) {
    prompter.print(`    [${category.id}] ${category.name}`);
  }
  const raw = await prompter.question(
    `Category id for type "${canonicalType}" (blank=skip, new=create): `,
  );
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.toLowerCase() === "new") {
    if (!suggestion) {
      throw new Error(`No default category template for type "${canonicalType}"`);
    }
    const confirmed = await prompter.confirm(
      `Create category "${suggestion.name}" (exclude budget=${suggestion.exclude_from_budget}, exclude totals=${suggestion.exclude_from_totals})?`,
      false,
    );
    if (!confirmed) {
      return undefined;
    }
    const created = await client.categories.create({
      name: suggestion.name,
      is_income: suggestion.is_income,
      exclude_from_budget: suggestion.exclude_from_budget,
      exclude_from_totals: suggestion.exclude_from_totals,
      is_group: false,
      group_id: null,
      archived: false,
    });
    return created.id;
  }
  const id = Number(trimmed);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Category id must be a positive integer");
  }
  if (!categories.some((category) => category.id === id)) {
    throw new Error(`Category id ${id} was not returned by the Lunch Money API`);
  }
  return id;
}

async function pickTags(prompter: SetupPrompter, canonicalType: CanonicalType): Promise<string[]> {
  const defaults = [...(SUGGESTED_TAGS[canonicalType] ?? [])];
  const raw = await prompter.question(
    `Tags for "${canonicalType}" (comma-separated) [${defaults.join(", ")}]: `,
  );
  if (raw.trim().length === 0) {
    return defaults;
  }
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

async function mergeConfigOnDisk(
  filesystem: SetupFilesystem,
  patch: Pick<SyncConfig, "categoryMap" | "tagMap">,
): Promise<string> {
  const configPath = resolveConfigFilePath(CONFIG_FILENAME);
  const existingText = filesystem.exists(configPath) ? (filesystem.readText(configPath) ?? "{}") : "{}";
  const parsed = parseJsonText(existingText);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`${CONFIG_FILENAME} must be a JSON object`);
  }
  const stored = parseStoredMaps(parsed);
  const merged = {
    ...parsed,
    categoryMap: { ...stored.categoryMap, ...patch.categoryMap },
    tagMap: { ...stored.tagMap, ...patch.tagMap },
  };
  const json = `${JSON.stringify(merged, null, 2)}\n`;
  await filesystem.writeText(configPath, json);
  return configPath;
}

export interface CategoryMappingResult {
  readonly kind: "completed";
  readonly configPath: string;
  readonly categoryMap: SyncConfig["categoryMap"];
  readonly tagMap: SyncConfig["tagMap"];
  readonly exportPath?: string;
}

function printTypeGroups(prompter: SetupPrompter, groups: readonly TypeGroup[]): Set<CanonicalType> {
  const seenTypes = new Set<CanonicalType>();
  for (const group of groups) {
    const example = anonymizeTypeExample(group.sample);
    prompter.print(
      `\n${group.source} · ${group.canonicalType} · ${group.brokerSubtype} · count=${group.count}`,
    );
    prompter.print(
      `  example: ${example.month} ${example.amountBucket} ${example.payee} ${example.notes ?? ""}`.trimEnd(),
    );
    seenTypes.add(group.canonicalType);
  }
  return seenTypes;
}

async function configureMapsForTypes(
  seenTypes: ReadonlySet<CanonicalType>,
  prompter: SetupPrompter,
  client: CategoryMappingSetupClient,
  categoryMap: SyncConfig["categoryMap"],
  tagMap: SyncConfig["tagMap"],
): Promise<void> {
  for (const canonicalType of [...seenTypes].toSorted()) {
    canonicalTypeSchema.parse(canonicalType);
    if (await prompter.confirm(`Map Lunch Money category for type "${canonicalType}"?`, true)) {
      const categoryId = await pickCategoryId(prompter, client, canonicalType);
      if (categoryId !== undefined) {
        categoryMap[canonicalType] = categoryId;
      }
    }
    if (await prompter.confirm(`Configure tags for type "${canonicalType}"?`, true)) {
      tagMap[canonicalType] = await pickTags(prompter, canonicalType);
    }
  }
}

export async function runCategoryMappingSetup(
  options: SetupCliOptions,
  deps: {
    prompter: SetupPrompter;
    filesystem: SetupFilesystem;
    readConfig?: typeof readConfigFromDisk;
    createClient?: (apiKey: string) => CategoryMappingSetupClient;
    collectObservations?: typeof collectTypeObservations;
  },
): Promise<CategoryMappingResult> {
  if (options.nonInteractive) {
    throw new Error("Category mapping requires an interactive terminal (omit --non-interactive)");
  }
  const apiKey = process.env["LUNCH_MONEY_API_KEY"]?.trim() ?? "";
  if (apiKey.length === 0) {
    throw new Error("LUNCH_MONEY_API_KEY must be set for category mapping");
  }
  const createClient = deps.createClient;
  if (!createClient) {
    throw new Error("Category mapping requires a Lunch Money client factory");
  }
  const client = createClient(apiKey);
  const config = (deps.readConfig ?? readConfigFromDisk)();
  if (config.tradeRepublicProfiles.length === 0 && config.scalableCapitalProfiles.length === 0) {
    throw new Error("config.json has no broker profiles — run full setup first");
  }

  deps.prompter.print("Fetching broker history (read-only)…");
  const observations = await (deps.collectObservations ?? collectTypeObservations)(config);
  const groups = groupTypeObservations(observations);
  if (groups.length === 0) {
    throw new Error("No classifiable broker transactions were found");
  }

  const seenTypes = printTypeGroups(deps.prompter, groups);

  const categoryMap: SyncConfig["categoryMap"] = { ...config.categoryMap };
  const tagMap: SyncConfig["tagMap"] = { ...config.tagMap };

  await configureMapsForTypes(seenTypes, deps.prompter, client, categoryMap, tagMap);

  const configPath = await mergeConfigOnDisk(deps.filesystem, { categoryMap, tagMap });

  let exportPath: string | undefined;
  if (options.exportTypeSummary) {
    const resolved = path.resolve(process.cwd(), options.exportTypeSummary);
    await deps.filesystem.writeText(resolved, serializeTypeSummaryFromGroups(groups));
    exportPath = resolved;
    deps.prompter.print(`Wrote anonymised type summary to ${resolved}`);
  }

  if (await deps.prompter.confirm("Run a dry-run sync now?", true)) {
    const { runSyncCli } = await import("../sync.js");
    await runSyncCli(["--dry-run"], { logger: deps.prompter.print.bind(deps.prompter) });
  }

  return {
    kind: "completed",
    configPath,
    categoryMap,
    tagMap,
    ...(exportPath ? { exportPath } : {}),
  };
}
