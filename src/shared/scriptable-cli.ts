import { parseArgs, type ParseArgsConfig } from "node:util";
import { z } from "zod";

export interface ScriptableCliFlags {
  readonly json: boolean;
  readonly events: boolean;
  readonly nonInteractive: boolean;
}

const SCRIPTABLE_PARSE_CONFIG: ParseArgsConfig = {
  options: {
    json: { type: "boolean", default: false },
    events: { type: "boolean", default: false },
    "non-interactive": { type: "boolean", default: false },
  },
  allowPositionals: true,
  strict: false,
};

export function scriptableOptionConfig(): ParseArgsConfig["options"] {
  return { ...SCRIPTABLE_PARSE_CONFIG.options };
}

export function parseScriptableFlags(argv: readonly string[]): {
  readonly flags: ScriptableCliFlags;
  readonly rest: readonly string[];
} {
  const parsed = parseArgs({ ...SCRIPTABLE_PARSE_CONFIG, args: [...argv] });
  const values = parsed.values as Record<string, unknown>;
  return {
    flags: {
      json: values.json === true,
      events: values.events === true,
      nonInteractive: values["non-interactive"] === true,
    },
    rest: parsed.positionals,
  };
}

export function stripScriptableArgv(argv: readonly string[]): readonly string[] {
  return argv.filter((arg) => arg !== "--json" && arg !== "--events" && arg !== "--non-interactive");
}

export function assertInteractiveTerminal(commandLabel: string, nonInteractive: boolean): void {
  if (nonInteractive || process.stdin.isTTY) {
    return;
  }
  throw new Error(
    `${commandLabel} requires an interactive terminal (stdin is not a TTY). Pass --non-interactive or --json for scripted use.`,
  );
}

export function writeStdoutJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

const mappingFileSchema = z
  .object({
    categoryMap: z.record(z.string(), z.number().int().positive()).optional(),
    tagMap: z.record(z.string(), z.array(z.string().min(1))).optional(),
  })
  .refine((value) => value.categoryMap !== undefined || value.tagMap !== undefined, {
    message: "mapping file must include categoryMap and/or tagMap",
  });

export type MappingFilePayload = z.infer<typeof mappingFileSchema>;

export function parseMappingFileJson(text: string, sourceLabel: string): MappingFilePayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${sourceLabel}: ${message}`, { cause: error });
  }
  const result = mappingFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid mapping in ${sourceLabel}: ${result.error.message}`);
  }
  return result.data;
}

/** Parses `--map canonicalType=categoryId` assignments (category id must be a positive integer). */
export function parseCategoryMapAssignment(raw: string): { readonly type: string; readonly categoryId: number } {
  const match = /^([^=:]+)[=:](\d+)$/.exec(raw.trim());
  if (!match) {
    throw new Error(`Invalid --map value "${raw}" — use canonicalType=categoryId (for example deposit=123)`);
  }
  const categoryId = Number(match[2]);
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    throw new Error(`Invalid category id in --map "${raw}"`);
  }
  return { type: match[1]!.trim(), categoryId };
}

/** Parses `--tag canonicalType=tag-one,tag-two` assignments. */
export function parseTagMapAssignment(raw: string): { readonly type: string; readonly tags: readonly string[] } {
  const match = /^([^=:]+)[=:](.+)$/.exec(raw.trim());
  if (!match) {
    throw new Error(`Invalid --tag value "${raw}" — use canonicalType=tag-one,tag-two`);
  }
  const tags = match[2]!
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return { type: match[1]!.trim(), tags };
}