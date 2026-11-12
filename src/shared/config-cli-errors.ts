import { ZodError } from "zod";

export const MISSING_LUNCH_MONEY_API_KEY_MESSAGE =
  "LUNCH_MONEY_API_KEY is not set — run npm run setup or add the key to .env in the repo root.";

export const INVALID_CONFIG_JSON_MESSAGE = "config.json is invalid — fix or delete it and run npm run setup again.";

function isMissingApiKeyZodError(error: ZodError): boolean {
  return error.issues.some(
    (issue) =>
      issue.path.length === 1 &&
      issue.path[0] === "lunchMoneyApiKey" &&
      (issue.code === "invalid_type" || issue.code === "too_small"),
  );
}

/** Maps config load failures to short CLI messages (no stack traces). */
export function formatConfigLoadError(error: unknown): string | null {
  if (error instanceof ZodError) {
    if (isMissingApiKeyZodError(error)) {
      return MISSING_LUNCH_MONEY_API_KEY_MESSAGE;
    }
    return "config.json or environment values failed validation — check config.json and .env.";
  }
  if (error instanceof Error) {
    if (error.message.includes("invalid JSON")) {
      return INVALID_CONFIG_JSON_MESSAGE;
    }
    if (error.message.includes(CONFIG_BASENAME_ONLY)) {
      return error.message;
    }
    if (/must be read from the working directory/i.test(error.message)) {
      return error.message;
    }
  }
  return null;
}

const CONFIG_BASENAME_ONLY = "config.json";
