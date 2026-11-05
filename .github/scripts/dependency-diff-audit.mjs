#!/usr/bin/env node
/**
 * PR dependency gate without GitHub Dependency Review (requires GHAS on private repos).
 *
 * Compares npm audit advisories on the merge base vs the PR head (prod deps only,
 * matching CI's --omit=dev). Fails when the PR introduces an advisory that was not
 * present on the base ref at the same npm advisory URL, with severity high or critical
 * (equivalent to dependency-review-action fail-on-severity: high).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FAIL_RANK = 3; // high and critical

export const SEVERITY_RANK = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

const baseRef = process.env.BASE_REF ?? "origin/main";

const nodeBin = process.env.NODE_BIN;
const npmCli = process.env.NPM_CLI;
const gitBin = process.env.GIT_BIN;

/** Minimal env for subprocesses; absolute binaries avoid a writable PATH (Sonar S4036). */
const SUBPROCESS_ENV = {
  PATH: "/usr/bin:/bin",
  HOME: "/home/runner",
  LANG: "C.UTF-8",
};

function requireToolPaths() {
  if (!nodeBin || !npmCli || !gitBin) {
    throw new Error(
      "NODE_BIN, NPM_CLI, and GIT_BIN must be set by the workflow (absolute paths, fixed PATH lookup).",
    );
  }
}

function runNpm(args, options) {
  if (!existsSync(npmCli)) {
    throw new Error(`Expected npm CLI at ${npmCli}`);
  }
  const res = spawnSync(nodeBin, [npmCli, ...args], {
    ...options,
    env: SUBPROCESS_ENV,
  });
  if (res.error) {
    throw new Error(`npm spawn failed: ${res.error.message}`);
  }
  return res;
}

/**
 * @param {string} text
 * @param {string} context
 */
export function parseAuditJson(text, context) {
  if (!text?.trim()) {
    throw new Error(`npm audit produced no JSON: ${context}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`npm audit returned invalid JSON (${context}): ${message}`);
  }
}

function runAudit(cwd) {
  const res = runNpm(["audit", "--omit=dev", "--json"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const text = res.stdout;
  if (!text?.trim()) {
    const detail = res.stderr?.toString().trim() || `exit ${res.status}`;
    throw new Error(`npm audit produced no JSON on stdout in ${cwd}: ${detail}`);
  }
  return parseAuditJson(text, cwd);
}

function refHasFile(ref, path) {
  const res = spawnSync(gitBin, ["cat-file", "-e", `${ref}:${path}`], {
    encoding: "utf8",
    env: SUBPROCESS_ENV,
  });
  if (res.error) {
    throw new Error(`git spawn failed: ${res.error.message}`);
  }
  return res.status === 0;
}

function gitShow(ref, path) {
  const res = spawnSync(gitBin, ["show", `${ref}:${path}`], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    env: SUBPROCESS_ENV,
  });
  if (res.error) {
    throw new Error(`git spawn failed: ${res.error.message}`);
  }
  if (res.status !== 0) {
    throw new Error(res.stderr || `git show failed for ${ref}:${path}`);
  }
  return res.stdout;
}

function auditAtGitRef(ref) {
  const dir = join(tmpdir(), `dep-audit-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(dir, "package.json"), gitShow(ref, "package.json"));
    writeFileSync(join(dir, "package-lock.json"), gitShow(ref, "package-lock.json"));
    const install = runNpm(["ci", "--ignore-scripts", "--omit=dev"], {
      cwd: dir,
      stdio: "pipe",
    });
    if (install.status !== 0) {
      throw new Error(install.stderr?.toString() || "npm ci failed for base ref audit");
    }
    return runAudit(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function collectAdvisories(auditJson) {
  /** @type {Map<string, { severity: string, name: string, title: string }>} */
  const map = new Map();
  for (const [name, vuln] of Object.entries(auditJson.vulnerabilities ?? {})) {
    const severity = vuln.severity ?? "moderate";
    for (const via of vuln.via ?? []) {
      if (typeof via !== "object" || via === null) continue;
      const key = via.url ?? via.source ?? `${name}:${via.title ?? "unknown"}`;
      map.set(String(key), {
        severity: via.severity ?? severity,
        name,
        title: via.title ?? name,
      });
    }
  }
  return map;
}

export function rank(severity) {
  return SEVERITY_RANK[severity] ?? 0;
}

/**
 * @param {Map<string, { severity: string, name: string, title: string }>} headAdv
 * @param {Map<string, { severity: string, name: string, title: string }>} baseAdv
 * @param {number} [failRank]
 */
export function findNewlyIntroducedHighCritical(headAdv, baseAdv, failRank = FAIL_RANK) {
  /** @type {Array<{ key: string, severity: string, name: string, title: string }>} */
  const newlyIntroduced = [];
  for (const [key, meta] of headAdv) {
    if (baseAdv.has(key)) continue;
    if (rank(meta.severity) < failRank) continue;
    newlyIntroduced.push({ key, ...meta });
  }
  return newlyIntroduced;
}

function main() {
  requireToolPaths();

  console.log("Dependency diff audit (npm audit, no GHAS Dependency Review)");
  console.log(`Base ref: ${baseRef}`);
  console.log("Policy: fail on newly introduced advisories with severity high or critical");

  const headAudit = runAudit(process.cwd());

  if (!refHasFile(baseRef, "package-lock.json")) {
    console.log(
      "Base ref has no package-lock.json (e.g. npm migration); using head-only npm audit --audit-level=high.",
    );
    console.log(
      "Trade-off: cannot diff advisories vs merge base until both sides use npm lockfiles.",
    );
    const res = runNpm(["audit", "--omit=dev", "--audit-level=high"], {
      stdio: "inherit",
    });
    process.exit(res.status === 0 ? 0 : 1);
  }

  const baseAudit = auditAtGitRef(baseRef);

  const headAdv = collectAdvisories(headAudit);
  const baseAdv = collectAdvisories(baseAudit);
  const newlyIntroduced = findNewlyIntroducedHighCritical(headAdv, baseAdv);

  console.log(`Base advisories (all severities): ${baseAdv.size}`);
  console.log(`Head advisories (all severities): ${headAdv.size}`);
  console.log(`New high/critical advisories on this PR: ${newlyIntroduced.length}`);

  if (newlyIntroduced.length === 0) {
    console.log("No new high or critical npm advisories compared to the merge base.");
    process.exit(0);
  }

  for (const item of newlyIntroduced) {
    console.log("");
    console.log(`- [${item.severity}] ${item.title}`);
    console.log(`  package: ${item.name}`);
    console.log(`  advisory: ${item.key}`);
  }

  console.error(
    `\nDependency gate failed: ${newlyIntroduced.length} new high/critical advisory(ies).`,
  );
  process.exit(1);
}

const isMain =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  try {
    main();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  }
}
