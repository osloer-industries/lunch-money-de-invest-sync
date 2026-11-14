import type { CanonicalType } from "../shared/canonical-type.js";
import type { CategoryTagMaps } from "./mapping-mutations.js";
import { allCanonicalTypes } from "./mapping-mutations.js";

export interface MappingRow {
  readonly canonicalType: CanonicalType;
  readonly categoryId: number | undefined;
  readonly categoryName: string | undefined;
  readonly tags: readonly string[];
}

export function buildMappingRows(
  maps: CategoryTagMaps,
  categoryNameById: ReadonlyMap<number, string>,
): MappingRow[] {
  return allCanonicalTypes().map((canonicalType) => {
    const categoryId = maps.categoryMap[canonicalType];
    const tags = maps.tagMap[canonicalType] ?? [];
    return {
      canonicalType,
      categoryId,
      categoryName: categoryId === undefined ? undefined : categoryNameById.get(categoryId),
      tags,
    };
  });
}

export function formatMappingListLines(
  rows: readonly MappingRow[],
  missingApi: boolean,
): string[] {
  const header = missingApi
    ? "Category ↔ tag mapping (category names need a Lunch Money connection)"
  : "Category ↔ tag mapping";
  const lines = [header, ""];
  for (const row of rows) {
    let category = "no category";
    if (row.categoryId !== undefined) {
      category = row.categoryName
        ? `${row.categoryName} (id ${row.categoryId})`
        : `category id ${row.categoryId}`;
    }
    const tags = row.tags.length === 0 ? "no extra tags" : row.tags.join(", ");
    lines.push(`  ${row.canonicalType}: ${category}; tags: ${tags}`);
  }
  const configured = rows.filter(
    (row) => row.categoryId !== undefined || row.tags.length > 0,
  ).length;
  lines.push("");
  lines.push(`${configured} of ${rows.length} broker types have at least one mapping.`);
  return lines;
}