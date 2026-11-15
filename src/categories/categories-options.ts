import { parseArgs, type ParseArgsConfig } from "node:util";
import {
  parseCategoryMapAssignment,
  parseScriptableFlags,
  parseTagMapAssignment,
  scriptableOptionConfig,
} from "../shared/scriptable-cli.js";

export type CategoriesCommand = "list" | "edit" | "reapply" | "apply" | "list-lunch-money";

export interface CategoriesCliOptions {
  readonly command: CategoriesCommand | null;
  readonly dryRun: boolean;
  readonly help: boolean;
  readonly json: boolean;
  readonly events: boolean;
  readonly nonInteractive: boolean;
  readonly applyFromPath: string | null;
  readonly categoryMapAssignments: readonly string[];
  readonly tagMapAssignments: readonly string[];
  readonly yes: boolean;
}

const PARSE_CONFIG: ParseArgsConfig = {
  options: {
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false, short: "h" },
    from: { type: "string" },
    map: { type: "string", multiple: true },
    tag: { type: "string", multiple: true },
    yes: { type: "boolean", default: false },
    ...scriptableOptionConfig(),
  },
  allowPositionals: true,
  strict: true,
};

export const CATEGORIES_HELP_TEXT = `Usage: npm run categories -- <command> [options]

View or edit broker type → Lunch Money category/tag rules stored in config.json.

Commands:
  list               Show the current mapping (loads category names from Lunch Money)
  list-lunch-money   List Lunch Money categories and tags (for tooling)
  apply              Apply category/tag rules without a TTY (--from file and/or --map/--tag)
  edit               Change categories or tags one type at a time (saves after each type)
  reapply            Update already-synced transactions to match the mapping

Options:
  --from <mapping.json>   With apply: JSON file containing categoryMap and/or tagMap
  --map <type=id>         With apply: set one category (repeatable; idempotent)
  --tag <type=a,b>        With apply: set tags for one type (repeatable; idempotent)
  --dry-run               With reapply: preview changes without calling Lunch Money
  --yes                   With reapply: apply without a confirmation prompt (--non-interactive)
  --json                  Machine-readable stdout (no secrets)
  --events                Emit broker login NDJSON events on stderr (reserved for broker-backed commands)
  --non-interactive       Refuse interactive prompts; use with apply or reapply --yes
  -h, --help              Show this help
`;

function parseCommand(value: string): CategoriesCommand {
  if (
    value === "list" ||
    value === "edit" ||
    value === "reapply" ||
    value === "apply" ||
    value === "list-lunch-money"
  ) {
    return value;
  }
  throw new Error(
    `Unknown command "${value}". Use list, list-lunch-money, apply, edit, or reapply.`,
  );
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
  const values = parsed.values as Record<string, unknown>;
  const mapValues = Array.isArray(values.map)
    ? values.map.filter((entry): entry is string => typeof entry === "string")
    : [];
  const tagValues = Array.isArray(values.tag)
    ? values.tag.filter((entry): entry is string => typeof entry === "string")
    : [];
  const scriptable = parseScriptableFlags(argv);
  return {
    command,
    dryRun: values["dry-run"] === true,
    help: values.help === true,
    json: scriptable.flags.json,
    events: scriptable.flags.events,
    nonInteractive: scriptable.flags.nonInteractive,
    applyFromPath: typeof values.from === "string" ? values.from : null,
    categoryMapAssignments: mapValues,
    tagMapAssignments: tagValues,
    yes: values.yes === true,
  };
}

export function parsedCategoryAssignments(assignments: readonly string[]) {
  return assignments.map((entry) => parseCategoryMapAssignment(entry));
}

export function parsedTagAssignments(assignments: readonly string[]) {
  return assignments.map((entry) => parseTagMapAssignment(entry));
}