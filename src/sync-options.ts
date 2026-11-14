import { parseArgs, type ParseArgsConfig } from "node:util";
import { exportTypeSummaryPath } from "./shared/cli-args.js";
import { parseScriptableFlags, scriptableOptionConfig } from "./shared/scriptable-cli.js";

export type SyncBroker = "trade-republic" | "scalable-capital";

export interface SyncCliOptions {
  readonly brokers: readonly SyncBroker[];
  readonly owners: readonly string[];
  readonly dryRun: boolean;
  readonly exportTypeSummary: string | null;
  readonly reconcileCash: boolean;
  readonly help: boolean;
  readonly json: boolean;
  readonly events: boolean;
  readonly nonInteractive: boolean;
}

const PARSE_CONFIG: ParseArgsConfig = {
  options: {
    broker: { type: "string", multiple: true },
    account: { type: "string", multiple: true },
    "dry-run": { type: "boolean", default: false },
    "export-type-summary": { type: "string" },
    "reconcile-cash": { type: "boolean", default: false },
    help: { type: "boolean", default: false, short: "h" },
    ...scriptableOptionConfig(),
  },
  allowPositionals: false,
  strict: true,
};

function isSyncBroker(value: string): value is SyncBroker {
  return value === "trade-republic" || value === "scalable-capital";
}

function parseArgsOrThrow(argv: readonly string[]): ReturnType<typeof parseArgs> {
  try {
    return parseArgs({ ...PARSE_CONFIG, args: [...argv] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid sync arguments: ${message}`, { cause: error });
  }
}

function parseBrokerValues(raw: unknown): SyncBroker[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const brokers: SyncBroker[] = [];
  for (const value of raw) {
    if (typeof value !== "string" || !isSyncBroker(value)) {
      throw new Error(`Unknown broker "${String(value)}" — use trade-republic or scalable-capital`);
    }
    brokers.push(value);
  }
  return brokers;
}

function parseOwnerValues(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const owners: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error("--account requires a non-empty owner label");
    }
    owners.push(value.trim());
  }
  return owners;
}

export const SYNC_HELP_TEXT = `Usage: npm run sync -- [options]

  --broker <trade-republic|scalable-capital>  Limit sync to a broker (repeatable)
  --account <owner>                           Limit sync to profile owner labels (repeatable)
  --dry-run                                   Fetch and map only; preview inserts via Lunch Money GET
  --export-type-summary <file>                Write anonymised broker type summary (opt-in)
  --reconcile-cash                            Set the Lunch Money cash balance to the broker-reported
                                              cash when they differ by more than 1.00 (opt-in)
  --json                                      Machine-readable result on stdout (no secrets)
  --events                                    Broker login NDJSON events on stderr during fetch
  --non-interactive                           Required when stdin is not a TTY
  -h, --help                                  Show this help

After the transactions, each profile's cash balance is compared with the broker (warning only), and
holdingsAccountId / savingsAccountId accounts get their balance set to the broker value.

Unknown flags or invalid broker names exit with an error. When no filters are set, all configured profiles run.`;

export function parseSyncCliOptions(argv: readonly string[]): SyncCliOptions {
  const values = parseArgsOrThrow(argv).values as Record<string, unknown>;
  const scriptable = parseScriptableFlags(argv);
  if (values.help === true) {
    return {
      brokers: [],
      owners: [],
      dryRun: false,
      exportTypeSummary: null,
      reconcileCash: false,
      help: true,
      json: false,
      events: false,
      nonInteractive: false,
    };
  }

  return {
    brokers: parseBrokerValues(values.broker),
    owners: parseOwnerValues(values.account),
    dryRun: values["dry-run"] === true,
    exportTypeSummary: exportTypeSummaryPath(values),
    reconcileCash: values["reconcile-cash"] === true,
    help: false,
    json: scriptable.flags.json,
    events: scriptable.flags.events,
    nonInteractive: scriptable.flags.nonInteractive,
  };
}

export function filterSyncConfig<T extends { owner: string }>(
  profiles: readonly T[],
  owners: readonly string[],
): T[] {
  if (owners.length === 0) {
    return [...profiles];
  }
  const wanted = new Set(owners);
  const selected = profiles.filter((profile) => wanted.has(profile.owner));
  if (selected.length === 0) {
    throw new Error(`No profiles matched --account filter: ${owners.join(", ")}`);
  }
  return selected;
}
