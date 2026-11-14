import type { ScalableCapitalProfile, TradeRepublicProfile } from "../shared/config.js";
import type { SetupFilesystem, SetupPrompter } from "./types.js";
import { readResumedProfiles } from "./resume-config.js";
import { statusOk, statusWarn } from "./setup-status.js";

export type SavedProfilesChoice = "keep" | "edit" | "reset";

type SetupProgressSnapshot = {
  tradeRepublicProfiles: TradeRepublicProfile[];
  scalableCapitalProfiles: ScalableCapitalProfile[];
  sharedCardLast4: string[];
};

export type SavedBrokerProfilesStepResult =
  | {
      readonly kind: "finished";
      readonly tradeRepublicProfiles: TradeRepublicProfile[];
      readonly scalableCapitalProfiles: ScalableCapitalProfile[];
    }
  | {
      readonly kind: "continue";
      readonly tradeRepublicProfiles: TradeRepublicProfile[];
      readonly scalableCapitalProfiles: ScalableCapitalProfile[];
    };

export async function promptSavedProfilesChoice(prompter: SetupPrompter): Promise<SavedProfilesChoice> {
  return prompter.select("Broker profiles are already saved. What would you like to do?", [
    { name: "Keep saved profiles", value: "keep" },
    { name: "Edit (add or change brokers)", value: "edit" },
    { name: "Start over (clear saved profiles)", value: "reset" },
  ]);
}

async function applySavedProfilesChoice(
  prompter: SetupPrompter,
  choice: SavedProfilesChoice,
  resumed: ReturnType<typeof readResumedProfiles>,
): Promise<{ tradeRepublicProfiles: TradeRepublicProfile[]; scalableCapitalProfiles: ScalableCapitalProfile[] }> {
  if (choice === "keep") {
    prompter.print(statusOk("Keeping saved broker profiles"));
    return {
      tradeRepublicProfiles: [...resumed.tradeRepublicProfiles],
      scalableCapitalProfiles: [...resumed.scalableCapitalProfiles],
    };
  }
  if (choice === "reset") {
    prompter.print(statusWarn("Cleared saved broker profiles — you will choose brokers again"));
    return { tradeRepublicProfiles: [], scalableCapitalProfiles: [] };
  }
  return {
    tradeRepublicProfiles: [...resumed.tradeRepublicProfiles],
    scalableCapitalProfiles: [...resumed.scalableCapitalProfiles],
  };
}

/**
 * Offer Keep / Edit / Start over when broker profiles already exist on disk.
 * Does not re-check broker sessions (#70 owns resumed-session checks).
 */
export async function runSavedBrokerProfilesStep(
  prompter: SetupPrompter,
  filesystem: SetupFilesystem,
  writeProgress: (snapshot: SetupProgressSnapshot) => Promise<void>,
): Promise<SavedBrokerProfilesStepResult> {
  const resumed = readResumedProfiles(filesystem);
  if (resumed.tradeRepublicProfiles.length === 0 && resumed.scalableCapitalProfiles.length === 0) {
    return {
      kind: "continue",
      tradeRepublicProfiles: [],
      scalableCapitalProfiles: [],
    };
  }
  const choice = await promptSavedProfilesChoice(prompter);
  const profiles = await applySavedProfilesChoice(prompter, choice, resumed);
  if (choice === "reset") {
    await writeProgress({
      tradeRepublicProfiles: profiles.tradeRepublicProfiles,
      scalableCapitalProfiles: profiles.scalableCapitalProfiles,
      sharedCardLast4: resumed.sharedCardLast4,
    });
  }
  if (choice === "keep") {
    return { kind: "finished", ...profiles };
  }
  return { kind: "continue", ...profiles };
}

export async function promptSharedCardDigits(
  prompter: SetupPrompter,
  resumedCards: string[],
  parseInput: (raw: string) => string[],
  promptInput: () => Promise<string>,
): Promise<string[]> {
  if (resumedCards.length === 0) {
    return parseInput(await promptInput());
  }
  const choice = await prompter.select("Shared card digits are already saved. What would you like to do?", [
    { name: `Keep (${resumedCards.join(", ")})`, value: "keep" },
    { name: "Enter different digits", value: "edit" },
  ]);
  if (choice === "keep") {
    prompter.print(statusOk("Keeping saved shared card digits"));
    return resumedCards;
  }
  return parseInput(await promptInput());
}