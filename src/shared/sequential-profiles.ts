/**
 * Runs async steps strictly in order. Broker subprocess CLIs keep global session state
 * and Inquirer owns stdin — parallel profile work would corrupt both, so this stays serial
 * (not parallelized with Promise.all).
 */
export async function forEachSequentially<TItem>(
  items: readonly TItem[],
  run: (item: TItem) => Promise<void>,
): Promise<void> {
  await items.reduce<Promise<void>>((chain, item) => chain.then(() => run(item)), Promise.resolve());
}

/** @see forEachSequentially — same contract for configured broker profiles. */
export const forEachProfileSequentially = forEachSequentially;

export interface RepeatConfirmedPrompter {
  confirm(message: string, defaultValue?: boolean): Promise<boolean>;
}

/**
 * Runs interactive `step` callbacks strictly in order. When `startWithoutConfirm` is true the
 * first step runs immediately; every subsequent step requires confirming `confirmMessage`.
 */
export async function forEachConfirmedRepeat(
  prompter: RepeatConfirmedPrompter,
  confirmMessage: string,
  startWithoutConfirm: boolean,
  step: () => Promise<void>,
): Promise<void> {
  const runNext = async (skipConfirm: boolean): Promise<void> => {
    if (!skipConfirm && !(await prompter.confirm(confirmMessage, false))) {
      return;
    }
    await step();
    await runNext(false);
  };
  if (startWithoutConfirm) {
    await runNext(true);
  }
}
