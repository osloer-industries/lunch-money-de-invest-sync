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
import { ensureLunchMoneyApiKeyForCli } from "../shared/bootstrap-lunch-money-api-key.js";
import type { LunchMoneyApiKeyStore } from "../shared/lunch-money-api-key-store.js";
import { createDefaultLunchMoneyApiKeyStore } from "../shared/lunch-money-api-key-store.js";
import { readConfigJsonObject, storedMapsFromConfigObject, writeConfigJsonObject } from "./config-json.js";
import { parsePromptPositiveInt } from "./parse-prompt-id.js";
import type { CategoryMappingSetupClient, PromptChoice, SetupFilesystem, SetupPrompter } from "./types.js";
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

/**
 * Types that are always asked on their own even when another type shares their suggested category:
 * Saveback needs an explicit treatment choice, and unknown rows (card spend, unclassified events)
 * must be skippable without also skipping deposits/withdrawals/transfers.
 */
const STANDALONE_TYPES = new Set<CanonicalType>(["saveback", "unknown"]);

/** Seen canonical types that share one suggested Lunch Money category and are asked about once. */
export interface CategoryPromptGroup {
  readonly types: readonly CanonicalType[];
  readonly suggestion: SuggestedCategory | undefined;
  /** Suggested tag → the types in this group that suggested it (tags stay scoped to those types). */
  readonly suggestedTags: ReadonlyMap<string, readonly CanonicalType[]>;
}

function promptGroupKey(canonicalType: CanonicalType, suggestion: SuggestedCategory | undefined): string {
  if (!suggestion || STANDALONE_TYPES.has(canonicalType)) {
    return `type:${canonicalType}`;
  }
  return `category:${suggestion.name.trim().toLowerCase()}`;
}

/**
 * Group seen types by their suggested category name (case-insensitive), e.g. buy / sell /
 * savings-plan → "Investments", dividend / interest → "Income". Types without a suggestion, and
 * {@link STANDALONE_TYPES}, stay on their own.
 */
export function groupTypesForCategoryPrompts(seenTypes: Iterable<CanonicalType>): CategoryPromptGroup[] {
  const types = [...new Set(seenTypes)].toSorted((left, right) => left.localeCompare(right));
  const groups = new Map<
    string,
    { types: CanonicalType[]; suggestion: SuggestedCategory | undefined; tags: Map<string, CanonicalType[]> }
  >();
  for (const canonicalType of types) {
    canonicalTypeSchema.parse(canonicalType);
    const suggestion = SUGGESTED_CATEGORIES[canonicalType];
    const key = promptGroupKey(canonicalType, suggestion);
    const group = groups.get(key) ?? { types: [], suggestion, tags: new Map<string, CanonicalType[]>() };
    group.types.push(canonicalType);
    for (const tag of SUGGESTED_TAGS[canonicalType] ?? []) {
      group.tags.set(tag, [...(group.tags.get(tag) ?? []), canonicalType]);
    }
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    types: group.types,
    suggestion: group.suggestion,
    suggestedTags: group.tags,
  }));
}

/** `type "deposit"` or `types "buy", "savings-plan", "sell"`. */
export function formatGroupLabel(types: readonly CanonicalType[]): string {
  const quoted = types.map((type) => `"${type}"`).join(", ");
  return types.length === 1 ? `type ${quoted}` : `types ${quoted}`;
}

function groupHas(group: CategoryPromptGroup, canonicalType: CanonicalType): boolean {
  return group.types.includes(canonicalType);
}

function allowsCreateCategory(group: CategoryPromptGroup): boolean {
  if (groupHas(group, "saveback")) {
    return true;
  }
  // 0.2.0 rule kept: unknown rows can be mapped to an existing category, never a new one.
  if (groupHas(group, "unknown")) {
    return false;
  }
  return group.suggestion !== undefined;
}

/** Unknown shares the transfer suggestion, so match it the way transfer types are matched. */
function matchingTypeFor(group: CategoryPromptGroup): CanonicalType {
  return groupHas(group, "unknown") ? "transfer" : (group.types[0] ?? "unknown");
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
    prompter.print("  Not created — no category mapped.");
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

function confirmExistingCategoryFlags(
  prompter: SetupPrompter,
  category: SetupCategoryRow,
  template: SuggestedCategory,
): Promise<boolean> {
  if (categoryFlagsMatchTemplate(category, template)) {
    return Promise.resolve(true);
  }
  prompter.print(
    `  Warning: "${category.name}" has is_income=${category.is_income}, exclude budget=${category.exclude_from_budget}, exclude totals=${category.exclude_from_totals}; template expects is_income=${template.is_income}, exclude budget=${template.exclude_from_budget}, exclude totals=${template.exclude_from_totals}.`,
  );
  return prompter.confirm("Use this category anyway?", false);
}

/** Print the suggestion for a group and return the matching existing category, if any. */
function findGroupMatch(
  prompter: SetupPrompter,
  group: CategoryPromptGroup,
  categoryRows: readonly SetupCategoryRow[],
): SetupCategoryRow | undefined {
  const { suggestion } = group;
  if (!suggestion) {
    return undefined;
  }
  const label = formatGroupLabel(group.types);
  const { category: match, warnedMissingExclusion } = findSuggestedCategoryMatch(
    categoryRows,
    suggestion,
    matchingTypeFor(group),
  );
  if (match) {
    prompter.print(
      `  Suggested category for ${label}: "${suggestion.name}" → existing "${match.name}" [id ${match.id}]`,
    );
    if (warnedMissingExclusion) {
      prompter.print(
        "  Warning: this category does not have both Exclude from budget and Exclude from totals enabled.",
      );
    }
    return match;
  }
  prompter.print(
    allowsCreateCategory(group)
      ? `  Suggested category for ${label}: "${suggestion.name}" (not found — create it or pick another)`
      : `  Suggested category for ${label}: "${suggestion.name}" (not found — pick an existing category or skip)`,
  );
  return undefined;
}

const TRANSFER_PAIRING_TYPES = new Set<CanonicalType>(["deposit", "withdrawal", "transfer"]);

function printSavebackGuidance(prompter: SetupPrompter, categories: readonly SetupCategoryRow[]): void {
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

function printGroupGuidance(
  prompter: SetupPrompter,
  group: CategoryPromptGroup,
  categoryRows: readonly SetupCategoryRow[],
): void {
  if (group.types.some((type) => TRANSFER_PAIRING_TYPES.has(type))) {
    prompter.print(
      '  Use the same excluded transfer category (ideally "Payment, Transfer") on the bank-side leg of this movement — this tool does not recategorise Plaid/bank transactions.',
    );
  }
  if (groupHas(group, "saveback")) {
    printSavebackGuidance(prompter, categoryRows);
  }
  if (groupHas(group, "unknown")) {
    prompter.print(
      "  Unknown rows: Skip is the default — they stay uncategorised and keep the needs-review tag so you can review them in Lunch Money. Your transfer category is listed next if these rows really are transfers; create-new is not offered for unknown types.",
    );
  }
}

/**
 * Picker choices with the most sensible answer first so Enter does the right thing: the matching
 * existing category, else "Create new category …" (when allowed), else Skip. Unknown rows are the
 * exception: Skip comes first so Enter never files unclassified rows (buys, dividends, card spend)
 * as transfers — re-syncs skip existing rows, so a wrong first sync would stick.
 */
function buildCategoryChoices(
  group: CategoryPromptGroup,
  categoryRows: readonly SetupCategoryRow[],
  match: SetupCategoryRow | undefined,
): PromptChoice[] {
  const skipChoice: PromptChoice = { name: "Skip (no mapping)", value: SKIP_CATEGORY };
  const createChoices: PromptChoice[] = [];
  if (allowsCreateCategory(group)) {
    createChoices.push({
      name: group.suggestion
        ? `Create new category "${group.suggestion.name}"`
        : "Create new category (choose Saveback treatment)",
      value: NEW_CATEGORY,
    });
  }
  const rest = categoryRows
    .filter((category) => !category.is_group && category.id !== match?.id)
    .map((category) => ({ name: formatCategoryPickerLabel(category, categoryRows), value: String(category.id) }));
  const matchChoices = match ? [{ name: formatCategoryPickerLabel(match, categoryRows), value: String(match.id) }] : [];
  let leading: PromptChoice[];
  if (groupHas(group, "unknown")) {
    leading = [skipChoice, ...matchChoices];
  } else if (match) {
    leading = [...matchChoices, skipChoice, ...createChoices];
  } else {
    leading = [...createChoices, skipChoice];
  }
  return [...leading, ...rest];
}

async function validateExistingCategoryPick(
  prompter: SetupPrompter,
  categoryId: number,
  picked: SetupCategoryRow | undefined,
  group: CategoryPromptGroup,
): Promise<number | undefined> {
  if (!picked) {
    return categoryId;
  }
  if (picked.is_group) {
    throw new Error(`Category id ${categoryId} is a category group — pick a child category, not the group`);
  }
  // Unknown rows may legitimately land in any budget category, so the transfer suggestion's flags are not enforced.
  if (group.suggestion && !groupHas(group, "unknown")) {
    const ok = await confirmExistingCategoryFlags(prompter, picked, group.suggestion);
    if (!ok) {
      return undefined;
    }
  }
  return categoryId;
}

async function pickCategoryId(
  prompter: SetupPrompter,
  client: CategoryMappingSetupClient,
  group: CategoryPromptGroup,
): Promise<number | undefined> {
  const categories = await client.categories.getAll();
  const categoryRows = categories as readonly SetupCategoryRow[];
  printGroupGuidance(prompter, group, categoryRows);
  const match = findGroupMatch(prompter, group, categoryRows);
  const choice = await prompter.search(
    `Category for ${formatGroupLabel(group.types)}`,
    buildCategoryChoices(group, categoryRows, match),
  );
  if (choice === SKIP_CATEGORY) {
    return undefined;
  }
  if (choice === NEW_CATEGORY) {
    const template = group.suggestion ?? (await pickSavebackCreateTemplate(prompter));
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
  return validateExistingCategoryPick(prompter, categoryId, picked, group);
}

/** Parse a comma-separated tag list typed by the operator (`" a, b ,, "` → `["a", "b"]`; blank → `[]`). */
export function parseTagList(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function dedupeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function suggestedTagLabel(tag: string, owners: readonly CanonicalType[], group: CategoryPromptGroup): string {
  if (owners.length === group.types.length) {
    return `${tag} (suggested)`;
  }
  return `${tag} (suggested, ${owners.join(", ")} only)`;
}

/**
 * Tag step for one group, always offered: suggested tags (pre-ticked) plus the operator's existing
 * Lunch Money tags, then free text. With no choices at all the checkbox is skipped (inquirer throws
 * on an empty checkbox). Submitting nothing means "no tags" — never an error, never a silent default.
 * Suggested tags apply only to the types that suggested them; every other tag applies to the group.
 */
export async function pickTagsForGroup(
  prompter: SetupPrompter,
  group: CategoryPromptGroup,
  existingTagNames: readonly string[],
): Promise<Map<CanonicalType, string[]>> {
  const label = formatGroupLabel(group.types);
  const suggestedKeys = new Set([...group.suggestedTags.keys()].map((tag) => tag.toLowerCase()));
  const choices: PromptChoice[] = [
    ...[...group.suggestedTags].map(([tag, owners]) => ({
      name: suggestedTagLabel(tag, owners, group),
      value: tag,
      checked: true,
    })),
    ...dedupeTags(existingTagNames)
      .filter((name) => !suggestedKeys.has(name.toLowerCase()))
      .map((name) => ({ name, value: name })),
  ];
  const picked =
    choices.length > 0
      ? await prompter.checkbox(`Tags for ${label} (space to toggle, Enter to confirm)`, choices)
      : [];
  const extra = parseTagList(await prompter.input(`Other tags for ${label} (comma-separated, Enter for none)`, ""));
  const result = new Map<CanonicalType, string[]>();
  for (const canonicalType of group.types) {
    const tags = [...picked, ...extra].filter((tag) => {
      const owners = group.suggestedTags.get(tag);
      return owners === undefined || owners.includes(canonicalType);
    });
    result.set(canonicalType, dedupeTags(tags));
  }
  return result;
}

async function loadExistingTagNames(
  prompter: SetupPrompter,
  client: CategoryMappingSetupClient,
): Promise<string[]> {
  if (!client.tags) {
    return [];
  }
  try {
    const tags = await client.tags.getAll();
    return tags.map((tag) => tag.name).toSorted((left, right) => left.localeCompare(right));
  } catch {
    prompter.print("Could not load existing Lunch Money tags — you can still type tag names.");
    return [];
  }
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

/**
 * Ask once per {@link CategoryPromptGroup} and save after every group, so a crash or Ctrl-C keeps
 * the answers given so far.
 */
async function configureMapsForTypes(
  seenTypes: ReadonlySet<CanonicalType>,
  context: {
    readonly prompter: SetupPrompter;
    readonly client: CategoryMappingSetupClient;
    readonly filesystem: SetupFilesystem;
  },
  categoryMap: SyncConfig["categoryMap"],
  tagMap: SyncConfig["tagMap"],
): Promise<void> {
  const { prompter, client, filesystem } = context;
  const existingTagNames = await loadExistingTagNames(prompter, client);
  await forEachSequentially(groupTypesForCategoryPrompts(seenTypes), async (group) => {
    prompter.print(`\nMapping ${formatGroupLabel(group.types)}`);
    const categoryPatch: SyncConfig["categoryMap"] = {};
    const tagPatch: SyncConfig["tagMap"] = {};
    const categoryId = await pickCategoryId(prompter, client, group);
    if (categoryId !== undefined) {
      for (const canonicalType of group.types) {
        categoryPatch[canonicalType] = categoryId;
      }
    }
    for (const [canonicalType, tags] of await pickTagsForGroup(prompter, group, existingTagNames)) {
      tagPatch[canonicalType] = tags;
    }
    Object.assign(categoryMap, categoryPatch);
    Object.assign(tagMap, tagPatch);
    await mergeConfigOnDisk(filesystem, { categoryMap: categoryPatch, tagMap: tagPatch });
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
    apiKeyStore?: LunchMoneyApiKeyStore;
  },
): Promise<CategoryMappingResult> {
  if (options.nonInteractive) {
    throw new Error("Category mapping requires an interactive terminal (omit --non-interactive)");
  }
  await ensureLunchMoneyApiKeyForCli(deps.apiKeyStore ?? createDefaultLunchMoneyApiKeyStore());
  const apiKey = process.env["LUNCH_MONEY_API_KEY"]?.trim() ?? "";
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

  await configureMapsForTypes(
    seenTypes,
    { prompter: deps.prompter, client, filesystem: deps.filesystem },
    categoryMap,
    tagMap,
  );

  const configPath = resolveConfigFilePath(CONFIG_FILENAME);
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
