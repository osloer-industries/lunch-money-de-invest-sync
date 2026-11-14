import os from "node:os";
import path from "node:path";
import {
  actionablePytrFailure,
  assertPytrMinVersion,
  createApprovalAwarePytrRun,
  defaultPytrFilesystem,
  pytrHomeEnv,
  type PytrFilesystem,
} from "./client.js";
import type { TradeRepublicPytrConfig } from "./types.js";
import { isErrnoCode } from "../shared/errno.js";
import { parseBrokerDecimal } from "../shared/decimal.js";
import type { PytrCliRunner } from "../shared/subprocess-cli.js";

const PORTFOLIO_HEADER = ["Name", "ISIN", "quantity", "price", "avgCost", "netValue"] as const;
const NET_VALUE_COLUMN = PORTFOLIO_HEADER.indexOf("netValue");

export interface PytrPortfolioCsv {
  readonly positionCount: number;
  /** Sum of `netValue` over all positions (securities market value, excluding cash). */
  readonly securitiesValue: number;
}

export interface PytrPortfolioStdout {
  /** `Cash EUR <amount>` line; null when pytr did not print one. */
  readonly cash: { readonly currency: string; readonly amount: number } | null;
  /** Positions pytr dropped because it could not price them ("Missing price for …"). */
  readonly missingPriceCount: number;
}

export interface TradeRepublicPortfolio extends PytrPortfolioCsv, PytrPortfolioStdout {}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Parses `pytr portfolio -o <file>` CSV (`Name;ISIN;quantity;price;avgCost;netValue`). Only the
 * header and the `netValue` column are interpreted; names and ISINs are never logged.
 */
export function parsePytrPortfolioCsv(text: string): PytrPortfolioCsv {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const header = lines[0]?.split(";").map((cell) => cell.trim());
  if (!header || PORTFOLIO_HEADER.some((column, index) => header[index] !== column)) {
    throw new Error(`pytr portfolio CSV has an unexpected header (expected ${PORTFOLIO_HEADER.join(";")})`);
  }
  let total = 0;
  for (const [index, line] of lines.slice(1).entries()) {
    // Names may contain ";" in theory, so read netValue from the end of the row.
    const cells = line.split(";");
    const raw = cells[cells.length - (PORTFOLIO_HEADER.length - NET_VALUE_COLUMN)];
    const value = parseBrokerDecimal(raw?.trim());
    if (value === null) {
      throw new Error(`pytr portfolio CSV row ${index + 1} has a non-numeric netValue`);
    }
    total += value;
  }
  return { positionCount: lines.length - 1, securitiesValue: roundCents(total) };
}

/** Parses the summary pytr prints to stdout (`Cash EUR 12.34`, `Missing price for …`). */
export function parsePytrPortfolioStdout(stdout: string): PytrPortfolioStdout {
  let cash: PytrPortfolioStdout["cash"] = null;
  let missingPriceCount = 0;
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Missing price for ")) {
      missingPriceCount += 1;
      continue;
    }
    const match = /^Cash\s+([A-Za-z]{3})\s+(\S+)$/.exec(trimmed);
    const amount = match ? parseBrokerDecimal(match[2]) : null;
    if (match && amount !== null) {
      cash = { currency: match[1]!.toLowerCase(), amount };
    }
  }
  return { cash, missingPriceCount };
}

function buildPortfolioArgv(outputPath: string): string[] {
  return ["portfolio", "--v2", "--lang", "en", "--no-decimal-localization", "--output", outputPath];
}

/**
 * Runs `pytr portfolio --v2 -o <tmp>/portfolio.csv` with the profile's pytr home, the same
 * app-approval relay as `export_transactions`, and the profile subprocess timeout.
 */
export async function fetchTradeRepublicPortfolio(
  runner: PytrCliRunner,
  config: TradeRepublicPytrConfig,
  filesystem: PytrFilesystem = defaultPytrFilesystem,
): Promise<TradeRepublicPortfolio> {
  const childEnv = pytrHomeEnv(config.pytrHome);
  let outputDir: string | undefined;
  try {
    await assertPytrMinVersion(runner, config, childEnv);
    outputDir = await filesystem.mkdtemp(path.join(os.tmpdir(), "lm-tr-portfolio-"));
    const csvPath = path.join(outputDir, "portfolio.csv");
    const run = await createApprovalAwarePytrRun(runner, childEnv)(buildPortfolioArgv(csvPath));
    if (run.exitCode !== 0) {
      throw new Error(actionablePytrFailure(run.stderr, run.exitCode, "portfolio"));
    }
    let csv: string;
    try {
      csv = await filesystem.readFile(csvPath, "utf8");
    } catch (error) {
      if (isErrnoCode(error, "ENOENT")) {
        throw new Error("pytr portfolio finished but did not write the CSV — upgrade pytr (>= 0.4.10)", {
          cause: error,
        });
      }
      throw error;
    }
    return { ...parsePytrPortfolioCsv(csv), ...parsePytrPortfolioStdout(run.stdout) };
  } finally {
    if (outputDir) {
      await filesystem.rm(outputDir, { recursive: true, force: true });
    }
  }
}
