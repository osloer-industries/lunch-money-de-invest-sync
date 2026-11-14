import { canonicalTypeSchema, type CanonicalType } from "../shared/canonical-type.js";
import {
  cloneMaps,
  setCategoryForType,
  setTagsForType,
  type CategoryTagMaps,
} from "./mapping-mutations.js";

function assertCanonicalType(key: string): CanonicalType {
  const parsed = canonicalTypeSchema.safeParse(key);
  if (!parsed.success) {
    throw new Error(`Unknown canonical type "${key}" — valid types: ${canonicalTypeSchema.options.join(", ")}`);
  }
  return parsed.data;
}

export function mapsAreEqual(left: CategoryTagMaps, right: CategoryTagMaps): boolean {
  const leftCategory = JSON.stringify(left.categoryMap);
  const rightCategory = JSON.stringify(right.categoryMap);
  const leftTags = JSON.stringify(left.tagMap);
  const rightTags = JSON.stringify(right.tagMap);
  return leftCategory === rightCategory && leftTags === rightTags;
}

export interface ApplyMappingInput {
  readonly categoryAssignments?: ReadonlyArray<{ readonly type: string; readonly categoryId: number }>;
  readonly tagAssignments?: ReadonlyArray<{ readonly type: string; readonly tags: readonly string[] }>;
  readonly fromFile?: { readonly categoryMap?: Record<string, number>; readonly tagMap?: Record<string, string[]> };
}

export function applyMappingMutations(
  current: CategoryTagMaps,
  input: ApplyMappingInput,
): CategoryTagMaps {
  let maps = cloneMaps(current);
  const fromFile = input.fromFile;
  if (fromFile?.categoryMap) {
    for (const [rawType, categoryId] of Object.entries(fromFile.categoryMap)) {
      const canonicalType = assertCanonicalType(rawType);
      maps = setCategoryForType(maps, canonicalType, categoryId);
    }
  }
  if (fromFile?.tagMap) {
    for (const [rawType, tags] of Object.entries(fromFile.tagMap)) {
      const canonicalType = assertCanonicalType(rawType);
      maps = setTagsForType(maps, canonicalType, tags);
    }
  }
  for (const assignment of input.categoryAssignments ?? []) {
    const canonicalType = assertCanonicalType(assignment.type);
    maps = setCategoryForType(maps, canonicalType, assignment.categoryId);
  }
  for (const assignment of input.tagAssignments ?? []) {
    const canonicalType = assertCanonicalType(assignment.type);
    maps = setTagsForType(maps, canonicalType, assignment.tags);
  }
  return maps;
}