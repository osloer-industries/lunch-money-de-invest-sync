export function parsePromptPositiveInt(
  raw: string,
  options: { exists: (id: number) => boolean; entityLabel: string },
): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${options.entityLabel} must be a positive integer`);
  }
  if (!options.exists(id)) {
    throw new Error(`${options.entityLabel} ${id} was not returned by the Lunch Money API`);
  }
  return id;
}
