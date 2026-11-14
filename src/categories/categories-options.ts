import { parseArgs, type ParseArgsConfig } from "node:util";

export type CategoriesCommand = "list" | "edit" | "reapply";

export interface CategoriesCliOptions {
  readonly command: CategoriesCommand | null;
  readonly dryRun: boolean;
  readonly help: boolean;
}

const PARSE_CONFIG: ParseArgsConfig = {
  options: {
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false, short: "h" },
  },
  allowPositionals: true,
  strict: true,
};

export const CATEGORIES_HELP_TEXT = `Usage: npm run categories -- <command> [options]

View or edit broker type → Lunch Money category/tag rules stored in config.json.

Commands:
  list       Show the current mapping (loads category names from Lunch Money)
  edit       Change categories or tags one type at a time (saves after each type)
  reapply    Update already-synced transactions to match the mapping

Options:
  --dry-run  With reapply: preview changes without calling Lunch Money
  -h, --help Show this help
`;

function parseCommand(value: string): CategoriesCommand {
  if (value === "list" || value === "edit" || value === "reapply") {
    return value;
  }
  throw new Error(`Unknown command "${value}". Use list, edit, or reapply.`);
}

export function parseCategoriesCliOptions(argv: readonly string[]): CategoriesCliOptions {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ ...PARSE_CONFIG, args: [...argv] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid categories arguments: ${message}`, { cause: error });
  }
  const positionals = parsed.positionals;
  const command = positionals[0] ? parseCommand(positionals[0]) : null;
  if (positionals.length > 1) {
    throw new Error("Too many arguments — use npm run categories -- list");
  }
  return {
    command,
    dryRun: parsed.values["dry-run"] === true,
    help: parsed.values.help === true,
  };
}