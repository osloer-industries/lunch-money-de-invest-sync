import {
  canonicalTypeSchema,
  type CanonicalType,
} from "../shared/canonical-type.js";
import type { SyncConfig } from "../shared/config.js";

export interface CategoryTagMaps {
  readonly categoryMap: SyncConfig["categoryMap"];
  readonly tagMap: SyncConfig["tagMap"];
}

export function allCanonicalTypes(): CanonicalType[] {
  return canonicalTypeSchema.options;
}

export function cloneMaps(maps: CategoryTagMaps): CategoryTagMaps {
  return {
    categoryMap: { ...maps.categoryMap },
    tagMap: Object.fromEntries(
      Object.entries(maps.tagMap).map(([key, value]) => [key, [...(value ?? [])]]),
    ),
  };
}

export function setCategoryForType(
  maps: CategoryTagMaps,
  canonicalType: CanonicalType,
  categoryId: number | undefined,
): CategoryTagMaps {
  const categoryMap = { ...maps.categoryMap };
  if (categoryId === undefined) {
    Reflect.deleteProperty(categoryMap, canonicalType);
  } else {
    categoryMap[canonicalType] = categoryId;
  }
  return { ...maps, categoryMap };
}

export function setTagsForType(
  maps: CategoryTagMaps,
  canonicalType: CanonicalType,
  tags: readonly string[],
): CategoryTagMaps {
  const tagMap = { ...maps.tagMap };
  if (tags.length === 0) {
    Reflect.deleteProperty(tagMap, canonicalType);
  } else {
    tagMap[canonicalType] = [...tags];
  }
  return { ...maps, tagMap };
}

export function removeTypeMappings(maps: CategoryTagMaps, canonicalType: CanonicalType): CategoryTagMaps {
  return setTagsForType(setCategoryForType(maps, canonicalType, undefined), canonicalType, []);
}