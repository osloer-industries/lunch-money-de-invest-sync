import { LunchMoneyClient } from "@lunch-money/lunch-money-js-v2";

export function createLunchMoneyClient(apiKey: string): LunchMoneyClient {
  return new LunchMoneyClient({ apiKey });
}

/** Narrow slice of the client that tag resolution needs, so tests can pass a stub instead of a real client. */
export interface TagsApi {
  tags: {
    getAll: () => Promise<Array<{ id: number; name: string }>>;
    create: (data: { name: string }) => Promise<{ id: number; name: string }>;
  };
}

/**
 * Lunch Money tags are referenced by numeric id, not name, when creating transactions.
 * Resolves each requested tag name to an id, creating any that don't exist yet.
 */
export async function resolveTagIds(
  client: TagsApi,
  tagNames: readonly string[],
): Promise<Map<string, number>> {
  const resolved = new Map<string, number>();
  if (tagNames.length === 0) {
    return resolved;
  }

  const existing = await client.tags.getAll();
  const byName = new Map(existing.map((tag) => [tag.name, tag.id]));

  for (const name of tagNames) {
    const existingId = byName.get(name);
    if (existingId !== undefined) {
      resolved.set(name, existingId);
      continue;
    }
    const created = await client.tags.create({ name });
    byName.set(name, created.id);
    resolved.set(name, created.id);
  }

  return resolved;
}
