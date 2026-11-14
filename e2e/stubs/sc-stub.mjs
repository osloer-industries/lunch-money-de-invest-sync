#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const scenario = process.env.LM_E2E_SC_SCENARIO ?? "ok";
const fixturesDir = process.env.LM_E2E_FIXTURES_DIR;
const argv = process.argv.slice(2);
const statePath = path.join(process.env.HOME ?? "/tmp", ".lm-e2e-sc-portfolios-attempts");

async function portfolioAttempts() {
  try {
    const text = await readFile(statePath, "utf8");
    const parsed = Number.parseInt(text, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

async function bumpPortfolioAttempts() {
  const next = (await portfolioAttempts()) + 1;
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, String(next), "utf8");
  return next;
}

async function readFixture(name) {
  if (!fixturesDir) {
    throw new Error("LM_E2E_FIXTURES_DIR is not set");
  }
  return readFile(path.join(fixturesDir, name), "utf8");
}

async function run() {
  if (argv.includes("--version")) {
    process.stdout.write("sc 0.1.0-e2e-stub\n");
    process.exit(0);
  }

  if (argv[0] === "broker" && argv[1] === "portfolios") {
    if (scenario === "no_session_then_ok") {
      const attempt = await bumpPortfolioAttempts();
      if (attempt < 2) {
        process.stdout.write(
          JSON.stringify({
            ok: false,
            command: "broker.portfolios",
            error: { code: "no_session", message: "No active session" },
            hints: ["Run 'sc login' first to create a session."],
          }),
        );
        process.exit(0);
      }
    }
    if (scenario === "no_session") {
      process.stdout.write(
        JSON.stringify({
          ok: false,
          command: "broker.portfolios",
          error: { code: "no_session", message: "No active session" },
          hints: ["Run 'sc login' first to create a session."],
        }),
      );
      process.exit(0);
    }
    process.stdout.write(
      JSON.stringify({
        ok: true,
        command: "broker.portfolios",
        data: {
          portfolios: [{ id: "portfolio-operator-a", name: "Broker portfolio" }],
        },
      }),
    );
    process.exit(0);
  }

  if (argv[0] === "broker" && argv[1] === "transactions") {
    if (scenario === "no_session") {
      const body = await readFixture("scalable-broker-transactions-no-session.json");
      process.stdout.write(body.trim());
      process.exit(0);
    }
    const cursorIndex = argv.indexOf("--cursor");
    const cursor = cursorIndex >= 0 ? argv[cursorIndex + 1] : undefined;
    const fixture =
      cursor === "page-2"
        ? "scalable-broker-transactions-page-2.json"
        : "scalable-broker-transactions-page-1.json";
    const body = await readFixture(fixture);
    process.stdout.write(body.trim());
    process.exit(0);
  }

  if (argv[0] === "login") {
    process.stdout.write(JSON.stringify({ ok: true, command: "login" }));
    process.exit(0);
  }

  process.stderr.write(`sc-stub: unsupported argv ${argv.join(" ")}\n`);
  process.exit(2);
}

run().catch((error) => {
  process.stderr.write(String(error));
  process.exit(1);
});