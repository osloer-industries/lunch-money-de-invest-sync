#!/usr/bin/env node
/**
 * Gate CodeQL SARIF output without GitHub Advanced Security / code scanning upload.
 *
 * Threshold (security-tagged rules only):
 * - Fail on result level "error" or "warning", OR
 * - Fail when security-severity is >= 4.0 (GitHub "medium" and above on the 0–10 scale).
 *
 * Quality-only and note-level informational findings are ignored unless they carry
 * medium+ security-severity (unusual but covered for completeness).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SARIF_DIR = process.argv[2] ?? "codeql-results";

function collectSarifFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) {
      files.push(...collectSarifFiles(path));
    } else if (entry.endsWith(".sarif")) {
      files.push(path);
    }
  }
  return files;
}

function ruleIsSecurity(rule) {
  const tags = rule?.properties?.tags ?? [];
  return tags.some(
    (t) =>
      typeof t === "string" &&
      (/^security$/i.test(t) ||
        /^CWE-/i.test(t) ||
        t.toLowerCase().includes("security")),
  );
}

function parseSecuritySeverity(result, rule) {
  const raw =
    result.properties?.["security-severity"] ??
    rule?.properties?.["security-severity"];
  if (raw === undefined || raw === null) return null;
  const n = Number.parseFloat(String(raw));
  return Number.isFinite(n) ? n : null;
}

function locationLabel(result) {
  const phys = result.locations?.[0]?.physicalLocation;
  const rel = phys?.artifactLocation?.uri;
  const line = phys?.region?.startLine;
  if (rel && line) return `${rel}:${line}`;
  if (rel) return rel;
  return "(unknown location)";
}

function shouldGate(result, rule) {
  if (!ruleIsSecurity(rule)) return false;
  const level = result.level ?? rule?.defaultConfiguration?.level ?? "warning";
  const sev = parseSecuritySeverity(result, rule);
  if (level === "error" || level === "warning") return true;
  if (sev !== null && sev >= 4.0) return true;
  return false;
}

const sarifFiles = collectSarifFiles(SARIF_DIR);
if (sarifFiles.length === 0) {
  console.error(`No SARIF files under ${SARIF_DIR}`);
  process.exit(1);
}

const gated = [];

for (const file of sarifFiles) {
  const doc = JSON.parse(readFileSync(file, "utf8"));
  for (const run of doc.runs ?? []) {
    const rulesById = Object.fromEntries(
      (run.tool?.driver?.rules ?? []).map((r) => [r.id, r]),
    );
    for (const result of run.results ?? []) {
      const rule = rulesById[result.ruleId];
      if (!shouldGate(result, rule)) continue;
      gated.push({
        ruleId: result.ruleId,
        level: result.level ?? rule?.defaultConfiguration?.level ?? "?",
        securitySeverity: parseSecuritySeverity(result, rule),
        message: result.message?.text ?? result.message?.markdown ?? "",
        location: locationLabel(result),
      });
    }
  }
}

console.log("CodeQL gate (no GHAS upload): security findings summary");
console.log(
  "Policy: security-tagged rules; fail on level error/warning or security-severity >= 4.0 (medium+)",
);
console.log(`SARIF inputs: ${sarifFiles.join(", ")}`);
console.log(`Gating findings: ${gated.length}`);

if (gated.length === 0) {
  console.log("No security findings met the gate threshold.");
  process.exit(0);
}

for (const f of gated) {
  const sev =
    f.securitySeverity === null ? "n/a" : f.securitySeverity.toFixed(1);
  console.log("");
  console.log(`- [${f.level}] ${f.ruleId} (security-severity ${sev})`);
  console.log(`  ${f.location}`);
  console.log(`  ${f.message.split("\n")[0]}`);
}

console.error(
  `\nCodeQL gate failed: ${gated.length} security finding(s) met the threshold.`,
);
process.exit(1);
