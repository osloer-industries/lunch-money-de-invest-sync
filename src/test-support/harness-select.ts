import { z } from "zod";
import type { PromptChoice } from "../setup/types.js";

/** Test-harness select: returns a configured answer, including invalid options used in negative tests. */
export function harnessSelectAnswer<T extends string>(
  choices: readonly PromptChoice<T>[],
  configured: string | undefined,
): Promise<T> {
  if (configured === undefined) {
    return Promise.resolve(z.custom<T>((value) => value === "").parse(""));
  }
  const match = choices.find((choice) => choice.value === configured);
  if (match) {
    return Promise.resolve(match.value);
  }
  return Promise.resolve(z.custom<T>((value) => typeof value === "string").parse(configured));
}