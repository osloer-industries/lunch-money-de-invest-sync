#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

const stubDir = path.dirname(new URL(import.meta.url).pathname);
const pytr = path.join(stubDir, "pytr-stub.mjs");
const result = spawnSync(process.execPath, [pytr, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);