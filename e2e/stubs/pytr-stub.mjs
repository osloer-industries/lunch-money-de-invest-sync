#!/usr/bin/env node
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const scenario = process.env.LM_E2E_PYTR_SCENARIO ?? "ok";
const fixturesDir = process.env.LM_E2E_FIXTURES_DIR;
const exportAttemptsPath = path.join(process.env.HOME ?? "/tmp", ".lm-e2e-pytr-export-attempts");

const argv = process.argv.slice(2);

async function exportAttempts() {
  try {
    const text = await readFile(exportAttemptsPath, "utf8");
    const parsed = Number.parseInt(text, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

async function bumpExportAttempts() {
  const next = (await exportAttempts()) + 1;
  await mkdir(path.dirname(exportAttemptsPath), { recursive: true });
  await writeFile(exportAttemptsPath, String(next), "utf8");
  return next;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function writeOkExport(outputDir) {
  if (!fixturesDir) {
    throw new Error("LM_E2E_FIXTURES_DIR is not set");
  }
  await mkdir(outputDir, { recursive: true });
  await copyFile(
    path.join(fixturesDir, "trade-republic-all_events.json"),
    path.join(outputDir, "all_events.json"),
  );
}

async function run() {
  if (argv.includes("-V") || argv[0] === "--version") {
    process.stdout.write("pytr 0.4.10\n");
    process.exit(0);
  }

  if (argv[0] === "login") {
    process.stdout.write("pytr stub login ok\n");
    process.exit(0);
  }

  if (argv[0] === "export_transactions") {
    const outputIndex = argv.indexOf("--outputdir");
    const outputDir = outputIndex >= 0 ? argv[outputIndex + 1] : undefined;

    if (scenario === "missing_session") {
      process.stderr.write("not logged in — credentials missing\n");
      process.exit(1);
    }

    if (scenario === "missing_session_then_ok") {
      const attempt = await bumpExportAttempts();
      if (attempt < 2) {
        process.stderr.write("not logged in — credentials missing\n");
        process.exit(1);
      }
    }

    if (scenario === "approval_wait") {
      process.stderr.write(
        "Waiting for you to confirm the login in the Trade Republic app… 30s left\n",
      );
      await sleep(process.env.LM_E2E_FAST === "1" ? 80 : 500);
      process.stderr.write("Still waiting, 5s left\n");
      await sleep(process.env.LM_E2E_FAST === "1" ? 80 : 500);
      if (!outputDir) {
        process.exit(1);
      }
      await writeOkExport(outputDir);
      process.exit(0);
    }

    if (scenario === "approval_timeout") {
      process.stderr.write(
        "Waiting for you to confirm the login in the Trade Republic app… 10s left\n",
      );
      await sleep(process.env.LM_E2E_FAST === "1" ? 100 : 800);
      process.stderr.write("login timed out\n");
      process.exit(1);
    }

    if (scenario === "approval_rejected") {
      process.stderr.write("login rejected by operator\n");
      process.exit(1);
    }

    if (!outputDir) {
      process.stderr.write("missing --outputdir\n");
      process.exit(1);
    }
    await writeOkExport(outputDir);
    process.stdout.write(`wrote ${path.join(outputDir, "all_events.json")}\n`);
    process.exit(0);
  }

  process.stderr.write(`pytr-stub: unsupported argv ${argv.join(" ")}\n`);
  process.exit(2);
}

run().catch((error) => {
  process.stderr.write(String(error));
  process.exit(1);
});