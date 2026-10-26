#!/usr/bin/env node
/**
 * PR dependency gate without GitHub Dependency Review (requires GHAS on private repos).
 *
 * Compares npm audit advisories on the merge base vs the PR head (prod deps only,
 * matching CI's --omit=dev). Fails when the PR introduces an advisory that was not
 * present on the base ref at the same npm advisory URL, with severity high or critical
 * (equivalent to dependency-review-action fail-on-severity: high).
 */
import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseRef = process.env.BASE_REF ?? "origin/main";
const FAIL_RANK = 3; // high and critical

const SEVERITY_RANK = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

function runAudit(cwd) {
  const res = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const text = res.stdout || res.stderr;
  if (!text?.trim()) {
    throw new Error(`npm audit produced no output in ${cwd} (exit ${res.status})`);
  }
  return JSON.parse(text);
}

function refHasFile(ref, path) {
  const res = spawnSync("git", ["cat-file", "-e", `${ref}:${path}`], {
    encoding: "utf8",
  });
  return res.status === 0;
}

function gitShow(ref, path) {
  return execSync(`git show ${ref}:${path}`, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function auditAtGitRef(ref) {
  const dir = join(tmpdir(), `dep-audit-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(dir, "package.json"), gitShow(ref, "package.json"));
    writeFileSync(join(dir, "package-lock.json"), gitShow(ref, "package-lock.json"));
    execSync("npm ci --ignore-scripts --omit=dev", {
      cwd: dir,
      stdio: "pipe",
    });
    return runAudit(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function collectAdvisories(auditJson) {
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

function rank(severity) {
  return SEVERITY_RANK[severity] ?? 0;
}

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
  const res = spawnSync("npm", ["audit", "--omit=dev", "--audit-level=high"], {
    stdio: "inherit",
  });
  process.exit(res.status === 0 ? 0 : 1);
}

const baseAudit = auditAtGitRef(baseRef);

const headAdv = collectAdvisories(headAudit);
const baseAdv = collectAdvisories(baseAudit);

/** @type {Array<{ key: string, severity: string, name: string, title: string }>} */
const newlyIntroduced = [];

for (const [key, meta] of headAdv) {
  if (baseAdv.has(key)) continue;
  if (rank(meta.severity) < FAIL_RANK) continue;
  newlyIntroduced.push({ key, ...meta });
}

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
