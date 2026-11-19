import type { ParseArgsConfig } from "node:util";
import { exportTypeSummaryPath, parseCliArgv } from "../shared/cli-args.js";
import { parseScriptableFlags, scriptableOptionConfig } from "../shared/scriptable-cli.js";
import { booleanArg, optionalStringArg } from "../shared/parse-args-values.js";

export interface SetupCliOptions {
  readonly nonInteractive: boolean;
  readonly skipBrokerCheck: boolean;
  readonly yes: boolean;
  readonly tradeRepublic: boolean;
  readonly scalableCapital: boolean;
  readonly owner: string | null;
  readonly lunchMoneyAssetId: number | null;
  readonly tradeRepublicAssetId: number | null;
  readonly scalableAssetId: number | null;
  readonly portfolioId: string | null;
  readonly tradeRepublicHoldingsAccountId: number | null;
  readonly scalableHoldingsAccountId: number | null;
  readonly scalableSavingsAccountId: number | null;
  readonly categories: boolean;
  readonly exportTypeSummary: string | null;
  readonly replaceApiKey: boolean;
  readonly clearApiKey: boolean;
  readonly help: boolean;
  readonly json: boolean;
  readonly events: boolean;
}

const PARSE_CONFIG: ParseArgsConfig = {
  options: {
    "non-interactive": { type: "boolean", default: false },
    "skip-broker-check": { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
    "trade-republic": { type: "boolean", default: false },
    "scalable-capital": { type: "boolean", default: false },
    owner: { type: "string" },
    "lunch-money-asset-id": { type: "string" },
    "trade-republic-asset-id": { type: "string" },
    "scalable-asset-id": { type: "string" },
    "portfolio-id": { type: "string" },
    "trade-republic-holdings-account-id": { type: "string" },
    "scalable-holdings-account-id": { type: "string" },
    "scalable-savings-account-id": { type: "string" },
    categories: { type: "boolean", default: false },
    "export-type-summary": { type: "string" },
    "replace-api-key": { type: "boolean", default: false },
    "clear-api-key": { type: "boolean", default: false },
    help: { type: "boolean", default: false, short: "h" },
    ...scriptableOptionConfig(),
  },
  allowPositionals: false,
  strict: true,
};

export const SETUP_HELP_TEXT = `Usage: npm run setup -- [options]

Interactive onboarding for Lunch Money + broker profiles (default).

  --non-interactive              Scripted setup (requires broker/api flags below)
  --trade-republic               Include a Trade Republic profile
  --scalable-capital             Include a Scalable Capital profile
  --owner <label>                Profile owner label (required in non-interactive mode)
  --lunch-money-asset-id <id>    Default manual account id (both brokers if per-broker ids omitted)
  --trade-republic-asset-id <id> Trade Republic manual account id (non-interactive)
  --scalable-asset-id <id>       Scalable Capital manual account id (non-interactive)
  --portfolio-id <id>            Scalable portfolio id (optional)
  --trade-republic-holdings-account-id <id>
                                 Manual account for Trade Republic market value (optional)
  --scalable-holdings-account-id <id>
                                 Manual account for Scalable market value (optional)
  --scalable-savings-account-id <id>
                                 Manual account for the Scalable overnight savings balance (optional)
  --skip-broker-check            Skip sc/pytr install+login probes
  --yes                          Overwrite config.json without prompting
  --replace-api-key              Prompt for a new Lunch Money API key (stored in OS keychain)
  --clear-api-key                Remove the stored Lunch Money API key
  --categories                   Map broker types to Lunch Money categories/tags (standalone)
  --export-type-summary <file>   Write anonymised type counts/examples (opt-in)
  --json                         Machine-readable result on stdout (non-interactive flows)
  --events                       Broker login NDJSON on stderr during broker checks
  -h, --help                     Show this help`;

function parsePositiveIntFlag(values: Record<string, unknown>, key: string): number | null {
  const raw = values[key];
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return parsed;
}

export function parseSetupCliOptions(argv: readonly string[]): SetupCliOptions {
  const parsed = parseCliArgv(argv, PARSE_CONFIG, "Invalid setup arguments");
  const scriptable = parseScriptableFlags(argv);
  const values: Record<string, unknown> = parsed.values;
  const lunchMoneyAssetId = parsePositiveIntFlag(values, "lunch-money-asset-id");
  const tradeRepublicAssetId = parsePositiveIntFlag(values, "trade-republic-asset-id");
  const scalableAssetId = parsePositiveIntFlag(values, "scalable-asset-id");
  return {
    nonInteractive: booleanArg(values, "non-interactive"),
    skipBrokerCheck: booleanArg(values, "skip-broker-check"),
    yes: booleanArg(values, "yes"),
    tradeRepublic: booleanArg(values, "trade-republic"),
    scalableCapital: booleanArg(values, "scalable-capital"),
    owner: optionalStringArg(values, "owner") ?? null,
    lunchMoneyAssetId,
    tradeRepublicAssetId,
    scalableAssetId,
    portfolioId: optionalStringArg(values, "portfolio-id") ?? null,
    tradeRepublicHoldingsAccountId: parsePositiveIntFlag(values, "trade-republic-holdings-account-id"),
    scalableHoldingsAccountId: parsePositiveIntFlag(values, "scalable-holdings-account-id"),
    scalableSavingsAccountId: parsePositiveIntFlag(values, "scalable-savings-account-id"),
    categories: booleanArg(values, "categories"),
    exportTypeSummary: exportTypeSummaryPath(values),
    replaceApiKey: booleanArg(values, "replace-api-key"),
    clearApiKey: booleanArg(values, "clear-api-key"),
    help: booleanArg(values, "help"),
    json: scriptable.flags.json,
    events: scriptable.flags.events,
  };
}
