import type { LunchMoneyClient } from "@lunch-money/lunch-money-js-v2";
import type { PytrCliRunner, ScCliRunner } from "../shared/subprocess-cli.js";
import type { SyncConfig } from "../shared/config.js";

export interface PromptChoice<T extends string = string> {
  readonly name: string;
  readonly value: T;
  readonly description?: string;
  /** Pre-select this choice in checkbox prompts. */
  readonly checked?: boolean;
}

export interface SetupPrompter {
  password(message: string): Promise<string>;
  input(message: string, defaultValue?: string): Promise<string>;
  select<T extends string>(message: string, choices: readonly PromptChoice<T>[]): Promise<T>;
  checkbox(message: string, choices: readonly PromptChoice[]): Promise<string[]>;
  search(message: string, choices: readonly PromptChoice[]): Promise<string>;
  confirm(prompt: string, defaultYes?: boolean): Promise<boolean>;
  print(line: string): void;
  waitForEnter(message: string): Promise<void>;
}

export interface SetupFilesystem {
  exists(path: string): boolean;
  readText(path: string): string | null;
  writeText(path: string, content: string): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
}

export interface ManualAccountSummary {
  readonly id: number;
  readonly name: string;
}

export interface ScPortfolioSummary {
  readonly id: string;
  readonly name: string;
}

/** Read-only slice of the tags API: setup lists existing tags; sync creates missing ones on insert. */
export interface SetupTagsApi {
  getAll(): Promise<ReadonlyArray<{ readonly name: string }>>;
}

export type CategoryMappingSetupClient = Pick<LunchMoneyClient, "categories"> & {
  readonly tags?: SetupTagsApi;
};

export type LunchMoneySetupClient = Pick<LunchMoneyClient, "manualAccounts"> & CategoryMappingSetupClient;

export interface SetupBrokerRunners {
  readonly sc?: ScCliRunner;
  readonly pytr?: PytrCliRunner;
}

export interface WrittenSetupFiles {
  readonly configPath: string;
  readonly envPath: string;
}

export type SetupResult =
  | { readonly kind: "cancelled" }
  | {
      readonly kind: "completed";
      readonly files: WrittenSetupFiles;
      readonly config: Omit<SyncConfig, "lunchMoneyApiKey">;
    };
