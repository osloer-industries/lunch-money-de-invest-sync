import { chmod, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { createPytrCliRunner, createScCliRunner } from "./shared/subprocess-cli.js";
import { createInquirerPrompter } from "./setup/inquirer-prompter.js";
import { parseSetupCliOptions, SETUP_HELP_TEXT, type SetupCliOptions } from "./setup/setup-options.js";
import { runSetup } from "./setup/run-setup.js";
import type { SetupFilesystem, SetupPrompter } from "./setup/types.js";

export function assertInteractiveSetupAllowed(options: SetupCliOptions): void {
  if (options.help || options.nonInteractive) {
    return;
  }
  if (!process.stdin.isTTY) {
    throw new Error(
      "Interactive setup requires a TTY (stdin is not attached to a terminal). Pass --non-interactive for scripted setup.",
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
  if (cli.help) {
    (deps.logger ?? console.log)(SETUP_HELP_TEXT);
    return;
  }
  assertInteractiveSetupAllowed(cli);
  const prompter = deps.prompter ?? createInquirerPrompter();
  await runSetup(cli, {
    prompter,
    filesystem: deps.filesystem ?? liveFilesystem,
    runners: deps.runners ?? {
      sc: createScCliRunner("sc"),
      pytr: createPytrCliRunner(["pytr"]),
    },
  });
}

const entryScript = process.argv[1];
if (entryScript !== undefined && fileURLToPath(import.meta.url) === nodePath.resolve(entryScript)) {
  try {
    await runSetupCli(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(error);
    process.exitCode = 1;
  }
}
