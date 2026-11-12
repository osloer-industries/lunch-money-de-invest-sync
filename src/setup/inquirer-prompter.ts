import {
  checkbox as checkboxPrompt,
  confirm as confirmPrompt,
  input as inputPrompt,
  password as passwordPrompt,
  search as searchPrompt,
  select as selectPrompt,
} from "@inquirer/prompts";
import type { PromptChoice, SetupPrompter } from "./types.js";

type InquirerChoice = { name: string; value: string; description?: string };

function choiceValueFromPick<T extends string>(
  picked: string,
  choices: readonly PromptChoice<T>[],
): T {
  for (const choice of choices) {
    if (choice.value === picked) {
      return choice.value;
    }
  }
  throw new Error("Invalid prompt selection");
}

function mapPromptChoices(choices: readonly PromptChoice[]): InquirerChoice[] {
  return choices.map((choice) =>
    choice.description === undefined
      ? { name: choice.name, value: choice.value }
      : { name: choice.name, value: choice.value, description: choice.description },
  );
}

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
    async select<T extends string>(message: string, choices: readonly PromptChoice<T>[]) {
      const picked = await selectPrompt({ message, choices: mapPromptChoices(choices) });
      return choiceValueFromPick(picked, choices);
    },
    async checkbox(message, choices) {
      return checkboxPrompt({ message, choices: mapPromptChoices(choices) });
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
