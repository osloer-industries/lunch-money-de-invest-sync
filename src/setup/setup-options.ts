import { parseArgs, type ParseArgsConfig } from "node:util";

export interface SetupCliOptions {
  readonly nonInteractive: boolean;
  readonly skipBrokerCheck: boolean;
  readonly yes: boolean;
  readonly tradeRepublic: boolean;
  readonly scalableCapital: boolean;
  readonly owner: string | null;
  readonly lunchMoneyAssetId: number | null;
  readonly portfolioId: string | null;
  readonly help: boolean;
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
    "portfolio-id": { type: "string" },
    help: { type: "boolean", default: false, short: "h" },
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
  --lunch-money-asset-id <id>    Lunch Money manual account id
  --portfolio-id <id>            Scalable portfolio id (optional)
  --skip-broker-check            Skip sc/pytr install+login probes
  --yes                          Overwrite config.json / .env without prompting
  -h, --help                     Show this help`;

export function parseSetupCliOptions(argv: readonly string[]): SetupCliOptions {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ ...PARSE_CONFIG, args: [...argv] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid setup arguments: ${message}`, { cause: error });
  }
  const values = parsed.values as Record<string, unknown>;
  const assetRaw = values["lunch-money-asset-id"];
  const lunchMoneyAssetId =
    typeof assetRaw === "string" && assetRaw.length > 0 ? Number(assetRaw) : null;
  if (typeof assetRaw === "string" && assetRaw.length > 0 && !Number.isInteger(lunchMoneyAssetId)) {
    throw new Error("--lunch-money-asset-id must be an integer");
  }
  return {
    nonInteractive: values["non-interactive"] === true,
    skipBrokerCheck: values["skip-broker-check"] === true,
    yes: values.yes === true,
    tradeRepublic: values["trade-republic"] === true,
    scalableCapital: values["scalable-capital"] === true,
    owner: typeof values.owner === "string" ? values.owner : null,
    lunchMoneyAssetId,
    portfolioId: typeof values["portfolio-id"] === "string" ? values["portfolio-id"] : null,
    help: values.help === true,
  };
}
