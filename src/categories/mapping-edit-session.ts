import type { CanonicalType } from "../shared/canonical-type.js";
import { SUGGESTED_TAGS } from "../setup/category-defaults.js";
import { parseTagList } from "../setup/run-category-mapping.js";
import type { CategoryMappingSetupClient, PromptChoice, SetupPrompter } from "../setup/types.js";
import { buildSingleTypeCategoryChoices, parseCategoryChoice } from "./category-picker.js";
import type { CategoryTagMaps } from "./mapping-mutations.js";
import { cloneMaps, removeTypeMappings, setCategoryForType, setTagsForType } from "./mapping-mutations.js";
import type { SetupCategoryRow } from "../setup/category-matching.js";

function friendlyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
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

async function loadCategoryRows(client: CategoryMappingSetupClient): Promise<readonly SetupCategoryRow[]> {
  const categories = await client.categories.getAll();
  return categories;
}

async function loadExistingTagNames(client: CategoryMappingSetupClient): Promise<string[]> {
  if (!client.tags) {
    return [];
  }
  const tags = await client.tags.getAll();
  return tags.map((tag) => tag.name).toSorted((left, right) => left.localeCompare(right));
}

async function pickCategoryForType(
  prompter: SetupPrompter,
  client: CategoryMappingSetupClient,
  canonicalType: CanonicalType,
): Promise<number | null | undefined> {
  const categoryRows = await loadCategoryRows(client);
  const choice = await prompter.search(
    `Lunch Money category for "${canonicalType}"`,
    buildSingleTypeCategoryChoices(canonicalType, categoryRows),
  );
  try {
    return parseCategoryChoice(choice, categoryRows);
  } catch (error) {
    prompter.print(`That did not work: ${friendlyError(error)} Try again.`);
    return pickCategoryForType(prompter, client, canonicalType);
  }
}

async function pickTagsForType(
  prompter: SetupPrompter,
  client: CategoryMappingSetupClient,
  canonicalType: CanonicalType,
  currentTags: readonly string[],
): Promise<string[] | undefined> {
  const action = await prompter.select("Tags for this broker type", [
    { name: "Keep current tags", value: "keep" },
    { name: "Edit tags", value: "edit" },
    { name: "Remove all saved tags for this type", value: "remove" },
  ]);
  if (action === "keep") {
    return undefined;
  }
  if (action === "remove") {
    return [];
  }

  const existingTagNames = await loadExistingTagNames(client);
  const suggested = SUGGESTED_TAGS[canonicalType] ?? [];
  const suggestedKeys = new Set(suggested.map((tag) => tag.toLowerCase()));
  const choices: PromptChoice[] = [
    ...suggested.map((tag) => ({
      name: `${tag} (suggested)`,
      value: tag,
      checked: currentTags.some((current) => current.toLowerCase() === tag.toLowerCase()),
    })),
    ...dedupeTags(existingTagNames)
      .filter((name) => !suggestedKeys.has(name.toLowerCase()))
      .map((name) => ({
        name,
        value: name,
        checked: currentTags.some((current) => current.toLowerCase() === name.toLowerCase()),
      })),
  ];

  const picked = choices.length > 0
    ? await prompter.checkbox(`Choose tags for "${canonicalType}" (space toggles, Enter confirms)`, choices)
    : [...currentTags];
  const extra = parseTagList(
    await prompter.input("Other tags (comma-separated, Enter for none)", currentTags.join(", ")),
  );
  return dedupeTags([...picked, ...extra]);
}

export interface EditSessionResult {
  readonly maps: CategoryTagMaps;
  readonly saved: boolean;
}

export interface MappingEditSessionDeps {
  readonly onPersist?: (maps: CategoryTagMaps) => Promise<void>;
}

export async function runMappingEditSession(
  prompter: SetupPrompter,
  client: CategoryMappingSetupClient,
  initialMaps: CategoryTagMaps,
  deps: MappingEditSessionDeps = {},
): Promise<EditSessionResult> {
  let maps = cloneMaps(initialMaps);
  let saved = false;

  prompter.print("");
  prompter.print("You can change one broker type at a time. Each save writes to config.json right away.");

  const editOnce = async (): Promise<void> => {
    const canonicalType = await prompter.select<CanonicalType>("Which broker type?", [
      { name: "buy", value: "buy" },
      { name: "sell", value: "sell" },
      { name: "savings-plan", value: "savings-plan" },
      { name: "deposit", value: "deposit" },
      { name: "withdrawal", value: "withdrawal" },
      { name: "transfer", value: "transfer" },
      { name: "dividend", value: "dividend" },
      { name: "interest", value: "interest" },
      { name: "saveback", value: "saveback" },
      { name: "fee", value: "fee" },
      { name: "tax", value: "tax" },
      { name: "unknown", value: "unknown" },
    ]);

    try {
      const categoryPick = await pickCategoryForType(prompter, client, canonicalType);
      if (categoryPick === null) {
        maps = setCategoryForType(maps, canonicalType, undefined);
      } else if (categoryPick !== undefined) {
        maps = setCategoryForType(maps, canonicalType, categoryPick);
      }

      const currentTags = maps.tagMap[canonicalType] ?? [];
      const tagPick = await pickTagsForType(prompter, client, canonicalType, currentTags);
      if (tagPick !== undefined) {
        maps = setTagsForType(maps, canonicalType, tagPick);
      }

      if (
        await prompter.confirm(`Remove both category and tags for "${canonicalType}" entirely?`, false)
      ) {
        maps = removeTypeMappings(maps, canonicalType);
      }

      if (deps.onPersist) {
        await deps.onPersist(maps);
      }
      saved = true;
      prompter.print(`Updated mapping for "${canonicalType}" and saved to config.json.`);
    } catch (error) {
      prompter.print(`Something went wrong: ${friendlyError(error)} Your earlier edits in this session are still in memory.`);
    }
  };

  const editLoop = async (): Promise<void> => {
    if (!(await prompter.confirm("Change another broker type?", true))) {
      return;
    }
    await editOnce();
    await editLoop();
  };

  await editLoop();

  return { maps, saved };
}