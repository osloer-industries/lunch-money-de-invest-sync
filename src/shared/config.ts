import { readFileSync } from "node:fs";
import path from "node:path";
import parseJson from "secure-json-parse";
import { z } from "zod";

const tradeRepublicProfileSchema = z.object({
  owner: z.string().min(1),
  phoneNumber: z.string().min(1),
  pin: z.string().min(1),
  lunchMoneyAssetId: z.number().int().positive(),
});

const scalableCapitalProfileSchema = z
  .object({
    owner: z.string().min(1),
    lunchMoneyAssetId: z.number().int().positive(),
    /** `sc broker transactions --portfolio-id` when multiple portfolios exist. */
    portfolioId: z.string().min(1).optional(),
    /** Absolute path to the `sc` binary (otherwise resolved under trusted system dirs). */
    scBinaryPath: z
      .string()
      .min(1)
      .refine((value) => path.isAbsolute(value), { message: "scBinaryPath must be an absolute path" })
      .optional(),
    /** Overrides SC_CONFIG_DIR for the child process when sessions live outside the default dir. */
    scConfigDir: z.string().min(1).optional(),
  })
  .strict();

export const syncConfigSchema = z.object({
  lunchMoneyApiKey: z.string().min(1),
  /** Last 4 digits of cards shared between household members; matching spend gets a "shared" tag. */
  sharedCardLast4: z.array(z.string().length(4)).default([]),
  tradeRepublicProfiles: z.array(tradeRepublicProfileSchema).default([]),
  scalableCapitalProfiles: z.array(scalableCapitalProfileSchema).default([]),
});

export type SyncConfig = z.infer<typeof syncConfigSchema>;
export type TradeRepublicProfile = z.infer<typeof tradeRepublicProfileSchema>;
export type ScalableCapitalProfile = z.infer<typeof scalableCapitalProfileSchema>;

/** Pure parse/validate step, independent of where the raw config came from. */
export function loadConfig(raw: unknown): SyncConfig {
  return syncConfigSchema.parse(raw);
}

const CONFIG_BASENAME = "config.json";

/** Resolve config.json under the process working directory (blocks path traversal). */
export function resolveConfigFilePath(configPath = CONFIG_BASENAME): string {
  if (path.basename(configPath) !== CONFIG_BASENAME) {
    throw new Error(`Only ${CONFIG_BASENAME} is supported`);
  }
  const cwd = path.resolve(process.cwd());
  const resolved = path.resolve(cwd, configPath);
  if (resolved !== path.join(cwd, CONFIG_BASENAME)) {
    throw new Error(`${CONFIG_BASENAME} must be read from the working directory`);
  }
  return resolved;
}

/** Parse JSON text without prototype-pollution keys (see secure-json-parse). */
export function parseJsonText(text: string): unknown {
  return parseJson(text, undefined, { protoAction: "remove", constructorAction: "remove" }) as unknown;
}

const jsonTextSchema = z.string().transform((text, ctx): unknown => {
  try {
    return parseJsonText(text);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "invalid JSON",
    });
    return z.NEVER;
  }
});

function readConfigJsonFile(absolutePath: string): unknown {
  const text = readFileSync(absolutePath, "utf-8");
  const parsed = jsonTextSchema.safeParse(text);
  if (!parsed.success) {
    throw new Error(`${CONFIG_BASENAME} contains invalid JSON`);
  }
  return parsed.data;
}

/** Fields allowed in config.json on disk (API key comes from the environment). */
const configFileSchema = syncConfigSchema.omit({ lunchMoneyApiKey: true }).partial();

/**
 * Reads config.json (profiles: not a secret by itself, but gitignored since it carries
 * asset ids and phone numbers) plus LUNCH_MONEY_API_KEY from the environment.
 */
export function readConfigFromDisk(configPath = CONFIG_BASENAME): SyncConfig {
  const absolutePath = resolveConfigFilePath(configPath);
  const parsed = readConfigJsonFile(absolutePath);
  const fromFile = configFileSchema.parse(parsed);
  return loadConfig({
    sharedCardLast4: fromFile.sharedCardLast4,
    tradeRepublicProfiles: fromFile.tradeRepublicProfiles,
    scalableCapitalProfiles: fromFile.scalableCapitalProfiles,
    lunchMoneyApiKey: process.env["LUNCH_MONEY_API_KEY"],
  });
}
