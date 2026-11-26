import { ZodError, type z } from "zod";

type ZodIssue = z.core.$ZodIssue;

export const MISSING_LUNCH_MONEY_API_KEY_MESSAGE =
  "Lunch Money API key is not stored — run npm run setup (or npm run setup -- --replace-api-key).";

export const CONFIG_JSON_BACKUP_FILENAME = "config.json.bak";

export const CORRUPT_CONFIG_JSON_MESSAGE =
  "Saved settings could not be read — setup can back them up and start fresh.";

export const INVALID_CONFIG_JSON_MESSAGE = CORRUPT_CONFIG_JSON_MESSAGE;

const REMOVED_CONFIG_KEY_FIX: Record<string, string> = {
  phoneNumber: "delete phoneNumber and run `pytr login` locally",
  pin: "delete pin and run `pytr login` locally",
  proxyUrl: "delete proxyUrl and use the official `sc` CLI (`sc login`)",
};

function formatIssuePath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === "number") {
      return `${formatted}[${String(segment)}]`;
    }
    const label = String(segment);
    return formatted.length === 0 ? label : `${formatted}.${label}`;
  }, "");
}

function unrecognizedKeyFromIssue(issue: ZodIssue): string | undefined {
  if (issue.code !== "unrecognized_keys") {
    return undefined;
  }
  if (!("keys" in issue)) {
    return undefined;
  }
  if (!Array.isArray(issue.keys) || issue.keys.length === 0) {
    return undefined;
  }
  const firstKey = issue.keys[0];
  return typeof firstKey === "string" ? firstKey : undefined;
}

function formatSingleZodIssue(issue: ZodIssue): string {
  const path = formatIssuePath(issue.path);
  const unknownKey = unrecognizedKeyFromIssue(issue);
  if (unknownKey) {
    const fix = REMOVED_CONFIG_KEY_FIX[unknownKey] ?? `delete unrecognized key "${unknownKey}"`;
    const pathPrefix = path.length > 0 ? `${path}.` : "";
    return `config.json ${pathPrefix}${unknownKey}: ${fix}`;
  }
  const label = path.length > 0 ? `config.json ${path}` : "config.json";
  return `${label}: ${issue.message}`;
}

function formatZodConfigError(error: ZodError): string {
  const lines = error.issues.map(formatSingleZodIssue);
  const unique = [...new Set(lines)];
  if (unique.length === 1) {
    const only = unique[0];
    if (only === undefined) {
      return "config.json failed validation";
    }
    return only;
  }
  return `config.json failed validation — ${unique.join("; ")}`;
}

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
    return formatZodConfigError(error);
  }
  if (error instanceof Error) {
    if (error.message.includes("invalid JSON")) {
      return INVALID_CONFIG_JSON_MESSAGE;
    }
    if (
      error.message.includes(CONFIG_BASENAME_ONLY) ||
      /must be read from the working directory/i.test(error.message)
    ) {
      return error.message;
    }
  }
  return null;
}

const CONFIG_BASENAME_ONLY = "config.json";
