import path from "node:path";
import { readConfigJsonObject, storedMapsFromConfigObject, writeConfigJsonObject } from "./config-json.js";
import { loadConfig } from "../shared/config.js";
import { ensureReadableConfigForSetup } from "./corrupt-config-recovery.js";
import { promptSharedCardDigits, runSavedBrokerProfilesStep } from "./setup-profile-resume.js";
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
import { SHARED_CARD_PROMPT_EXPLANATION } from "../dry-run-review/shared-card-copy.js";
import { runCategoryMappingSetup } from "./run-category-mapping.js";
import { isLunchMoneyUnauthorized } from "./lunch-money-errors.js";
import { createManualAccountOrReuse, type ManualAccountKind } from "./manual-account.js";
import { statusError, statusOk, statusWarn } from "./setup-status.js";
import { forEachConfirmedRepeat, forEachSequentially } from "../shared/sequential-profiles.js";
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
  PromptChoice,
  SetupBrokerRunners,
  SetupFilesystem,
  SetupPrompter,
  SetupResult,
} from "./types.js";
import type { BrokerLoginEventSink } from "../shared/cli-events.js";

export interface SetupNonInteractiveJsonSummary {
  readonly ok: true;
  readonly mode: "non-interactive";
  readonly configPath: string;
  readonly tradeRepublicProfileCount: number;
  readonly scalableCapitalProfileCount: number;
  readonly sharedCardLast4: readonly string[];
}

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
    prompter.print(
      statusWarn("Lunch Money API key cannot be empty — paste your developer key from Lunch Money settings"),
    );
    return promptApiKeyWithFactory(prompter, createClient);
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

interface ManualAccountSpec {
  readonly accountName: string;
  readonly institution: string;
  readonly kind: ManualAccountKind;
  readonly createMessage: string;
}

function cashAccountSpec(brokerLabel: string, owner: string): ManualAccountSpec {
  const accountName = `${brokerLabel} (${owner})`;
  return {
    accountName,
    institution: brokerLabel,
    kind: { type: "investment" },
    createMessage: `Create Lunch Money manual account "${accountName}" (EUR, investment, starting cash balance 0)? This account tracks cash movements from sync, not portfolio market value — set starting cash on the Accounts page if needed.`,
  };
}

function holdingsAccountSpec(brokerLabel: string, owner: string): ManualAccountSpec {
  const accountName = `${brokerLabel} Holdings (${owner})`;
  return {
    accountName,
    institution: brokerLabel,
    kind: { type: "investment" },
    createMessage: `Create Lunch Money manual account "${accountName}" (EUR, investment, balance 0)? Sync sets its balance to the securities market value (cash stays in the cash account).`,
  };
}

function savingsAccountSpec(owner: string): ManualAccountSpec {
  const accountName = `Scalable Tagesgeld (${owner})`;
  return {
    accountName,
    institution: "Scalable Capital",
    kind: { type: "cash", subtype: "savings" },
    createMessage: `Create Lunch Money manual account "${accountName}" (EUR, cash / savings, balance 0)? Sync sets its balance to the overnight savings balance.`,
  };
}

async function chooseManualAccount(
  prompter: SetupPrompter,
  client: LunchMoneySetupClient,
  spec: ManualAccountSpec,
): Promise<number> {
  const { accountName } = spec;
  const accounts = await client.manualAccounts.getAll();
  const choice = await prompter.select(
    `Lunch Money manual account for ${accountName}`,
    manualAccountChoices(accounts, accountName),
  );
  if (choice === NEW_MANUAL_ACCOUNT) {
    const create = await prompter.confirm(spec.createMessage, false);
    if (!create) {
      return chooseManualAccount(prompter, client, spec);
    }
    const createdId = await createManualAccountOrReuse(prompter, client, accountName, spec.institution, spec.kind);
    if (createdId !== null) {
      return createdId;
    }
    return chooseManualAccount(prompter, client, spec);
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
    const ok = await prompter.confirm(`${basename} exists — replace everything in it?`, false);
    if (ok) {
      return;
    }
    const keep = await prompter.confirm("Keep your saved settings and continue setup?", true);
    if (!keep) {
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
  const lunchMoneyAssetId = await chooseManualAccount(prompter, client, cashAccountSpec(brokerLabel, owner));
  return { owner, lunchMoneyAssetId };
}

const HOLDINGS_QUESTION = "Track portfolio market value in a separate Lunch Money account?";
const SAVINGS_QUESTION = "Track your Scalable overnight savings (Tagesgeld) balance in a separate Lunch Money account?";

/** Asks (default Yes) whether to track a balance-only account and returns its id, or undefined. */
async function offerBalanceAccount(
  prompter: SetupPrompter,
  client: LunchMoneySetupClient,
  question: string,
  spec: ManualAccountSpec,
): Promise<number | undefined> {
  if (!(await prompter.confirm(question, true))) {
    return undefined;
  }
  return chooseManualAccount(prompter, client, spec);
}

async function offerHoldingsAccount(
  prompter: SetupPrompter,
  client: LunchMoneySetupClient,
  brokerLabel: string,
  owner: string,
): Promise<{ holdingsAccountId?: number }> {
  const id = await offerBalanceAccount(prompter, client, HOLDINGS_QUESTION, holdingsAccountSpec(brokerLabel, owner));
  return id === undefined ? {} : { holdingsAccountId: id };
}

async function offerSavingsAccount(
  prompter: SetupPrompter,
  client: LunchMoneySetupClient,
  owner: string,
): Promise<{ savingsAccountId?: number }> {
  const id = await offerBalanceAccount(prompter, client, SAVINGS_QUESTION, savingsAccountSpec(owner));
  return id === undefined ? {} : { savingsAccountId: id };
}

/**
 * Resumed profiles saved before balance tracking existed: offer the missing accounts once per setup
 * run (a "no" is not persisted). Returns true when any profile changed.
 */
async function offerMissingBalanceAccounts(
  prompter: SetupPrompter,
  client: LunchMoneySetupClient,
  tradeRepublicProfiles: TradeRepublicProfile[],
  scalableCapitalProfiles: ScalableCapitalProfile[],
): Promise<boolean> {
  let changed = false;
  await forEachSequentially([...tradeRepublicProfiles.entries()], async ([index, profile]) => {
    if (profile.holdingsAccountId !== undefined) {
      return;
    }
    prompter.print(`Trade Republic profile "${profile.owner}" has no holdings account yet.`);
    const added = await offerHoldingsAccount(prompter, client, "Trade Republic", profile.owner);
    if (added.holdingsAccountId !== undefined) {
      tradeRepublicProfiles[index] = { ...profile, ...added };
      changed = true;
    }
  });
  await forEachSequentially([...scalableCapitalProfiles.entries()], async ([index, profile]) => {
    if (profile.holdingsAccountId !== undefined && profile.savingsAccountId !== undefined) {
      return;
    }
    prompter.print(`Scalable Capital profile "${profile.owner}" can track more balances.`);
    const holdings =
      profile.holdingsAccountId === undefined
        ? await offerHoldingsAccount(prompter, client, "Scalable Capital", profile.owner)
        : {};
    const savings =
      profile.savingsAccountId === undefined ? await offerSavingsAccount(prompter, client, profile.owner) : {};
    if (Object.keys(holdings).length > 0 || Object.keys(savings).length > 0) {
      scalableCapitalProfiles[index] = { ...profile, ...holdings, ...savings };
      changed = true;
    }
  });
  return changed;
}

type SetupProgressWriter = (partial: {
  tradeRepublicProfiles: TradeRepublicProfile[];
  scalableCapitalProfiles: ScalableCapitalProfile[];
  sharedCardLast4: string[];
}) => Promise<void>;

const BROKER_CHECKBOX_MESSAGE =
  "Which brokers should this config include? (Space to select, Enter to confirm)";

function brokerCheckboxChoices(
  tradeRepublicProfiles: readonly TradeRepublicProfile[],
  scalableCapitalProfiles: readonly ScalableCapitalProfile[],
): PromptChoice[] {
  return [
    {
      name: "Trade Republic (pytr)",
      value: "trade-republic",
      checked: tradeRepublicProfiles.length > 0,
    },
    {
      name: "Scalable Capital (sc)",
      value: "scalable-capital",
      checked: scalableCapitalProfiles.length > 0,
    },
  ];
}

async function promptIncludedBrokers(
  prompter: SetupPrompter,
  tradeRepublicProfiles: readonly TradeRepublicProfile[],
  scalableCapitalProfiles: readonly ScalableCapitalProfile[],
  emptySelectionAlreadyWarned: boolean,
): Promise<string[]> {
  const brokers = await prompter.checkbox(
    BROKER_CHECKBOX_MESSAGE,
    brokerCheckboxChoices(tradeRepublicProfiles, scalableCapitalProfiles),
  );
  if (brokers.length > 0) {
    return brokers;
  }
  if (emptySelectionAlreadyWarned) {
    throw new Error("Select at least one broker (use Space to toggle a broker, then Enter)");
  }
  prompter.print(statusWarn("Select at least one broker (Space to toggle, then Enter)"));
  return promptIncludedBrokers(prompter, tradeRepublicProfiles, scalableCapitalProfiles, true);
}

function confirmDropSavedProfiles(
  prompter: SetupPrompter,
  brokerLabel: string,
  profiles: readonly { owner: string }[],
): Promise<boolean> {
  if (profiles.length === 0) {
    return Promise.resolve(true);
  }
  return prompter.confirm(`Remove saved ${brokerLabel} profile(s) (${profileLabels(profiles)})?`, false);
}

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
  const holdings = await offerHoldingsAccount(prompter, client, "Trade Republic", owner);
  return {
    owner,
    lunchMoneyAssetId,
    ...holdings,
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
  const holdings = await offerHoldingsAccount(prompter, client, "Scalable Capital", owner);
  const savings = await offerSavingsAccount(prompter, client, owner);
  let portfolioId: string | undefined;
  const listed = await scRunner.run(["broker", "portfolios", "--json"]);
  const portfolios = parseScPortfolios(listed.stdout);
  portfolioId = await chooseScPortfolio(prompter, portfolios);
  const resolvedScPath = scPath ?? detectScBinaryPath(undefined);
  return {
    owner,
    lunchMoneyAssetId,
    ...holdings,
    ...savings,
    ...(resolvedScPath !== "sc" ? { scBinaryPath: resolvedScPath } : {}),
    ...(portfolioId ? { portfolioId } : {}),
  };
}

function profileLabels(profiles: ReadonlyArray<{ owner: string }>): string {
  return profiles.map((profile) => profile.owner).join(", ");
}

async function recheckResumedSessions(
  prompter: SetupPrompter,
  runners: SetupBrokerRunners,
  options: SetupCliOptions,
  tradeRepublicProfiles: readonly TradeRepublicProfile[],
  scalableCapitalProfiles: readonly ScalableCapitalProfile[],
): Promise<void> {
  if (tradeRepublicProfiles.length > 0) {
    prompter.print(
      statusOk(`Using existing Trade Republic profile(s) from config.json: ${profileLabels(tradeRepublicProfiles)}`),
    );
    await forEachSequentially(tradeRepublicProfiles, async (profile) => {
      const pytrCommand = profile.pytrCommand?.length ? profile.pytrCommand : ["pytr"];
      await ensurePytrReady(
        runners.pytr ?? createPytrCliRunner(pytrCommand),
        prompter,
        { enabled: true, skipCheck: options.skipBrokerCheck },
        { pytrCommand },
      );
    });
  }
  if (scalableCapitalProfiles.length > 0) {
    prompter.print(
      statusOk(`Using existing Scalable Capital profile(s) from config.json: ${profileLabels(scalableCapitalProfiles)}`),
    );
    await forEachSequentially(scalableCapitalProfiles, async (profile) => {
      await ensureScCliReady(
        runners.sc ?? createScCliRunner(detectScBinaryPath(profile.scBinaryPath)),
        prompter,
        { enabled: true, skipCheck: options.skipBrokerCheck },
      );
    });
  }
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
  await ensureReadableConfigForSetup(filesystem, prompter);
  const savedStep = await runSavedBrokerProfilesStep(prompter, filesystem, writeProgress);
  if (savedStep.kind === "finished") {
    return {
      tradeRepublicProfiles: savedStep.tradeRepublicProfiles,
      scalableCapitalProfiles: savedStep.scalableCapitalProfiles,
    };
  }
  const tradeRepublicProfiles = [...savedStep.tradeRepublicProfiles];
  const scalableCapitalProfiles = [...savedStep.scalableCapitalProfiles];

  let brokers = await promptIncludedBrokers(
    prompter,
    tradeRepublicProfiles,
    scalableCapitalProfiles,
    false,
  );

  if (!brokers.includes("trade-republic")) {
    if (await confirmDropSavedProfiles(prompter, "Trade Republic", tradeRepublicProfiles)) {
      tradeRepublicProfiles.length = 0;
    } else {
      brokers = [...brokers, "trade-republic"];
    }
  }
  if (!brokers.includes("scalable-capital")) {
    if (await confirmDropSavedProfiles(prompter, "Scalable Capital", scalableCapitalProfiles)) {
      scalableCapitalProfiles.length = 0;
    } else {
      brokers = [...brokers, "scalable-capital"];
    }
  }
  await recheckResumedSessions(prompter, _runners, options, tradeRepublicProfiles, scalableCapitalProfiles);
  if (await offerMissingBalanceAccounts(prompter, client, tradeRepublicProfiles, scalableCapitalProfiles)) {
    await writeProgress({
      tradeRepublicProfiles,
      scalableCapitalProfiles,
      sharedCardLast4: readResumedProfiles(filesystem).sharedCardLast4,
    });
    prompter.print(statusOk("Balance tracking accounts saved to config.json"));
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

function holdingsAccountIdField(id: number | null): { holdingsAccountId?: number } {
  return id === null ? {} : { holdingsAccountId: id };
}

function savingsAccountIdField(id: number | null): { savingsAccountId?: number } {
  return id === null ? {} : { savingsAccountId: id };
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
      ? [
          {
            owner: options.owner,
            lunchMoneyAssetId: tradeAsset!,
            ...holdingsAccountIdField(options.tradeRepublicHoldingsAccountId),
            pytrCommand: ["pytr"],
          },
        ]
      : [],
    scalableCapitalProfiles: options.scalableCapital
      ? [
          {
            owner: options.owner,
            lunchMoneyAssetId: scalableAsset!,
            ...holdingsAccountIdField(options.scalableHoldingsAccountId),
            ...savingsAccountIdField(options.scalableSavingsAccountId),
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
    true,
  );
  process.env["LUNCH_MONEY_API_KEY"] = apiKey;
  let ranDryRun = false;
  let readyForRealSync = false;
  if (!options.nonInteractive && (await deps.prompter.confirm("Run a dry-run sync now?", true))) {
    ranDryRun = true;
    const dryRunResult = await (deps.runSync ?? runSyncCli)(["--dry-run"], {
      logger: deps.prompter.print.bind(deps.prompter),
      prompter: deps.prompter,
      filesystem: deps.filesystem,
    });
    readyForRealSync = dryRunResult?.dryRunProceed === true;
  }
  if (readyForRealSync && (await deps.prompter.confirm("Run a real sync now (writes to Lunch Money)?", false))) {
    await (deps.runSync ?? runSyncCli)([], {
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

async function runNonInteractiveBrokerPreflight(
  options: SetupCliOptions,
  deps: {
    runners: SetupBrokerRunners;
    prompter: SetupPrompter;
    loginEvents?: BrokerLoginEventSink;
  },
): Promise<void> {
  const brokerContext = deps.loginEvents ? { loginEvents: deps.loginEvents } : {};
  await ensurePytrReady(
    deps.runners.pytr,
    deps.prompter,
    {
      enabled: options.tradeRepublic,
      skipCheck: options.skipBrokerCheck,
    },
    brokerContext,
  );
  await ensureScCliReady(
    deps.runners.sc,
    deps.prompter,
    {
      enabled: options.scalableCapital,
      skipCheck: options.skipBrokerCheck,
    },
    brokerContext,
  );
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
    loginEvents?: BrokerLoginEventSink;
    onNonInteractiveComplete?: (summary: SetupNonInteractiveJsonSummary) => void;
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
    await runNonInteractiveBrokerPreflight(options, deps);
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

  const sharedCardLast4 = options.nonInteractive
    ? []
    : await promptSharedCardDigits(
        deps.prompter,
        readResumedProfiles(deps.filesystem).sharedCardLast4,
        parseSharedCardLast4Input,
        () => {
          deps.prompter.print(SHARED_CARD_PROMPT_EXPLANATION);
          return deps.prompter.input("Shared card last-4 digits (comma-separated, optional)", "");
        },
      );
  loadConfig({
    lunchMoneyApiKey: apiKey,
    sharedCardLast4,
    ...profiles,
  });

  const result = await finishSetup(options, deps, apiKey, profiles, sharedCardLast4);
  emitNonInteractiveJsonSummary(options, result, deps.onNonInteractiveComplete);
  return result;
}

function emitNonInteractiveJsonSummary(
  options: SetupCliOptions,
  result: SetupResult,
  onComplete: ((summary: SetupNonInteractiveJsonSummary) => void) | undefined,
): void {
  if (!options.nonInteractive || result.kind !== "completed" || !onComplete) {
    return;
  }
  onComplete({
    ok: true,
    mode: "non-interactive",
    configPath: result.files.configPath,
    tradeRepublicProfileCount: result.config.tradeRepublicProfiles.length,
    scalableCapitalProfileCount: result.config.scalableCapitalProfiles.length,
    sharedCardLast4: result.config.sharedCardLast4,
  });
}
