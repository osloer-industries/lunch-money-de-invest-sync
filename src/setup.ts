import { chmod, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { createPytrCliRunner, createScCliRunner } from "./shared/subprocess-cli.js";
import { createInquirerPrompter } from "./setup/inquirer-prompter.js";
import { parseSetupCliOptions, SETUP_HELP_TEXT, type SetupCliOptions } from "./setup/setup-options.js";
import { runCategoryMappingSetup } from "./setup/run-category-mapping.js";
import { runSetup } from "./setup/run-setup.js";
import { createLunchMoneyClient } from "./lunch-money/client.js";
import type { SetupFilesystem, SetupPrompter } from "./setup/types.js";
import { isPromptInterrupted, reportSetupError, statusOk, statusWarn } from "./setup/setup-status.js";
import { createNdjsonEventWriter } from "./shared/cli-events.js";
import { writeStdoutJson } from "./shared/scriptable-cli.js";
import {
  clearStoredLunchMoneyApiKey,
  ensureLunchMoneyApiKeyForCli,
} from "./shared/bootstrap-lunch-money-api-key.js";
import { createDefaultLunchMoneyApiKeyStore } from "./shared/lunch-money-api-key-store.js";
export function assertInteractiveSetupAllowed(options: SetupCliOptions): void {
  if (options.help || options.nonInteractive || options.json) {
    return;
  }
  if (!process.stdin.isTTY) {
    throw new Error(
      "Interactive setup requires a TTY (stdin is not attached to a terminal). Pass --non-interactive or --json for scripted setup.",
    );
  }
}

const liveFilesystem: SetupFilesystem = {
  exists: existsSync,
  readText(path) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  },
  writeText: (path, content) => writeFile(path, content, "utf8"),
  chmod,
};

function rejectScriptedSetupCategories(cli: SetupCliOptions): void {
  if (cli.categories && (cli.json || cli.nonInteractive)) {
    throw new Error(
      "Category mapping during setup requires an interactive terminal. Use `npm run categories -- apply` for scripted mapping.",
    );
  }
}
async function handleClearApiKey(cli: SetupCliOptions, logger: (line: string) => void, store: ReturnType<typeof createDefaultLunchMoneyApiKeyStore>): Promise<boolean> {
  if (!cli.clearApiKey || cli.categories) {
    return false;
  }
  const removed = await clearStoredLunchMoneyApiKey(store);
  logger(
    removed
      ? statusOk("Removed Lunch Money API key from secure storage")
      : statusWarn("No Lunch Money API key was stored"),
  );
  return !cli.replaceApiKey;
}

export async function runSetupCli(
  argv: readonly string[],
  deps: {
    prompter?: SetupPrompter;
    filesystem?: SetupFilesystem;
    runners?: import("./setup/types.js").SetupBrokerRunners;
    logger?: (line: string) => void;
  } = {},
): Promise<void> {
  const cli = parseSetupCliOptions(argv);
  const logger = deps.logger ?? console.log;
  if (cli.help) {
    (deps.logger ?? console.log)(SETUP_HELP_TEXT);
    return;
  }
  assertInteractiveSetupAllowed(cli);
  rejectScriptedSetupCategories(cli);
  const prompter = deps.prompter ?? createInquirerPrompter();
  const filesystem = deps.filesystem ?? liveFilesystem;
  const apiKeyStore = createDefaultLunchMoneyApiKeyStore();
  if (await handleClearApiKey(cli, logger, apiKeyStore)) {
    return;
  }
  if (cli.categories) {
    await ensureLunchMoneyApiKeyForCli(apiKeyStore);
    await runCategoryMappingSetup(cli, {
      prompter,
      filesystem,
      createClient: (apiKey) => createLunchMoneyClient(apiKey),
      apiKeyStore,
    });
    return;
  }
  const loginEvents = cli.events ? createNdjsonEventWriter() : undefined;
  await runSetup(cli, {
    prompter,
    filesystem,
    apiKeyStore,
    runners: deps.runners ?? {
      sc: createScCliRunner("sc"),
      pytr: createPytrCliRunner(["pytr"]),
    },
    ...(loginEvents ? { loginEvents } : {}),
    ...(cli.json
      ? {
          onNonInteractiveComplete: (summary) => {
            writeStdoutJson(summary);
          },
        }
      : {}),
  });
}

const entryScript = process.argv[1];
if (entryScript !== undefined && fileURLToPath(import.meta.url) === nodePath.resolve(entryScript)) {
  try {
    await runSetupCli(process.argv.slice(2));
  } catch (error: unknown) {
    reportSetupError(error);
    process.exitCode = isPromptInterrupted(error) ? 130 : 1;
  }
}
