import path from "node:path";
import { fileURLToPath } from "node:url";

/** Runs `main` when the given module is the Node entry script (see `setup.ts`). */
export function runCliModuleMain(main: () => Promise<void>, moduleUrl: string = import.meta.url): void {
  const entryScript = process.argv[1];
  if (entryScript !== undefined && fileURLToPath(moduleUrl) === path.resolve(entryScript)) {
    main().catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  }
}
