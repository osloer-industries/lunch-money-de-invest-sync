import { buildSingleTypeCategoryChoices, parseCategoryChoice } from "../categories/category-picker.js";
import type { CategoryTagMaps } from "../categories/mapping-mutations.js";
import { cloneMaps, setCategoryForType } from "../categories/mapping-mutations.js";
import { writeMapsToFilesystem } from "../categories/mapping-store.js";
import type { CanonicalType } from "../shared/canonical-type.js";
import { readConfigJsonObject, writeConfigJsonObject } from "../setup/config-json.js";
import type { CategoryMappingSetupClient, PromptChoice, SetupFilesystem, SetupPrompter } from "../setup/types.js";
import { resolveConfigFilePath } from "../shared/config.js";
import type { SetupCategoryRow } from "../setup/category-matching.js";
import { parseSinceDate } from "./since.js";
import { forEachSequentially } from "../shared/sequential-profiles.js";
import type { DryRunCategoryBucket, DryRunProfileSummary, DryRunReviewSummary } from "./types.js";

const BROKER_LABELS: Record<string, string> = {
  "trade-republic": "Trade Republic",
  "scalable-capital": "Scalable Capital",
};

const PAGE_SIZE = 8;
const UNCATEGORISED_THRESHOLD = 0.1;

const TYPE_CHOICES: PromptChoice<CanonicalType>[] = [
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
];

export interface DryRunTerminalReviewDeps {
  readonly prompter: SetupPrompter;
  readonly client: CategoryMappingSetupClient;
  readonly filesystem: SetupFilesystem;
}

export interface DryRunTerminalReviewResult {
  readonly proceed: boolean;
  readonly maps: CategoryTagMaps;
  readonly syncSince?: string;
}

function brokerLabel(broker: string): string {
  return BROKER_LABELS[broker] ?? broker;
}

function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function printProfileSummary(prompter: SetupPrompter, profile: DryRunProfileSummary): void {
  prompter.print("");
  prompter.print(
    `Step ${profile.stepIndex} of ${profile.stepTotal} · ${brokerLabel(profile.broker)} · ${profile.owner}`,
  );
  prompter.print(
    `Would insert ${profile.wouldInsert}, skip ${profile.wouldSkip} duplicate(s). ` +
      `${profile.uncategorisedCount} uncategorised (${formatShare(profile.uncategorisedShare)}), ` +
      `${profile.needsReviewCount} with needs-review tag.`,
  );
  if (profile.dateFrom && profile.dateTo) {
    prompter.print(`Dates ${profile.dateFrom} through ${profile.dateTo}.`);
  }
  prompter.print(`Money in: ${profile.inTotalPlain}. Money out: ${profile.outTotalPlain}.`);
  prompter.print("By category:");
  for (const bucket of profile.categoryBuckets) {
    prompter.print(`  ${bucket.categoryLabel}: ${bucket.count}`);
  }
}

function rowLine(row: DryRunCategoryBucket["rows"][number]): string {
  const tags = row.tags.length > 0 ? ` [${row.tags.join(", ")}]` : "";
  const dup = row.action === "skip_duplicate" ? " (duplicate)" : "";
  return `${row.date}  ${row.amountPlain}  ${row.payee}${tags}${dup}`;
}

async function pageBucketRows(prompter: SetupPrompter, bucket: DryRunCategoryBucket): Promise<void> {
  let page = 0;
  const totalPages = Math.max(1, Math.ceil(bucket.rows.length / PAGE_SIZE));

  const loop = async (): Promise<void> => {
    prompter.print("");
    prompter.print(`${bucket.categoryLabel} (${bucket.count} rows)`);
    const start = page * PAGE_SIZE;
    for (const row of bucket.rows.slice(start, start + PAGE_SIZE)) {
      prompter.print(`  ${rowLine(row)}`);
    }
    prompter.print(`Page ${page + 1} of ${totalPages}`);

    const choices: PromptChoice[] = [];
    if (page > 0) {
      choices.push({ name: "← Previous page", value: "prev" });
    }
    if (page < totalPages - 1) {
      choices.push({ name: "Next page →", value: "next" });
    }
    choices.push({ name: "Back (q)", value: "back" });
    const action = await prompter.select("Review rows", choices);
    if (action === "prev") {
      page -= 1;
      await loop();
    } else if (action === "next") {
      page += 1;
      await loop();
    }
  };

  await loop();
}

async function pickCategoryForType(
  prompter: SetupPrompter,
  client: CategoryMappingSetupClient,
  canonicalType: CanonicalType,
): Promise<number | null | undefined> {
  const categoryRows = (await client.categories.getAll()) as readonly SetupCategoryRow[];
  const choice = await prompter.search(
    `Lunch Money category for "${canonicalType}"`,
    buildSingleTypeCategoryChoices(canonicalType, categoryRows),
  );
  return parseCategoryChoice(choice, categoryRows);
}

async function fixCategoryMapping(
  prompter: SetupPrompter,
  client: CategoryMappingSetupClient,
  maps: CategoryTagMaps,
  filesystem: SetupFilesystem,
): Promise<CategoryTagMaps> {
  const canonicalType = await prompter.select<CanonicalType>("Which broker type should change?", TYPE_CHOICES);
  const pick = await pickCategoryForType(prompter, client, canonicalType);
  let next = maps;
  if (pick === null) {
    next = setCategoryForType(maps, canonicalType, undefined);
  } else if (pick !== undefined) {
    next = setCategoryForType(maps, canonicalType, pick);
  }
  await writeMapsToFilesystem(filesystem, next);
  prompter.print(`Saved category mapping for "${canonicalType}" to config.json.`);
  return next;
}

async function persistSyncSince(filesystem: SetupFilesystem, syncSince: string): Promise<void> {
  const configPath = resolveConfigFilePath();
  const parsed = readConfigJsonObject(filesystem, configPath);
  await writeConfigJsonObject(filesystem, configPath, { ...parsed, syncSince });
}

async function promptSyncSince(
  prompter: SetupPrompter,
  filesystem: SetupFilesystem,
  current?: string,
): Promise<string | undefined> {
  const raw = await prompter.input(
    "Only sync transactions on or after this date (YYYY-MM-DD, Enter to keep current)",
    current ?? "",
  );
  if (raw.trim().length === 0) {
    return current;
  }
  try {
    const syncSince = parseSinceDate(raw);
    await persistSyncSince(filesystem, syncSince);
    prompter.print(`Saved syncSince ${syncSince} to config.json.`);
    return syncSince;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    prompter.print(`That date did not work: ${message} Try again.`);
    return promptSyncSince(prompter, filesystem, current);
  }
}

async function reviewProfile(
  profile: DryRunProfileSummary,
  maps: CategoryTagMaps,
  deps: DryRunTerminalReviewDeps,
  onSyncSince: (value: string) => void,
): Promise<CategoryTagMaps> {
  let currentMaps = maps;

  const loop = async (): Promise<CategoryTagMaps> => {
    printProfileSummary(deps.prompter, profile);
    const bucketChoices: PromptChoice[] = profile.categoryBuckets.map((bucket, index) => ({
      name: `${bucket.categoryLabel} (${bucket.count})`,
      value: String(index),
    }));
    const action = await deps.prompter.select("Review this profile", [
      ...bucketChoices,
      { name: "Fix category for a broker type", value: "fix" },
      { name: "Set sync start date", value: "since" },
      { name: "Continue to next profile", value: "next" },
    ]);

    if (action === "fix") {
      currentMaps = await fixCategoryMapping(deps.prompter, deps.client, currentMaps, deps.filesystem);
      return loop();
    }
    if (action === "since") {
      const saved = await promptSyncSince(deps.prompter, deps.filesystem);
      if (saved) {
        onSyncSince(saved);
      }
      return loop();
    }
    if (action === "next") {
      return currentMaps;
    }

    const index = Number(action);
    const bucket = profile.categoryBuckets[index];
    if (bucket) {
      await pageBucketRows(deps.prompter, bucket);
      return loop();
    }
    return loop();
  };

  return await loop();
}

export async function runDryRunTerminalReview(
  summary: DryRunReviewSummary,
  maps: CategoryTagMaps,
  deps: DryRunTerminalReviewDeps,
): Promise<DryRunTerminalReviewResult> {
  let currentMaps = cloneMaps(maps);
  let syncSince: string | undefined;

  deps.prompter.print("");
  deps.prompter.print("Dry-run review — summary first, then drill down by category. Nothing is written yet.");

  await forEachSequentially(summary.profiles, async (profile) => {
    currentMaps = await reviewProfile(profile, currentMaps, deps, (value) => {
      syncSince = value;
    });
  });

  if (summary.aggregateUncategorisedShare > UNCATEGORISED_THRESHOLD) {
    deps.prompter.print("");
    deps.prompter.print(
      `Warning: about ${formatShare(summary.aggregateUncategorisedShare)} of rows are uncategorised. ` +
        "Consider fixing category mappings before your first real sync.",
    );
  }

  if (summary.allRowsAreInserts) {
    deps.prompter.print("");
    deps.prompter.print(
      "First-sync note: Lunch Money will not re-apply categories to rows that already exist with the same external_id. " +
        "Fix mappings now if you can.",
    );
  }

  const proceed = await deps.prompter.confirm(
    `Write ${summary.totalWouldInsert} transaction(s) to Lunch Money on the next real sync?`,
    false,
  );

  return { proceed, maps: currentMaps, ...(syncSince ? { syncSince } : {}) };
}