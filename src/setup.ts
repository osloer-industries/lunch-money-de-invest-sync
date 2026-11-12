import { chmod, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createPytrCliRunner, createScCliRunner } from "./shared/subprocess-cli.js";
import { parseSetupCliOptions, SETUP_HELP_TEXT } from "./setup/setup-options.js";
import { runSetup } from "./setup/run-setup.js";
import type { SetupFilesystem, SetupPrompter } from "./setup/types.js";

function createLivePrompter(): SetupPrompter {
  const rl = createInterface({ input, output });
  return {
    async question(prompt, options) {
      if (options?.hidden) {
        process.stdout.write(prompt);
        const { createInterface: createRaw } = await import("node:readline");
        return await new Promise((resolve, reject) => {
          const raw = createRaw({ input: process.stdin, output: process.stdout, terminal: true });
          raw.question("", (answer) => {
            raw.close();
            process.stdout.write("\n");
            resolve(answer);
          });
          raw.on("SIGINT", () => reject(new Error("Interrupted")));
        });
      }
      return rl.question(prompt);
    },
    async confirm(message, defaultYes = false) {
      const hint = defaultYes ? "Y/n" : "y/N";
      const answer = (await rl.question(`${message} [${hint}] `)).trim().toLowerCase();
      if (answer.length === 0) {
        return defaultYes;
      }
      return answer === "y" || answer === "yes";
    },
    print(line) {
      output.write(`${line}\n`);
    },
    async waitForEnter(message) {
      await rl.question(`${message} `);
    },
  };
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
  const prompter = deps.prompter ?? createLivePrompter();
  await runSetup(cli, {
    prompter,
    filesystem: deps.filesystem ?? liveFilesystem,
    runners: deps.runners ?? {
      sc: createScCliRunner("sc"),
      pytr: createPytrCliRunner(["pytr"]),
    },
  });
}

async function main(): Promise<void> {
  await runSetupCli(process.argv.slice(2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
