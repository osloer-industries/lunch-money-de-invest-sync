import { SUGGESTED_TAGS } from "../setup/category-defaults.js";
import type { SyncConfig } from "../shared/config.js";

const SYSTEM_MANAGED_TAGS = ["needs-review", "shared"] as const;

/** Tag names this tool overwrites when re-applying mappings (operator tags are kept). */
export function collectManagedTagNames(tagMap: SyncConfig["tagMap"]): ReadonlySet<string> {
  const names = new Set<string>(SYSTEM_MANAGED_TAGS);
  for (const tags of Object.values(tagMap)) {
    for (const tag of tags ?? []) {
      names.add(tag);
    }
  }
  for (const tags of Object.values(SUGGESTED_TAGS)) {
    for (const tag of tags ?? []) {
      names.add(tag);
    }
  }
  return names;
}