import path from "node:path";
import { z } from "zod";
import { readConfigJsonObject, storedMapsFromConfigObject, writeConfigJsonObject } from "./config-json.js";
import { loadConfig } from "../shared/config.js";
import type { ScalableCapitalProfile, SyncConfig, TradeRepublicProfile } from "../shared/config.js";
import { createLunchMoneyClient } from "../lunch-money/client.js";
import { runSyncCli } from "../sync.js";
import {
  assertNodeMajorVersion,
  ensurePytrReady,
  ensureScCliReady,
  parseScPortfolios,
} from "./broker-preflight.js";
import { parsePromptPositiveInt } from "./parse-prompt-id.js";
import type { SetupCliOptions } from "./setup-options.js";
import type {
  LunchMoneySetupClient,
  SetupBrokerRunners,
  SetupFilesystem,
  SetupPrompter,
  SetupResult,
} from "./types.js";

const ENV_FILENAME = ".env";
const CONFIG_FILENAME = "config.json";

async function validateApiKey(client: LunchMoneySetupClient): Promise<void> {
  await client.manualAccounts.getAll();
}

async function promptApiKeyWithFactory(
  prompter: SetupPrompter,
  createClient: (apiKey: string) => LunchMoneySetupClient,
): Promise<string> {
  const key = await prompter.password("Lunch Money API key");
  if (key.trim().length === 0) {
    throw new Error("Lunch Money API key is required");
  }
  await validateApiKey(createClient(key.trim()));
  return key.trim();
}

const NEW_MANUAL_ACCOUNT = "__new__";

async function chooseManualAccount(
  prompter: SetupPrompter,
  client: LunchMoneySetupClient,
  label: string,
): Promise<number> {
  const accounts = await client.manualAccounts.getAll();
  const choice = await prompter.select(
    `Lunch Money manual account for ${label}`,
    [
      ...accounts.map((account) => ({
        name: `[${account.id}] ${account.name}`,
        value: String(account.id),
      })),
      { name: "Create new manual account", value: NEW_MANUAL_ACCOUNT },
    ],
  );
  if (choice === NEW_MANUAL_ACCOUNT) {
    const create = await prompter.confirm("Create a new Lunch Money manual account?", false);
    if (!create) {
      throw new Error("Manual account mapping cancelled");
    }
    const created = await client.manualAccounts.create({
      name: `Broker (${label})`,
      currency: "eur",
      institution_name: "Manual",
      type: "investment",
      balance: "0",
    });
    return created.id;
  }
  return parsePromptPositiveInt(choice, {
    entityLabel: "Manual account id",
    exists: (id) => accounts.some((account) => account.id === id),
  });
}

async function chooseScPortfolio(
  prompter: SetupPrompter,
  portfolios: Array<{ id: string; name: string }>,
): Promise<string | undefined> {
  if (portfolios.length <= 1) {
    return portfolios[0]?.id;
  }
  const selected = await prompter.select("Scalable Capital portfolio", [
    { name: "Skip (no portfolioId)", value: "" },
    ...portfolios.map((portfolio) => ({
      name: `${portfolio.name} (${portfolio.id})`,
      value: portfolio.id,
    })),
  ]);
  return selected.length > 0 ? selected : undefined;
}

async function writeEnvFile(
  filesystem: SetupFilesystem,
  apiKey: string,
  overwrite: boolean,
  prompter: SetupPrompter,
): Promise<string> {
  const envPath = path.join(process.cwd(), ENV_FILENAME);
  if (filesystem.exists(envPath) && !overwrite) {
    const ok = await prompter.confirm(`${ENV_FILENAME} exists — overwrite?`, false);
    if (!ok) {
      throw new Error("Refusing to overwrite existing .env");
    }
  }
  await filesystem.writeText(envPath, `LUNCH_MONEY_API_KEY=${apiKey}\n`);
  await filesystem.chmod(envPath, 0o600);
  return envPath;
}

async function writeConfigFile(
  filesystem: SetupFilesystem,
  config: {
    sharedCardLast4: string[];
    tradeRepublicProfiles: TradeRepublicProfile[];
    scalableCapitalProfiles: ScalableCapitalProfile[];
  },
  overwrite: boolean,
  prompter: SetupPrompter,
): Promise<{ path: string; categoryMap: SyncConfig["categoryMap"]; tagMap: SyncConfig["tagMap"] }> {
  const configPath = path.join(process.cwd(), CONFIG_FILENAME);
  if (filesystem.exists(configPath) && !overwrite) {
    const ok = await prompter.confirm(`${CONFIG_FILENAME} exists — overwrite?`, false);
    if (!ok) {
      throw new Error("Refusing to overwrite existing config.json");
    }
  }
  const parsed = filesystem.exists(configPath) ? readConfigJsonObject(filesystem, configPath) : {};
  const stored = storedMapsFromConfigObject(parsed);
  const categoryMap = stored.categoryMap;
  const tagMap = stored.tagMap;
  await writeConfigJsonObject(filesystem, configPath, { ...config, categoryMap, tagMap });
  return { path: configPath, categoryMap, tagMap };
}

async function interactiveProfiles(
  prompter: SetupPrompter,
  client: LunchMoneySetupClient,
  runners: SetupBrokerRunners,
  options: SetupCliOptions,
): Promise<{
  tradeRepublicProfiles: TradeRepublicProfile[];
  scalableCapitalProfiles: ScalableCapitalProfile[];
}> {
  const tradeRepublicProfiles: TradeRepublicProfile[] = [];
  const scalableCapitalProfiles: ScalableCapitalProfile[] = [];

  const brokers = await prompter.checkbox("Which brokers should this config include?", [
    { name: "Trade Republic (pytr)", value: "trade-republic" },
    { name: "Scalable Capital (sc)", value: "scalable-capital" },
  ]);

  if (brokers.includes("trade-republic")) {
    await ensurePytrReady(runners.pytr, prompter, { enabled: true, skipCheck: options.skipBrokerCheck });
    const owner =
      (await prompter.input("Trade Republic owner label", "operator-a")).trim() || "operator-a";
    const lunchMoneyAssetId = await chooseManualAccount(prompter, client, owner);
    tradeRepublicProfiles.push({ owner, lunchMoneyAssetId, pytrCommand: ["pytr"] });
  }

  if (brokers.includes("scalable-capital")) {
    await ensureScCliReady(runners.sc, prompter, { enabled: true, skipCheck: options.skipBrokerCheck });
    const owner =
      (await prompter.input("Scalable Capital owner label", "operator-b")).trim() || "operator-b";
    const lunchMoneyAssetId = await chooseManualAccount(prompter, client, owner);
    let portfolioId: string | undefined;
    if (runners.sc) {
      const listed = await runners.sc.run(["broker", "portfolios", "--json"]);
      const portfolios = parseScPortfolios(listed.stdout);
      portfolioId = await chooseScPortfolio(prompter, portfolios);
    }
    scalableCapitalProfiles.push({
      owner,
      lunchMoneyAssetId,
      ...(portfolioId ? { portfolioId } : {}),
    });
  }

  return { tradeRepublicProfiles, scalableCapitalProfiles };
}

function nonInteractiveProfiles(options: SetupCliOptions): {
  tradeRepublicProfiles: TradeRepublicProfile[];
  scalableCapitalProfiles: ScalableCapitalProfile[];
} {
  if (!options.tradeRepublic && !options.scalableCapital) {
    throw new Error("Non-interactive setup requires --trade-republic and/or --scalable-capital");
  }
  if (!options.owner || options.lunchMoneyAssetId === null) {
    throw new Error("Non-interactive setup requires --owner and --lunch-money-asset-id");
  }
  return {
    tradeRepublicProfiles: options.tradeRepublic
      ? [{ owner: options.owner, lunchMoneyAssetId: options.lunchMoneyAssetId, pytrCommand: ["pytr"] }]
      : [],
    scalableCapitalProfiles: options.scalableCapital
      ? [
          {
            owner: options.owner,
            lunchMoneyAssetId: options.lunchMoneyAssetId,
            ...(options.portfolioId ? { portfolioId: options.portfolioId } : {}),
          },
        ]
      : [],
  };
}

export async function runSetup(
  options: SetupCliOptions,
  deps: {
    prompter: SetupPrompter;
    filesystem: SetupFilesystem;
    runners: SetupBrokerRunners;
    nodeVersion?: string;
    runSync?: typeof runSyncCli;
    createLunchMoneyClient?: (apiKey: string) => LunchMoneySetupClient;
  },
): Promise<SetupResult> {
  assertNodeMajorVersion(deps.nodeVersion ?? process.version);

  const createClient =
    deps.createLunchMoneyClient ??
    ((apiKey: string): LunchMoneySetupClient => {
      const client = createLunchMoneyClient(apiKey);
      if (
        typeof client.manualAccounts?.getAll !== "function" ||
        typeof client.manualAccounts?.create !== "function" ||
        typeof client.categories?.getAll !== "function"
      ) {
        throw new TypeError("Lunch Money client is missing manualAccounts/categories API");
      }
      return client;
    });

  const apiKey = options.nonInteractive
    ? process.env["LUNCH_MONEY_API_KEY"]?.trim() ?? ""
    : await promptApiKeyWithFactory(deps.prompter, createClient);
  if (apiKey.length === 0) {
    throw new Error("LUNCH_MONEY_API_KEY must be set for non-interactive setup");
  }

  const lmClient = createClient(apiKey);
  if (options.nonInteractive) {
    await validateApiKey(lmClient);
    await ensurePytrReady(deps.runners.pytr, deps.prompter, {
      enabled: options.tradeRepublic,
      skipCheck: options.skipBrokerCheck,
    });
    await ensureScCliReady(deps.runners.sc, deps.prompter, {
      enabled: options.scalableCapital,
      skipCheck: options.skipBrokerCheck,
    });
  }

  const profiles = options.nonInteractive
    ? nonInteractiveProfiles(options)
  : await interactiveProfiles(deps.prompter, lmClient, deps.runners, options);

  const sharedRaw = options.nonInteractive
    ? "[]"
    : await deps.prompter.input('sharedCardLast4 JSON array (e.g. ["0000"])', "[]");
  const sharedParsed: unknown = JSON.parse(sharedRaw.trim().length > 0 ? sharedRaw : "[]");
  const sharedCardLast4 = z.array(z.string().length(4)).parse(sharedParsed);
  loadConfig({
    lunchMoneyApiKey: apiKey,
    sharedCardLast4,
    ...profiles,
  });

  const envPath = await writeEnvFile(deps.filesystem, apiKey, options.yes, deps.prompter);
  const written = await writeConfigFile(
    deps.filesystem,
    { sharedCardLast4, ...profiles },
    options.yes,
    deps.prompter,
  );
  const configPath = written.path;

  process.env["LUNCH_MONEY_API_KEY"] = apiKey;

  if (!options.nonInteractive && (await deps.prompter.confirm("Run a dry-run sync now?", true))) {
    await (deps.runSync ?? runSyncCli)(["--dry-run"], {
      logger: deps.prompter.print.bind(deps.prompter),
    });
  }

  return {
    kind: "completed",
    files: { configPath, envPath },
    config: {
      sharedCardLast4,
      ...profiles,
      categoryMap: written.categoryMap,
      tagMap: written.tagMap,
    },
  };
}
