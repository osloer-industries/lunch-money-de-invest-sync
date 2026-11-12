import {
  checkbox as checkboxPrompt,
  confirm as confirmPrompt,
  input as inputPrompt,
  password as passwordPrompt,
  search as searchPrompt,
  select as selectPrompt,
} from "@inquirer/prompts";
import type { PromptChoice, SetupPrompter } from "./types.js";

function filterChoices(choices: readonly PromptChoice[], term: string | undefined): PromptChoice[] {
  const q = (term ?? "").trim().toLowerCase();
  if (q.length === 0) {
    return [...choices];
  }
  return choices.filter(
    (choice) => choice.name.toLowerCase().includes(q) || choice.value.toLowerCase().includes(q),
  );
}

export function createInquirerPrompter(): SetupPrompter {
  return {
    async password(message) {
      return passwordPrompt({ message });
    },
    async input(message, defaultValue) {
      return inputPrompt({ message, default: defaultValue });
    },
    async select(message, choices) {
      return selectPrompt({
        message,
        choices: choices.map((choice) =>
          choice.description === undefined
            ? { name: choice.name, value: choice.value }
            : { name: choice.name, value: choice.value, description: choice.description },
        ),
      });
    },
    async checkbox(message, choices) {
      return checkboxPrompt({
        message,
        choices: choices.map((choice) =>
          choice.description === undefined
            ? { name: choice.name, value: choice.value }
            : { name: choice.name, value: choice.value, description: choice.description },
        ),
      });
    },
    async search(message, choices) {
      return searchPrompt({
        message,
        source: (term) => filterChoices(choices, term),
      });
    },
    async confirm(message, defaultYes = false) {
      return confirmPrompt({ message, default: defaultYes });
    },
    print(line) {
      process.stdout.write(`${line}\n`);
    },
    async waitForEnter(message) {
      await inputPrompt({ message });
    },
  };
}
