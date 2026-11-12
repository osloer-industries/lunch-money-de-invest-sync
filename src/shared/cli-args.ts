import { parseArgs, type ParseArgsConfig } from "node:util";

export function parseCliArgv(
  argv: readonly string[],
  config: ParseArgsConfig,
  invalidMessagePrefix: string,
): ReturnType<typeof parseArgs> {
  try {
    return parseArgs({ ...config, args: [...argv] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${invalidMessagePrefix}: ${message}`, { cause: error });
  }
}

export function exportTypeSummaryPath(values: Record<string, unknown>): string | null {
  const raw = values["export-type-summary"];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}
