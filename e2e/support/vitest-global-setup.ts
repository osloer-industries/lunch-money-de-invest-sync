import { ensureNodePtySpawnHelperExecutable } from "./ensure-node-pty-executable.js";

export default async function globalSetup(): Promise<void> {
  await ensureNodePtySpawnHelperExecutable();
}