import path from "node:path";
import { fileURLToPath } from "node:url";

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(e2eDir, "../..");
export const e2eStubsDir = path.join(e2eDir, "../stubs");
export const e2eFixturesDir = path.join(e2eDir, "../fixtures");