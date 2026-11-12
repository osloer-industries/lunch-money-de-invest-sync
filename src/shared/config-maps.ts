import { categoryMapSchema, tagMapSchema } from "./canonical-type.js";
import type { SyncConfig } from "./config.js";

export function parseStoredMaps(parsed: unknown): Pick<SyncConfig, "categoryMap" | "tagMap"> {
  if (typeof parsed !== "object" || parsed === null) {
    return { categoryMap: {}, tagMap: {} };
  }
  const rawCategory = Reflect.get(parsed, "categoryMap");
  const rawTag = Reflect.get(parsed, "tagMap");
  const categoryResult = categoryMapSchema.safeParse(rawCategory ?? {});
  const tagResult = tagMapSchema.safeParse(rawTag ?? {});
  return {
    categoryMap: categoryResult.success ? categoryResult.data : {},
    tagMap: tagResult.success ? tagResult.data : {},
  };
}
