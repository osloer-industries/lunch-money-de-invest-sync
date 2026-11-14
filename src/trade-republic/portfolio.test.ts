import { describe, expect, it, vi } from "vitest";
import { fetchTradeRepublicPortfolio, parsePytrPortfolioCsv, parsePytrPortfolioStdout } from "./portfolio.js";
import type { PytrFilesystem } from "./client.js";
import type { PytrCliRunner } from "../shared/subprocess-cli.js";

const HEADER = "Name;ISIN;quantity;price;avgCost;netValue";

const CSV = [
  HEADER,
  "Example World ETF;IE00B4L5Y983;10;100;90;1000",
  "Example Bond ETF;XX0000000001;2.5;40.1;38;100.25",
  "",
].join("\n");

const STDOUT = [
  "Depot                                     1000.00 ->    1100.25     100.25    10.0%",
  "Cash EUR                                   250.00",
  "Total                                     1250.00 ->    1350.25",
  "Wrote 3 lines to /tmp/x/portfolio.csv",
].join("\n");

describe("parsePytrPortfolioCsv", () => {
  it("sums netValue across positions", () => {
    expect(parsePytrPortfolioCsv(CSV)).toEqual({ positionCount: 2, securitiesValue: 1100.25 });
  });

  it("treats a header-only CSV as an empty portfolio", () => {
    expect(parsePytrPortfolioCsv(`${HEADER}\n`)).toEqual({ positionCount: 0, securitiesValue: 0 });
  });

  it("parses localized decimals and a BOM", () => {
    const csv = `﻿${HEADER}\r\nExample;IE00B4L5Y983;1,5;1.000,00;900,00;1.500,50\r\n`;
    expect(parsePytrPortfolioCsv(csv).securitiesValue).toBe(1500.5);
  });

  it("reads netValue from the end of the row when a name contains a semicolon", () => {
    expect(parsePytrPortfolioCsv(`${HEADER}\nA;B Corp;IE00B4L5Y983;1;2;2;2\n`).securitiesValue).toBe(2);
  });

  it("rejects an unexpected header", () => {
    expect(() => parsePytrPortfolioCsv("Name;ISIN;value\n")).toThrow(/unexpected header/);
    expect(() => parsePytrPortfolioCsv("")).toThrow(/unexpected header/);
  });

  it("rejects a non-numeric netValue without echoing the row", () => {
    expect(() => parsePytrPortfolioCsv(`${HEADER}\nSecret;IE00B4L5Y983;1;2;2;n/a\n`)).toThrow(
      "pytr portfolio CSV row 1 has a non-numeric netValue",
    );
  });
});

describe("parsePytrPortfolioStdout", () => {
  it("reads the cash line", () => {
    expect(parsePytrPortfolioStdout(STDOUT)).toEqual({
      cash: { currency: "eur", amount: 250 },
      missingPriceCount: 0,
    });
  });

  it("parses a localized cash amount", () => {
    expect(parsePytrPortfolioStdout("Cash EUR   1.234,56").cash).toEqual({ currency: "eur", amount: 1234.56 });
  });

  it("returns null cash when the line is missing or not numeric", () => {
    expect(parsePytrPortfolioStdout("Depot 0.00 -> 0.00").cash).toBeNull();
    expect(parsePytrPortfolioStdout("Cash EUR n/a").cash).toBeNull();
  });

  it("counts positions pytr could not price", () => {
    const stdout = "Missing price for A (IE00B4L5Y983), removing from result.\nMissing price for B (X), removing.\n";
    expect(parsePytrPortfolioStdout(stdout).missingPriceCount).toBe(2);
  });
});

function fakeFilesystem(csv: string | Error): PytrFilesystem {
  return {
    mkdtemp: vi.fn().mockResolvedValue("/tmp/lm-tr-portfolio-test"),
    readFile: csv instanceof Error ? vi.fn().mockRejectedValue(csv) : vi.fn().mockResolvedValue(csv),
    rm: vi.fn().mockResolvedValue(undefined),
  };
}

function runner(result: { exitCode: number; stdout?: string; stderr?: string }): PytrCliRunner {
  return { run: vi.fn().mockResolvedValue({ stdout: "", stderr: "", ...result }) };
}

describe("fetchTradeRepublicPortfolio", () => {
  it("runs pytr portfolio --v2 with the pytr home and an approval watcher, then cleans up", async () => {
    const pytr = runner({ exitCode: 0, stdout: STDOUT });
    const filesystem = fakeFilesystem(CSV);
    const result = await fetchTradeRepublicPortfolio(pytr, { pytrHome: "/data/operator-a/.pytr" }, filesystem);
    expect(result).toEqual({
      positionCount: 2,
      securitiesValue: 1100.25,
      cash: { currency: "eur", amount: 250 },
      missingPriceCount: 0,
    });
    expect(pytr.run).toHaveBeenCalledWith(
      [
        "portfolio",
        "--v2",
        "--lang",
        "en",
        "--no-decimal-localization",
        "--output",
        "/tmp/lm-tr-portfolio-test/portfolio.csv",
      ],
      { HOME: "/data/operator-a" },
      expect.objectContaining({ onOutputLine: expect.any(Function) }),
    );
    expect(filesystem.rm).toHaveBeenCalledWith("/tmp/lm-tr-portfolio-test", { recursive: true, force: true });
  });

  it("checks pytrMinVersion first", async () => {
    const pytr = runner({ exitCode: 0, stdout: "pytr 0.4.9\n" });
    await expect(fetchTradeRepublicPortfolio(pytr, { pytrMinVersion: "0.4.10" }, fakeFilesystem(CSV))).rejects.toThrow(
      /below the configured minimum/,
    );
  });

  it("turns a non-zero exit into an actionable error", async () => {
    const filesystem = fakeFilesystem(CSV);
    await expect(
      fetchTradeRepublicPortfolio(runner({ exitCode: 1, stderr: "not logged in" }), {}, filesystem),
    ).rejects.toThrow(/pytr login --v2/);
    await expect(fetchTradeRepublicPortfolio(runner({ exitCode: 2, stderr: "boom" }), {}, filesystem)).rejects.toThrow(
      "pytr portfolio failed (exit 2): boom",
    );
    expect(filesystem.rm).toHaveBeenCalledTimes(2);
  });

  it("explains a missing CSV and rethrows other read errors", async () => {
    const missing = Object.assign(new Error("nope"), { code: "ENOENT" });
    await expect(fetchTradeRepublicPortfolio(runner({ exitCode: 0 }), {}, fakeFilesystem(missing))).rejects.toThrow(
      /did not write the CSV/,
    );
    await expect(
      fetchTradeRepublicPortfolio(runner({ exitCode: 0 }), {}, fakeFilesystem(new Error("EACCES"))),
    ).rejects.toThrow("EACCES");
  });

  it("explains a missing pytr launcher", async () => {
    const pytr = { run: vi.fn().mockRejectedValue(Object.assign(new Error("spawn"), { code: "ENOENT" })) };
    await expect(fetchTradeRepublicPortfolio(pytr, {}, fakeFilesystem(CSV))).rejects.toThrow(/pytr was not found/);
  });
});
