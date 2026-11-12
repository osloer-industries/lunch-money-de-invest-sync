import { existsSync } from "node:fs";
import path from "node:path";
import { resolveScExecutable, trustedSearchDirs } from "../shared/subprocess-cli.js";

export function detectScBinaryPath(
  configured: string | undefined,
  exists: (candidate: string) => boolean = existsSync,
): string {
  if (configured && configured.length > 0) {
    if (path.isAbsolute(configured)) {
      return configured;
    }
    return resolveScExecutable(configured);
  }
  for (const dir of trustedSearchDirs()) {
    const candidate = path.join(dir, "sc");
    if (exists(candidate)) {
      return candidate;
    }
  }
  return "sc";
}
