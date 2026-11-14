import path from "node:path";
import { readConfigJsonObject, storedMapsFromConfigObject, writeConfigJsonObject } from "./config-json.js";
import { loadConfig } from "../shared/config.js";
import { readResumedProfiles } from "./resume-config.js";
import type { ScalableCapitalProfile, SyncConfig, TradeRepublicProfile } from "../shared/config.js";
import { createLunchMoneyClient } from "../lunch-money/client.js";
import { runSyncCli } from "../sync.js";
import {
  assertNodeMajorVersion,
  confirmPytrCredentialStorage,
  ensurePytrReady,
  ensureScCliReady,
  parseScPortfolios,
} from "./broker-preflight.js";
import { detectPytrLauncher } from "./detect-pytr-command.js";
import { detectScBinaryPath } from "./detect-sc-binary.js";
import { formatPytrLoginCommand } from "./pytr-session.js";
import { createPytrCliRunner, createScCliRunner } from "../shared/subprocess-cli.js";
import { parsePromptPositiveInt } from "./parse-prompt-id.js";
import { parseSharedCardLast4Input } from "./shared-card-input.js";
import { runCategoryMappingSetup } from "./run-category-mapping.js";
import { isLunchMoneyUnauthorized } from "./lunch-money-errors.js";
import { createManualAccountOrReuse } from "./manual-account.js";
import { statusError, statusOk } from "./setup-status.js";
import { forEachConfirmedRepeat } from "../shared/sequential-profiles.js";
import { MISSING_LUNCH_MONEY_API_KEY_MESSAGE } from "../shared/config-cli-errors.js";
import { stripApiKeyFromDotenvFile } from "../shared/dotenv-api-key.js";
import {
  createDefaultLunchMoneyApiKeyStore,
  type LunchMoneyApiKeyStore,
} from "../shared/lunch-money-api-key-store.js";
import type { SetupCliOptions } from "./setup-options.js";
import type {
  CategoryMappingSetupClient,
  LunchMoneySetupClient,
  SetupBrokerRunners,
  SetupFilesystem,
  SetupPrompter,
  SetupResult,
} from "./types.js";

const CONFIG_FILENAME = "config.json";

async function validateApiKey(client: LunchMoneySetupClient): Promise<void> {
  await client.manualAccounts.getAll();
}

async function promptApiKeyWithFactory(
  prompter: SetupPrompter,
  createClient: (apiKey: string) => LunchMoneySetupClient,
): Promise<string> {
  const key = await prompter.password("Lunch Money API key (input hidden)");
  if (key.trim().length === 0) {
    throw new Error("Lunch Money API key is required");
  }
  try {
    await validateApiKey(createClient(key.trim()));
    prompter.print(statusOk("Lunch Money API key verified"));
    return key.trim();
  } catch (error) {
    if (isLunchMoneyUnauthorized(error)) {
      prompter.print(statusError("Lunch Money rejected the API key — try again"));
      return promptApiKeyWithFactory(prompter, createClient);
    }
    throw error;
  }
}

async function readNonInteractiveApiKey(store: LunchMoneyApiKeyStore, envKey: string): Promise<string> {
  if (envKey.length > 0) {
    return envKey;
  }
  const stored = (await store.get())?.trim() ?? "";
  if (stored.length > 0) {
    return stored;
  }
  throw new Error(MISSING_LUNCH_MONEY_API_KEY_MESSAGE);
}

async function tryStoredInteractiveApiKey(
  prompter: SetupPrompter,
  createClient: (apiKey: string) => LunchMoneySetupClient,
  stored: string,
): Promise<string | null> {
  try {
    await validateApiKey(createClient(stored));
    prompter.print(statusOk("Using Lunch Money API key from secure storage"));
    return stored;
  } catch (error) {
    if (isLunchMoneyUnauthorized(error)) {
      prompter.print(statusError("Stored Lunch Money API key was rejected — enter a new key"));
      return null;
    }
    throw error;
  }
}

async function resolveSetupApiKey(
  options: SetupCliOptions,
  prompter: SetupPrompter,
  createClient: (apiKey: string) => LunchMoneySetupClient,
  store: LunchMoneyApiKeyStore,
  filesystem: SetupFilesystem,
): Promise<string> {
  const envKey = process.env["LUNCH_MONEY_API_KEY"]?.trim() ?? "";
  if (options.nonInteractive) {
    return readNonInteractiveApiKey(store, envKey);
  }
  if (!options.replaceApiKey) {
    const stored = (await store.get())?.trim() ?? "";
    if (stored.length > 0) {
      const reused = await tryStoredInteractiveApiKey(prompter, createClient, stored);
      if (reused) {
        return reused;
      }
    }
  }
  const prompted = await promptApiKeyWithFactory(prompter, createClient);
  await store.set(prompted);
  await stripApiKeyFromDotenvFile(filesystem, process.cwd());
  prompter.print(statusOk("Saved Lunch Money API key to secure storage"));
  return prompted;
}

const NEW_MANUAL_ACCOUNT = "__new__";
/** Generic profile label used in prompts and Lunch Money account names. Never a username. */
const DEFAULT_PROFILE_LABEL = "me";

function manualAccountChoice(account: { id: number; name: string }): { name: string; value: string } {
  return { name: `[${account.id}] ${account.name}`, value: String(account.id) };
}

/**
 * Order picker choices so the first (default) option is the right one for this broker:
 * an existing account already named `<Broker> (<owner>)` if there is one, otherwise
 * "Create new", followed by every other existing account.
 */
export function manualAccountChoices(
  accounts: ReadonlyArray<{ id: number; name: string }>,
  accountName: string,
): Array<{ name: string; value: string }> {
  const wanted = accountName.trim().toLowerCase();
  const matching = accounts.filter((account) => account.name.trim().toLowerCase() === wanted);
  const others = accounts.filter((account) => account.name.trim().toLowerCase() !== wanted);
  return [
    ...matching.map(manualAccountChoice),
    { name: `Create new manual account "${accountName}"`, value: NEW_MANUAL_ACCOUNT },
    ...others.map(manualAccountChoice),
  ];
}

async function chooseManualAccount(
  prompter: SetupPrompter,
  client: LunchMoneySetupClient,
  brokerLabel: string,
  owner: string,
): Promise<number> {
  const accountName = `${brokerLabel} (${owner})`;
  const accounts = await client.manualAccounts.getAll();
  const choice = await prompter.select(
    `Lunch Money manual account for ${accountName}`,
    manualAccountChoices(accounts, accountName),
  );
  if (choice === NEW_MANUAL_ACCOUNT) {
    const create = await prompter.confirm(
      `Create Lunch Money manual account "${accountName}" (EUR, investment, starting cash balance 0)? This account tracks cash movements from sync, not portfolio market value — set starting cash on the Accounts page if needed.`,
      false,
    );
    if (!create) {
      return chooseManualAccount(prompter, client, brokerLabel, owner);
    }
    const createdId = await createManualAccountOrReuse(prompter, client, accountName, brokerLabel);
    if (createdId !== null) {
      return createdId;
    }
    return chooseManualAccount(prompter, client, brokerLabel, owner);
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

async function confirmOverwriteIfExists(
  filesystem: SetupFilesystem,
  filePath: string,
  basename: string,
  overwrite: boolean,
  prompter: SetupPrompter,
  refusalMessage: string,
): Promise<void> {
  if (filesystem.exists(filePath) && !overwrite) {
    const ok = await prompter.confirm(`${basename} exists — overwrite?`, false);
    if (!ok) {
      throw new Error(refusalMessage);
    }
  }
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
  mergeOnly = false,
): Promise<{ path: string; categoryMap: SyncConfig["categoryMap"]; tagMap: SyncConfig["tagMap"] }> {
  const configPath = path.join(process.cwd(), CONFIG_FILENAME);
  if (!mergeOnly) {
    await confirmOverwriteIfExists(
      filesystem,
      configPath,
      CONFIG_FILENAME,
      overwrite,
      prompter,
      "Refusing to overwrite existing config.json",
    );
  }
  const parsed = filesystem.exists(configPath) ? readConfigJsonObject(filesystem, configPath) : {};
  const stored = storedMapsFromConfigObject(parsed);
  const categoryMap = stored.categoryMap;
  const tagMap = stored.tagMap;
  await writeConfigJsonObject(filesystem, configPath, { ...config, categoryMap, tagMap });
  return { path: configPath, categoryMap, tagMap };
}

async function promptOwnerAndManualAccount(
  prompter: SetupPrompter,
  client: LunchMoneySetupClient,
  brokerLabel: string,
  defaultOwner: string,
): Promise<{ owner: string; lunchMoneyAssetId: number }> {
  const owner = (
    await prompter.input(`${brokerLabel} profile label`, defaultOwner)
  ).trim() || defaultOwner;
  const lunchMoneyAssetId = await chooseManualAccount(prompter, client, brokerLabel, owner);
  return { owner, lunchMoneyAssetId };
}

type SetupProgressWriter = (partial: {
  tradeRepublicProfiles: TradeRepublicProfile[];
  scalableCapitalProfiles: ScalableCapitalProfile[];
  sharedCardLast4: string[];
}) => Promise<void>;

async function addTradeRepublicProfile(
  prompter: SetupPrompter,
  client: LunchMoneySetupClient,
  options: SetupCliOptions,
  defaultOwner: string,
): Promise<TradeRepublicProfile> {
  const detected = detectPytrLauncher();
  const loginCommand = formatPytrLoginCommand(detected.pytrCommand);
  await confirmPytrCredentialStorage(prompter, loginCommand);
  const pytrRunner = createPytrCliRunner(detected.pytrCommand);
  await ensurePytrReady(
    pytrRunner,
    prompter,
    { enabled: true, skipCheck: options.skipBrokerCheck },
    { pytrCommand: detected.pytrCommand },
  );
  const { owner, lunchMoneyAssetId } = await promptOwnerAndManualAccount(
    prompter,
    client,
    "Trade Republic",
    defaultOwner,
  );
  return {
    owner,
    lunchMoneyAssetId,
    pytrCommand: [...detected.pytrCommand],
  };
}

async function addScalableCapitalProfile(
  prompter: SetupPrompter,
  client: LunchMoneySetupClient,
  _runners: SetupBrokerRunners,
  options: SetupCliOptions,
  defaultOwner: string,
): Promise<ScalableCapitalProfile> {
  const scPath = _runners.sc ? undefined : detectScBinaryPath(undefined);
  const scRunner = _runners.sc ?? createScCliRunner(detectScBinaryPath(undefined));
  await ensureScCliReady(scRunner, prompter, { enabled: true, skipCheck: options.skipBrokerCheck });
  const { owner, lunchMoneyAssetId } = await promptOwnerAndManualAccount(
    prompter,
    client,
    "Scalable Capital",
    defaultOwner,
  );
  let portfolioId: string | undefined;
  const listed = await scRunner.run(["broker", "portfolios", "--json"]);
  const portfolios = parseScPortfolios(listed.stdout);
  portfolioId = await chooseScPortfolio(prompter, portfolios);
  const resolvedScPath = scPath ?? detectScBinaryPath(undefined);
  return {
    owner,
    lunchMoneyAssetId,
    ...(resolvedScPath !== "sc" ? { scBinaryPath: resolvedScPath } : {}),
    ...(portfolioId ? { portfolioId } : {}),
  };
}

async function interactiveProfiles(
  prompter: SetupPrompter,
  client: LunchMoneySetupClient,
  _runners: SetupBrokerRunners,
  options: SetupCliOptions,
  filesystem: SetupFilesystem,
  writeProgress: SetupProgressWriter,
): Promise<{
  tradeRepublicProfiles: TradeRepublicProfile[];
  scalableCapitalProfiles: ScalableCapitalProfile[];
}> {
  const resumed = readResumedProfiles(filesystem);
  const { tradeRepublicProfiles, scalableCapitalProfiles } = resumed;
  if (tradeRepublicProfiles.length > 0 || scalableCapitalProfiles.length > 0) {
    prompter.print(statusOk("Resuming broker profiles from config.json"));
  }

  const brokers = await prompter.checkbox(
    "Which brokers should this config include? (Space to select, Enter to confirm)",
    [
      { name: "Trade Republic (pytr)", value: "trade-republic" },
      { name: "Scalable Capital (sc)", value: "scalable-capital" },
    ],
  );
  if (brokers.length === 0) {
    throw new Error("Select at least one broker (use Space to toggle a broker, then Enter)");
  }

  if (brokers.includes("trade-republic") && tradeRepublicProfiles.length === 0) {
    const defaultOwner = DEFAULT_PROFILE_LABEL;
    await forEachConfirmedRepeat(
      prompter,
      "Add another Trade Republic profile?",
      true,
      async () => {
        tradeRepublicProfiles.push(await addTradeRepublicProfile(prompter, client, options, defaultOwner));
        await writeProgress({ tradeRepublicProfiles, scalableCapitalProfiles, sharedCardLast4: [] });
        prompter.print(statusOk("Trade Republic profile saved to config.json"));
      },
    );
  }

  if (brokers.includes("scalable-capital") && scalableCapitalProfiles.length === 0) {
    const defaultOwner = DEFAULT_PROFILE_LABEL;
    await forEachConfirmedRepeat(
      prompter,
      "Add another Scalable Capital profile?",
      true,
      async () => {
        scalableCapitalProfiles.push(
          await addScalableCapitalProfile(prompter, client, _runners, options, defaultOwner),
        );
        await writeProgress({ tradeRepublicProfiles, scalableCapitalProfiles, sharedCardLast4: [] });
        prompter.print(statusOk("Scalable Capital profile saved to config.json"));
      },
    );
  }

  return { tradeRepublicProfiles, scalableCapitalProfiles };
}

function createSetupLunchMoneyClient(
  factory: (apiKey: string) => LunchMoneySetupClient,
): (apiKey: string) => LunchMoneySetupClient {
  return (apiKey: string): LunchMoneySetupClient => {
    const client = factory(apiKey);
    if (
      typeof client.manualAccounts?.getAll !== "function" ||
      typeof client.manualAccounts?.create !== "function" ||
      typeof client.categories?.getAll !== "function"
    ) {
      throw new TypeError("Lunch Money client is missing manualAccounts/categories API");
    }
    return client;
  };
}

function nonInteractiveProfiles(options: SetupCliOptions): {
  tradeRepublicProfiles: TradeRepublicProfile[];
  scalableCapitalProfiles: ScalableCapitalProfile[];
} {
  if (!options.tradeRepublic && !options.scalableCapital) {
    throw new Error("Non-interactive setup requires --trade-republic and/or --scalable-capital");
  }
  if (!options.owner) {
    throw new Error("Non-interactive setup requires --owner");
  }
  const tradeAsset = options.tradeRepublicAssetId ?? options.lunchMoneyAssetId;
  const scalableAsset = options.scalableAssetId ?? options.lunchMoneyAssetId;
  if (options.tradeRepublic && tradeAsset === null) {
    throw new Error("Non-interactive Trade Republic setup requires --trade-republic-asset-id or --lunch-money-asset-id");
  }
  if (options.scalableCapital && scalableAsset === null) {
    throw new Error("Non-interactive Scalable Capital setup requires --scalable-asset-id or --lunch-money-asset-id");
  }
  return {
    tradeRepublicProfiles: options.tradeRepublic
      ? [{ owner: options.owner, lunchMoneyAssetId: tradeAsset!, pytrCommand: ["pytr"] }]
      : [],
    scalableCapitalProfiles: options.scalableCapital
      ? [
          {
            owner: options.owner,
            lunchMoneyAssetId: scalableAsset!,
            ...(options.portfolioId ? { portfolioId: options.portfolioId } : {}),
          },
        ]
      : [],
  };
}

async function finishSetup(
  options: SetupCliOptions,
  deps: {
    prompter: SetupPrompter;
    filesystem: SetupFilesystem;
    runSync?: typeof runSyncCli;
    createLunchMoneyClient?: (apiKey: string) => CategoryMappingSetupClient;
  },
  apiKey: string,
  profiles: {
    tradeRepublicProfiles: TradeRepublicProfile[];
    scalableCapitalProfiles: ScalableCapitalProfile[];
  },
  sharedCardLast4: string[],
): Promise<SetupResult> {
  const written = await writeConfigFile(
    deps.filesystem,
    { sharedCardLast4, ...profiles },
    options.yes,
    deps.prompter,
  );
  process.env["LUNCH_MONEY_API_KEY"] = apiKey;
  let ranDryRun = false;
  if (!options.nonInteractive && (await deps.prompter.confirm("Run a dry-run sync now?", true))) {
    ranDryRun = true;
    await (deps.runSync ?? runSyncCli)(["--dry-run"], {
      logger: deps.prompter.print.bind(deps.prompter),
    });
  }
  if (
    ranDryRun &&
    (await deps.prompter.confirm("Run category mapping now (npm run setup -- --categories)?", true))
  ) {
    await runCategoryMappingSetup(options, {
      prompter: deps.prompter,
      filesystem: deps.filesystem,
      createClient: deps.createLunchMoneyClient ?? ((key) => createLunchMoneyClient(key)),
    });
  }
  return {
    kind: "completed",
    files: { configPath: written.path, envPath: "" },
    config: {
      sharedCardLast4,
      ...profiles,
      categoryMap: written.categoryMap,
      tagMap: written.tagMap,
    },
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
    apiKeyStore?: LunchMoneyApiKeyStore;
  },
): Promise<SetupResult> {
  assertNodeMajorVersion(deps.nodeVersion ?? process.version);

  const createClient =
    deps.createLunchMoneyClient ?? createSetupLunchMoneyClient(createLunchMoneyClient);
  const apiKeyStore = deps.apiKeyStore ?? createDefaultLunchMoneyApiKeyStore();

  const apiKey = await resolveSetupApiKey(
    options,
    deps.prompter,
    createClient,
    apiKeyStore,
    deps.filesystem,
  );

  const lmClient = createClient(apiKey);
  process.env["LUNCH_MONEY_API_KEY"] = apiKey;

  const writeProgress: SetupProgressWriter = async (partial) => {
    await writeConfigFile(deps.filesystem, partial, options.yes, deps.prompter, true);
  };

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
    : await interactiveProfiles(
        deps.prompter,
        lmClient,
        deps.runners,
        options,
        deps.filesystem,
        writeProgress,
      );

  const resumedCards = options.nonInteractive ? [] : readResumedProfiles(deps.filesystem).sharedCardLast4;
  let sharedRaw = "";
  if (!options.nonInteractive && resumedCards.length === 0) {
    sharedRaw = await deps.prompter.input("Shared card last-4 digits (comma-separated, optional)", "");
  }
  const sharedCardLast4 =
    resumedCards.length > 0 && !options.nonInteractive
      ? resumedCards
      : parseSharedCardLast4Input(sharedRaw);
  if (resumedCards.length > 0 && !options.nonInteractive) {
    deps.prompter.print(statusOk("Using shared card last-4 from config.json"));
  }
  loadConfig({
    lunchMoneyApiKey: apiKey,
    sharedCardLast4,
    ...profiles,
  });

  return finishSetup(options, deps, apiKey, profiles, sharedCardLast4);
}
