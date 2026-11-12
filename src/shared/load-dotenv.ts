import { existsSync } from "node:fs";
import path from "node:path";

const DOTENV_BASENAME = ".env";

/**
 * Loads `.env` from the process working directory when present.
 * Explicit environment variables already set are not overwritten (Node default).
 */
export function loadDotenvFromCwd(): void {
  const dotenvPath = path.join(process.cwd(), DOTENV_BASENAME);
  if (!existsSync(dotenvPath)) {
    return;
  }
  process.loadEnvFile(dotenvPath);
}
