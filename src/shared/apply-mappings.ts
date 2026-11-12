import type { CanonicalType } from "./canonical-type.js";
import type { CanonicalTransaction } from "./transaction.js";

const NEEDS_REVIEW_TAG = "needs-review";

export function applyCategoryTagMappings(
  transactions: readonly CanonicalTransaction[],
  categoryMap: Readonly<Partial<Record<CanonicalType, number>>>,
  tagMap: Readonly<Partial<Record<CanonicalType, readonly string[]>>>,
): CanonicalTransaction[] {
  return transactions.map((tx) => {
    const tags = new Set(tx.tags ?? []);
    for (const name of tagMap[tx.canonicalType] ?? []) {
      tags.add(name);
    }
    if (tx.canonicalType === "unknown") {
      tags.add(NEEDS_REVIEW_TAG);
    }
    const categoryId = categoryMap[tx.canonicalType];
    return {
      ...tx,
      ...(tags.size > 0 ? { tags: [...tags] } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
    };
  });
}
