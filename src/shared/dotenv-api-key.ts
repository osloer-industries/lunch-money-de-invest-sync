import type { SetupFilesystem } from "../setup/types.js";

const DOTENV_BASENAME = ".env";
const API_KEY_PREFIX = "LUNCH_MONEY_API_KEY=";

export function readApiKeyFromDotenvText(text: string): string | null {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(API_KEY_PREFIX)) {
      const value = trimmed.slice(API_KEY_PREFIX.length).trim();
      if (value.length > 0) {
        return value;
      }
    }
  }
  return null;
}

export function stripApiKeyFromDotenvText(text: string): string {
  const kept = text.split("\n").filter((line) => !line.trim().startsWith(API_KEY_PREFIX));
  const body = kept.join("\n");
  if (body.length === 0) {
    return "";
  }
  return body.endsWith("\n") ? body : `${body}\n`;
}

export async function stripApiKeyFromDotenvFile(filesystem: SetupFilesystem, cwd: string): Promise<boolean> {
  const envPath = `${cwd}/${DOTENV_BASENAME}`;
  if (!filesystem.exists(envPath)) {
    return false;
  }
  const text = filesystem.readText(envPath);
  if (!text?.includes(API_KEY_PREFIX)) {
    return false;
  }
  const stripped = stripApiKeyFromDotenvText(text);
  if (stripped.length === 0) {
    await filesystem.writeText(envPath, "");
  } else {
    await filesystem.writeText(envPath, stripped);
    await filesystem.chmod(envPath, 0o600);
  }
  return true;
}