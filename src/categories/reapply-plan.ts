import type { CanonicalTransaction } from "../shared/transaction.js";
import type { ListedTransaction } from "./lm-transactions.js";
import { collectManagedTagNames } from "./managed-tags.js";
import type { SyncConfig } from "../shared/config.js";

export interface ReapplyChange {
  readonly transactionId: number;
  readonly externalId: string;
  readonly categoryId: number | null;
  readonly tagIds: number[];
  readonly previousCategoryId: number | null;
  readonly previousTagIds: readonly number[];
}

export interface ReapplyPlan {
  readonly changes: readonly ReapplyChange[];
  readonly skippedMissingInLunchMoney: number;
  readonly unchanged: number;
}

function sortedNumberArray(values: readonly number[]): number[] {
  return [...values].toSorted((left, right) => left - right);
}

function arraysEqual(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function mergeTagNames(
  existingTagNames: readonly string[],
  desiredMappedNames: readonly string[],
  managedTagNames: ReadonlySet<string>,
): string[] {
  const kept = existingTagNames.filter((name) => !managedTagNames.has(name));
  const merged = new Set<string>([...kept, ...desiredMappedNames]);
  return [...merged].toSorted((left, right) => left.localeCompare(right));
}

export function planReapplyForAccount(
  mappedTransactions: readonly CanonicalTransaction[],
  lunchMoneyByExternalId: ReadonlyMap<string, ListedTransaction>,
  tagMap: SyncConfig["tagMap"],
  tagIdByName: ReadonlyMap<string, number>,
  tagNameById: ReadonlyMap<number, string>,
): ReapplyPlan {
  const managedTagNames = collectManagedTagNames(tagMap);
  const changes: ReapplyChange[] = [];
  let skippedMissingInLunchMoney = 0;
  let unchanged = 0;

  for (const mapped of mappedTransactions) {
    const existing = lunchMoneyByExternalId.get(mapped.externalId);
    if (!existing) {
      skippedMissingInLunchMoney += 1;
      continue;
    }
    const desiredCategoryId = mapped.categoryId ?? null;
    const existingNames = existing.tagIds.map((id) => tagNameById.get(id)).filter((name): name is string => Boolean(name));
    const desiredNames = mergeTagNames(existingNames, mapped.tags ?? [], managedTagNames);
    const desiredTagIds = sortedNumberArray(
      desiredNames.map((name) => {
        const id = tagIdByName.get(name);
        if (id === undefined) {
          throw new Error(`Unknown tag "${name}" — sync or list tags in Lunch Money first`);
        }
        return id;
      }),
    );
    const previousCategoryId = existing.categoryId;
    const previousTagIds = sortedNumberArray(existing.tagIds);
    const categoryChanged = previousCategoryId !== desiredCategoryId;
    const tagsChanged = !arraysEqual(previousTagIds, desiredTagIds);
    if (!categoryChanged && !tagsChanged) {
      unchanged += 1;
      continue;
    }
    changes.push({
      transactionId: existing.id,
      externalId: mapped.externalId,
      categoryId: desiredCategoryId,
      tagIds: desiredTagIds,
      previousCategoryId,
      previousTagIds,
    });
  }

  return { changes, skippedMissingInLunchMoney, unchanged };
}

export function summarizeReapplyPlan(plans: readonly ReapplyPlan[]): {
  readonly wouldUpdate: number;
  readonly unchanged: number;
  readonly skippedMissingInLunchMoney: number;
} {
  let wouldUpdate = 0;
  let unchanged = 0;
  let skippedMissingInLunchMoney = 0;
  for (const plan of plans) {
    wouldUpdate += plan.changes.length;
    unchanged += plan.unchanged;
    skippedMissingInLunchMoney += plan.skippedMissingInLunchMoney;
  }
  return { wouldUpdate, unchanged, skippedMissingInLunchMoney };
}