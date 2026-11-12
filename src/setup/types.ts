import type { LunchMoneyClient } from "@lunch-money/lunch-money-js-v2";
import type { ScCliRunner } from "../scalable-capital/sc-cli.js";
import type { PytrCliRunner } from "../trade-republic/pytr-cli.js";
import type { SyncConfig } from "../shared/config.js";

export interface SetupPrompter {
  question(prompt: string, options?: { hidden?: boolean }): Promise<string>;
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

export type LunchMoneySetupClient = Pick<LunchMoneyClient, "manualAccounts">;

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
  | { readonly kind: "completed"; readonly files: WrittenSetupFiles; readonly config: Omit<SyncConfig, "lunchMoneyApiKey"> };
