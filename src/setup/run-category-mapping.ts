import {
  canonicalTypeSchema,
  groupTypeObservations,
  type CanonicalType,
  type TypeGroup,
} from "../shared/canonical-type.js";
import { collectTypeObservations } from "../shared/collect-type-observations.js";
import { forEachSequentially } from "../shared/sequential-profiles.js";
import { writeAnonymisedTypeSummaryToPath } from "../shared/export-type-summary.js";
import { anonymizeTypeExample } from "../shared/anonymize.js";
import { readConfigFromDisk, readConfigFromDiskForCli, resolveConfigFilePath, type SyncConfig } from "../shared/config.js";
import { loadDotenvFromCwd } from "../shared/load-dotenv.js";
import { MISSING_LUNCH_MONEY_API_KEY_MESSAGE } from "../shared/config-cli-errors.js";
import { readConfigJsonObject, storedMapsFromConfigObject, writeConfigJsonObject } from "./config-json.js";
import { parsePromptPositiveInt } from "./parse-prompt-id.js";
import type { CategoryMappingSetupClient, SetupFilesystem, SetupPrompter } from "./types.js";
import {
  SAVEBACK_CREATE_TEMPLATES,
  type SuggestedCategory,
  SUGGESTED_CATEGORIES,
  SUGGESTED_TAGS,
} from "./category-defaults.js";
import {
  categoryFlagsMatchTemplate,
  findSuggestedCategoryMatch,
  type SetupCategoryRow,
} from "./category-matching.js";
import type { SetupCliOptions } from "./setup-options.js";
import { printSuggestedLunchMoneyRules } from "./print-suggested-rules.js";

const CONFIG_FILENAME = "config.json";
const SKIP_CATEGORY = "__skip__";
const NEW_CATEGORY = "__new__";
const SAVEBACK_INCOME_CHOICE = "saveback-income";
const SAVEBACK_EXCLUDED_CHOICE = "saveback-excluded";

function formatCreateCategoryConfirm(suggestion: SuggestedCategory): string {
  return `Create category "${suggestion.name}" (is_income=${suggestion.is_income}, exclude budget=${suggestion.exclude_from_budget}, exclude totals=${suggestion.exclude_from_totals})?`;
}

function allowsCreateCategory(canonicalType: CanonicalType, suggestion: SuggestedCategory | undefined): boolean {
  if (canonicalType === "saveback") {
    return true;
  }
  return suggestion !== undefined;
}

async function pickSavebackCreateTemplate(prompter: SetupPrompter): Promise<SuggestedCategory | undefined> {
  const choice = await prompter.select("Saveback category treatment", [
    {
      name: "Saveback income — is_income=true, not excluded from budget/totals",
      value: SAVEBACK_INCOME_CHOICE,
    },
    {
      name: "Excluded savings/investment — same flags as Investments (excluded from budget and totals)",
      value: SAVEBACK_EXCLUDED_CHOICE,
    },
  ]);
  if (choice === SAVEBACK_INCOME_CHOICE) {
    return SAVEBACK_CREATE_TEMPLATES[0];
  }
  if (choice === SAVEBACK_EXCLUDED_CHOICE) {
    return SAVEBACK_CREATE_TEMPLATES[1];
  }
  return undefined;
}

async function createCategoryFromTemplate(
  prompter: SetupPrompter,
  client: CategoryMappingSetupClient,
  suggestion: SuggestedCategory,
): Promise<number | undefined> {
  const confirmed = await prompter.confirm(formatCreateCategoryConfirm(suggestion), false);
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

function formatCategoryPickerLabel(
  category: SetupCategoryRow,
  categories: readonly SetupCategoryRow[],
): string {
  let label = `[${category.id}] ${category.name}`;
  if (category.group_id != null) {
    const parent = categories.find((row) => row.id === category.group_id);
    if (parent) {
      label += ` (under ${parent.name})`;
    }
  }
  return label;
}

async function confirmExistingCategoryFlags(
  prompter: SetupPrompter,
  category: SetupCategoryRow,
  template: SuggestedCategory,
): Promise<boolean> {
  if (categoryFlagsMatchTemplate(category, template)) {
    return true;
  }
  prompter.print(
    `  Warning: "${category.name}" has is_income=${category.is_income}, exclude budget=${category.exclude_from_budget}, exclude totals=${category.exclude_from_totals}; template expects is_income=${template.is_income}, exclude budget=${template.exclude_from_budget}, exclude totals=${template.exclude_from_totals}.`,
  );
  return prompter.confirm("Use this category anyway?", false);
}

function printStandardSuggestion(
  prompter: SetupPrompter,
  canonicalType: CanonicalType,
  suggestion: SuggestedCategory,
  categoryRows: readonly SetupCategoryRow[],
): void {
  const { category: match, warnedMissingExclusion } = findSuggestedCategoryMatch(
    categoryRows,
    suggestion,
    canonicalType,
  );
  if (match) {
    prompter.print(
      `  Suggested category for ${canonicalType}: "${suggestion.name}" → existing "${match.name}" [id ${match.id}]`,
    );
    if (warnedMissingExclusion) {
      prompter.print(
        "  Warning: this category does not have both Exclude from budget and Exclude from totals enabled.",
      );
    }
    return;
  }
  prompter.print(
    `  Suggested category for ${canonicalType}: "${suggestion.name}" (not found — pick id or create)`,
  );
}

function printTypeMappingGuidance(
  prompter: SetupPrompter,
  canonicalType: CanonicalType,
  suggestion: SuggestedCategory | undefined,
  categoryRows: readonly SetupCategoryRow[],
): void {
  if (canonicalType === "saveback") {
    printSavebackGuidance(prompter, categoryRows);
    return;
  }
  if (suggestion) {
    printStandardSuggestion(prompter, canonicalType, suggestion, categoryRows);
    return;
  }
  if (canonicalType === "unknown") {
    prompter.print(
      "  Unknown spend: leave uncategorised or pick an existing category — create-new is not offered for unknown types.",
    );
  }
}

async function validateExistingCategoryPick(
  prompter: SetupPrompter,
  categoryId: number,
  picked: SetupCategoryRow | undefined,
  suggestion: SuggestedCategory | undefined,
  canonicalType: CanonicalType,
): Promise<number | undefined> {
  if (!picked) {
    return categoryId;
  }
  if (picked.is_group) {
    throw new Error(`Category id ${categoryId} is a category group — pick a child category, not the group`);
  }
  if (suggestion && canonicalType !== "saveback") {
    const ok = await confirmExistingCategoryFlags(prompter, picked, suggestion);
    if (!ok) {
      return undefined;
    }
  }
  return categoryId;
}

function printSavebackGuidance(
  prompter: SetupPrompter,
  categories: readonly SetupCategoryRow[],
): void {
  prompter.print(
    "  Saveback: map to income (Saveback income) or excluded savings/investment. The saveback tag stays on every row.",
  );
  for (const template of SAVEBACK_CREATE_TEMPLATES) {
    const match = categories.find(
      (category) => !category.is_group && category.name.toLowerCase() === template.name.toLowerCase(),
    );
    if (match) {
      prompter.print(`  Existing "${template.name}" [id ${match.id}]`);
    }
  }
}

async function pickCategoryId(
  prompter: SetupPrompter,
  client: CategoryMappingSetupClient,
  canonicalType: CanonicalType,
): Promise<number | undefined> {
  const categories = await client.categories.getAll();
  const suggestion = SUGGESTED_CATEGORIES[canonicalType];
  const categoryRows = categories as readonly SetupCategoryRow[];
  printTypeMappingGuidance(prompter, canonicalType, suggestion, categoryRows);
  const pickerChoices = [
    { name: "Skip (no mapping)", value: SKIP_CATEGORY },
    ...(allowsCreateCategory(canonicalType, suggestion)
      ? [{ name: "Create new category", value: NEW_CATEGORY }]
      : []),
    ...categoryRows
      .filter((category) => !category.is_group)
      .map((category) => ({
        name: formatCategoryPickerLabel(category, categoryRows),
        value: String(category.id),
      })),
  ];
  const choice = await prompter.search(`Category for type "${canonicalType}"`, pickerChoices);
  if (choice === SKIP_CATEGORY) {
    return undefined;
  }
  if (choice === NEW_CATEGORY) {
    const template =
      canonicalType === "saveback"
        ? await pickSavebackCreateTemplate(prompter)
        : suggestion;
    if (!template) {
      return undefined;
    }
    return createCategoryFromTemplate(prompter, client, template);
  }
  const categoryId = parsePromptPositiveInt(choice, {
    entityLabel: "Category id",
    exists: (id) => categories.some((category) => category.id === id),
  });
  const picked = categoryRows.find((category) => category.id === categoryId);
  return validateExistingCategoryPick(prompter, categoryId, picked, suggestion, canonicalType);
}

async function pickTags(prompter: SetupPrompter, canonicalType: CanonicalType): Promise<string[]> {
  const defaults = [...(SUGGESTED_TAGS[canonicalType] ?? [])];
  const tagChoices = [...new Set(defaults)];
  const selected = await prompter.checkbox(
    `Tags for "${canonicalType}"`,
    tagChoices.map((tag) => ({ name: tag, value: tag })),
  );
  if (selected.length === 0) {
    return defaults;
  }
  return selected;
}

async function mergeConfigOnDisk(
  filesystem: SetupFilesystem,
  patch: Pick<SyncConfig, "categoryMap" | "tagMap">,
): Promise<string> {
  const configPath = resolveConfigFilePath(CONFIG_FILENAME);
  const parsed = readConfigJsonObject(filesystem, configPath);
  const stored = storedMapsFromConfigObject(parsed);
  await writeConfigJsonObject(filesystem, configPath, {
    ...parsed,
    categoryMap: { ...stored.categoryMap, ...patch.categoryMap },
    tagMap: { ...stored.tagMap, ...patch.tagMap },
  });
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
  const types = [...seenTypes].toSorted((left, right) => left.localeCompare(right));
  await forEachSequentially(types, async (canonicalType) => {
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
  });
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
  loadDotenvFromCwd();
  const apiKey = process.env["LUNCH_MONEY_API_KEY"]?.trim() ?? "";
  if (apiKey.length === 0) {
    throw new Error(MISSING_LUNCH_MONEY_API_KEY_MESSAGE);
  }
  const createClient = deps.createClient;
  if (!createClient) {
    throw new Error("Category mapping requires a Lunch Money client factory");
  }
  const client = createClient(apiKey);
  const config = (deps.readConfig ?? readConfigFromDiskForCli)();
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
  printSuggestedLunchMoneyRules(deps.prompter, config, categoryMap);

  let exportPath: string | undefined;
  if (options.exportTypeSummary) {
    const resolved = await writeAnonymisedTypeSummaryToPath(options.exportTypeSummary, groups, {
      write: (absolutePath, body) => deps.filesystem.writeText(absolutePath, body),
    });
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
