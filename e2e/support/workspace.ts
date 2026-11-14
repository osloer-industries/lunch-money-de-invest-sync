import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { e2eFixturesDir, e2eStubsDir, repoRoot } from "./paths.js";
import { lunchMoneyE2eApiKey, type LunchMoneyMockServer } from "./lunch-money-mock.js";

export interface E2eWorkspace {
  readonly dir: string;
  readonly stubBinDir: string;
  readonly env: NodeJS.ProcessEnv;
}

export interface WorkspaceOptions {
  readonly mock: LunchMoneyMockServer;
  readonly pytrScenario?: string;
  readonly scScenario?: string;
}

async function installStub(binDir: string, name: string, source: string): Promise<void> {
  const target = path.join(binDir, name);
  const body = await readFile(source, "utf8");
  const withoutShebang = body.replace(/^#![^\n]*\n/, "");
  await writeFile(target, `#!${process.execPath}\n${withoutShebang}`, "utf8");
  await chmod(target, 0o755);
}

async function installFakeNodeModules(workspaceDir: string): Promise<void> {
  const tsxDir = path.join(workspaceDir, "node_modules", "tsx");
  await mkdir(tsxDir, { recursive: true });
  await writeFile(path.join(tsxDir, "package.json"), '{"name":"tsx"}\n', "utf8");
}

export async function createE2eWorkspace(options: WorkspaceOptions): Promise<E2eWorkspace> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "lm-e2e-"));
  const stubBinDir = path.join(dir, "bin");
  const localBinDir = path.join(dir, ".local", "bin");
  await mkdir(stubBinDir, { recursive: true });
  await mkdir(localBinDir, { recursive: true });
  await installFakeNodeModules(dir);

  for (const targetDir of [stubBinDir, localBinDir]) {
    await installStub(targetDir, "pytr", path.join(e2eStubsDir, "pytr-stub.mjs"));
    await installStub(targetDir, "sc", path.join(e2eStubsDir, "sc-stub.mjs"));
    await installStub(targetDir, "uv", path.join(e2eStubsDir, "uv-stub.mjs"));
    await installStub(targetDir, "uvx", path.join(e2eStubsDir, "uvx-stub.mjs"));
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: dir,
    PATH: process.env.PATH ?? "",
    LM_CLI_EXTRA_SEARCH_DIR: stubBinDir,
    LUNCH_MONEY_API_BASE_URL: options.mock.baseUrl,
    LUNCH_MONEY_API_KEY: lunchMoneyE2eApiKey,
    LM_E2E_FIXTURES_DIR: e2eFixturesDir,
    LM_E2E_REPO_ROOT: repoRoot,
    LM_E2E_FAST: "1",
    LM_E2E_PYTR_SCENARIO: options.pytrScenario ?? "ok",
    LM_E2E_SC_SCENARIO: options.scScenario ?? "ok",
    LM_MEMORY_API_KEY_STORE: "1",
    LM_E2E_PRESET_API_KEY: lunchMoneyE2eApiKey,
  };

  return { dir, stubBinDir, env };
}

export async function destroyE2eWorkspace(workspace: E2eWorkspace): Promise<void> {
  await rm(workspace.dir, { recursive: true, force: true });
}

export async function writeWorkspaceConfig(
  workspace: E2eWorkspace,
  content: Record<string, unknown>,
): Promise<void> {
  await writeFile(path.join(workspace.dir, "config.json"), `${JSON.stringify(content, null, 2)}\n`, "utf8");
}

export async function readWorkspaceConfig(workspace: E2eWorkspace): Promise<Record<string, unknown>> {
  const text = await readFile(path.join(workspace.dir, "config.json"), "utf8");
  return JSON.parse(text) as Record<string, unknown>;
}

export function cliEntryArgs(
  entry: "doctor" | "setup" | "sync",
  scriptArgs: readonly string[] = [],
): { readonly command: string; readonly args: readonly string[] } {
  const tsx = path.join(repoRoot, "node_modules", ".bin", "tsx");
  const script = path.join(repoRoot, "src", `${entry}.ts`);
  return { command: tsx, args: [script, ...scriptArgs] };
}