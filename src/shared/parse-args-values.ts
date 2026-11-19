/** Reads a boolean CLI flag from node:util `parseArgs` values. */
export function booleanArg(values: Record<string, unknown>, key: string): boolean {
  return values[key] === true;
}

/** Reads an optional string CLI option from node:util `parseArgs` values. */
export function optionalStringArg(values: Record<string, unknown>, key: string): string | undefined {
  const raw = values[key];
  return typeof raw === "string" ? raw : undefined;
}

/** Collects repeated string options (e.g. `--map` with `multiple: true`). */
export function stringListArg(values: Record<string, unknown>, key: string): readonly string[] {
  const raw = values[key];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((entry): entry is string => typeof entry === "string");
}