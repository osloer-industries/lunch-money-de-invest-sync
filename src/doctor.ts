import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { loadDotenvFromCwd } from "./shared/load-dotenv.js";
import { readConfigFromDiskForCli } from "./shared/config.js";
import { resolveScExecutable } from "./shared/subprocess-cli.js";
import { detectPytrLauncher } from "./setup/detect-pytr-command.js";
import { createPytrCliRunner, createScCliRunner, type PytrCliRunner, type ScCliRunner } from "./shared/subprocess-cli.js";
import { runCliModuleMain } from "./shared/cli-main.js";
import { assertNodeMajorVersion } from "./setup/broker-preflight.js";
import { statusError, statusOk } from "./setup/setup-status.js";

export interface DoctorCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly fix?: string;
}

export interface DoctorDeps {
  readonly nodeVersion?: string;
  readonly platform?: NodeJS.Platform;
  readonly exists?: (path: string) => boolean;
  readonly stat?: (path: string) => Promise<{ mode: number }>;
  readonly createPytrRunner?: (command: readonly string[]) => PytrCliRunner;
  readonly createScRunner?: (binary: string) => ScCliRunner;
  readonly logger?: (line: string) => void;
}

function defaultLogger(line: string): void {
  console.log(line);
}

function nodeMajorOk(version: string): DoctorCheck {
  try {
    assertNodeMajorVersion(version);
    return { name: "node", ok: true, detail: `Node.js ${version}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      name: "node",
      ok: false,
      detail: message,
      fix: "Install Node.js 24 (see .nvmrc) and run `nvm use`",
    };
  }
}

function npmCiCheck(exists: (p: string) => boolean, cwd: string): DoctorCheck {
  const hasModules = exists(path.join(cwd, "node_modules", "tsx", "package.json"));
  if (hasModules) {
    return { name: "npm-ci", ok: true, detail: "Dependencies installed (node_modules present)" };
  }
  return {
    name: "npm-ci",
    ok: false,
    detail: "node_modules is missing",
    fix: "Run `npm ci` in the repository root",
  };
}

function homebrewCheck(platform: NodeJS.Platform, exists: (p: string) => boolean): DoctorCheck | null {
  if (platform !== "darwin") {
    return null;
  }
  const brewPaths = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"];
  const found = brewPaths.some((p) => exists(p));
  if (found) {
    return { name: "homebrew", ok: true, detail: "Homebrew found" };
  }
  return {
    name: "homebrew",
    ok: false,
    detail: "Homebrew not found on PATH",
    fix: "Install Homebrew from https://brew.sh and run `eval \"$(brew shellenv)\"`",
  };
}

function toolOnPathCheck(name: string, exists: (p: string) => boolean, fix: string): DoctorCheck {
  const dirs = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", path.join(process.env.HOME ?? "", ".local", "bin")];
  const found = dirs.some((dir) => exists(path.join(dir, name)));
  return found
    ? { name, ok: true, detail: `${name} found under trusted paths` }
    : { name, ok: false, detail: `${name} not found`, fix };
}

async function pytrVersionCheck(runner: PytrCliRunner): Promise<DoctorCheck> {
  const run = await runner.run(["-V"]);
  if (run.exitCode !== 0) {
    return {
      name: "pytr-version",
      ok: false,
      detail: "pytr `-V` failed",
      fix: "Install pytr (see README) — e.g. `uvx pytr@0.4.10`",
    };
  }
  const versionLine = (run.stdout || run.stderr).trim().split("\n")[0] ?? "";
  return { name: "pytr-version", ok: true, detail: versionLine || "pytr responded to `-V`" };
}

async function scVersionCheck(runner: ScCliRunner): Promise<DoctorCheck> {
  try {
    const run = await runner.run(["--version"]);
    if (run.exitCode !== 0) {
      return {
        name: "sc-version",
        ok: false,
        detail: "Scalable CLI `--version` failed",
        fix: "Install scalable-cli: `brew install ScalableCapital/tap/scalable-cli`",
      };
    }
    const line = run.stdout.trim().split("\n")[0] ?? "sc";
    return { name: "sc-version", ok: true, detail: line };
  } catch {
    return {
      name: "sc-version",
      ok: false,
      detail: "Scalable CLI (`sc`) not found",
      fix: "Install scalable-cli: `brew install ScalableCapital/tap/scalable-cli`",
    };
  }
}

async function envFileCheck(
  exists: (p: string) => boolean,
  statFn: (p: string) => Promise<{ mode: number }>,
  cwd: string,
): Promise<DoctorCheck | null> {
  const envPath = path.join(cwd, ".env");
  if (!exists(envPath)) {
    return {
      name: "dotenv",
      ok: false,
      detail: ".env missing",
      fix: "Run `npm run setup` to create .env with mode 0600",
    };
  }
  const { mode } = await statFn(envPath);
  const permissions = mode & 0o777;
  if (permissions > 0o600) {
    return {
      name: "dotenv",
      ok: false,
      detail: `.env permissions are ${permissions.toString(8)} (expected 0600 or stricter)`,
      fix: "Run `chmod 600 .env`",
    };
  }
  return { name: "dotenv", ok: true, detail: ".env present (mode 0600 or stricter)" };
}

function configCheck(): DoctorCheck | null {
  try {
    loadDotenvFromCwd();
    const config = readConfigFromDiskForCli();
    const profileCount = config.tradeRepublicProfiles.length + config.scalableCapitalProfiles.length;
    return {
      name: "config-json",
      ok: profileCount > 0,
      detail:
        profileCount > 0
          ? `config.json valid (${profileCount} broker profile(s))`
          : "config.json has no broker profiles",
      ...(profileCount > 0 ? {} : { fix: "Run `npm run setup` to add broker profiles" }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      name: "config-json",
      ok: false,
      detail: message,
      fix: "Fix or delete config.json and re-run `npm run setup`",
    };
  }
}

export async function runDoctor(deps: DoctorDeps = {}): Promise<{ ok: boolean; checks: DoctorCheck[] }> {
  const cwd = process.cwd();
  const exists = deps.exists ?? existsSync;
  const statFn = deps.stat ?? ((p) => stat(p));
  const checks: DoctorCheck[] = [];

  checks.push(nodeMajorOk(deps.nodeVersion ?? process.version), npmCiCheck(exists, cwd));

  const brew = homebrewCheck(deps.platform ?? process.platform, exists);
  if (brew) {
    checks.push(brew);
  }

  checks.push(
    toolOnPathCheck(
      "uv",
      exists,
      "Install uv: `curl -LsSf https://astral.sh/uv/install.sh | sh` and ensure ~/.local/bin is on your PATH",
    ),
  );

  const detected = detectPytrLauncher();
  checks.push({
    name: "pytr-launcher",
    ok: true,
    detail: `Detected launcher: ${detected.summary}`,
  });

  const pytrRunner = (deps.createPytrRunner ?? createPytrCliRunner)(detected.pytrCommand);
  checks.push(await pytrVersionCheck(pytrRunner));

  let scBinary = "sc";
  try {
    scBinary = resolveScExecutable("sc");
  } catch {
    /* resolved below in scVersionCheck */
  }
  const scRunner = (deps.createScRunner ?? createScCliRunner)(scBinary);
  checks.push(await scVersionCheck(scRunner));

  if (exists(path.join(cwd, ".env"))) {
    const envCheck = await envFileCheck(exists, statFn, cwd);
    if (envCheck) {
      checks.push(envCheck);
    }
  }

  if (exists(path.join(cwd, "config.json"))) {
    const cfg = configCheck();
    if (cfg) {
      checks.push(cfg);
    }
  }

  const ok = checks.every((check) => check.ok);
  return { ok, checks };
}

export async function runDoctorCli(
  argv: readonly string[],
  deps: DoctorDeps = {},
): Promise<void> {
  const logger = deps.logger ?? defaultLogger;
  if (argv.includes("--help")) {
    logger("Usage: npm run doctor\n\nChecks local prerequisites for sync and setup.");
    return;
  }
  const result = await runDoctor(deps);
  for (const check of result.checks) {
    const line = check.ok ? statusOk(`${check.name}: ${check.detail}`) : statusError(`${check.name}: ${check.detail}`);
    logger(line);
    if (!check.ok && check.fix) {
      logger(`  → ${check.fix}`);
    }
  }
  if (!result.ok) {
    throw new Error("doctor found issues — fix the items above and re-run `npm run doctor`");
  }
}

runCliModuleMain(async () => {
  try {
    await runDoctorCli(process.argv.slice(2));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}, import.meta.url);
