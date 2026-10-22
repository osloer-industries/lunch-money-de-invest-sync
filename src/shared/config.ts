import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import path from "node:path";
import parseJson from "secure-json-parse";
import { z } from "zod";

/** Hostnames that must never be used as Scalable Capital proxy targets (cloud metadata SSRF). */
const BLOCKED_PROXY_HOSTNAMES = new Set(["metadata.google.internal", "metadata.goog"]);

/** IPv4 link-local block (includes cloud metadata endpoints such as 169.254.169.254). */
function isLinkLocalIpv4Address(hostname: string): boolean {
  return isIP(hostname) === 4 && hostname.startsWith("169.254.");
}

function validateProxyUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("proxyUrl must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("proxyUrl must use http or https");
  }
  if (parsed.username || parsed.password) {
    throw new Error("proxyUrl must not embed credentials");
  }
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_PROXY_HOSTNAMES.has(host) || isLinkLocalIpv4Address(host)) {
    throw new Error(`proxyUrl must not target ${host}`);
  }
}

const tradeRepublicProfileSchema = z.object({
  owner: z.string().min(1),
  phoneNumber: z.string().min(1),
  pin: z.string().min(1),
  lunchMoneyAssetId: z.number().int().positive(),
});

const scalableCapitalProfileSchema = z.object({
  owner: z.string().min(1),
  /** Base URL of the local auth proxy (e.g. http://localhost:8000). */
  proxyUrl: z
    .string()
    .url()
    .superRefine((value, ctx) => {
      try {
        validateProxyUrl(value);
      } catch (error) {
        const message = error instanceof Error ? error.message : "invalid proxyUrl";
        ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      }
    }),
  proxyToken: z.string().min(1).optional(),
  lunchMoneyAssetId: z.number().int().positive(),
});

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
