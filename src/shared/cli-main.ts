/** Runs `main` when this module is the Node entry script. */
export function runCliModuleMain(main: () => Promise<void>): void {
  if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  }
}
