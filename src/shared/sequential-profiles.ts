/**
 * Runs async steps strictly in order. Broker subprocess CLIs keep global session state
 * and Inquirer owns stdin — parallel profile work would corrupt both, so this stays serial
 * (not parallelized with Promise.all).
 */
export async function forEachSequentially<TItem>(
  items: readonly TItem[],
  run: (item: TItem) => Promise<void>,
): Promise<void> {
  for (const item of items) {
    await run(item);
  }
}

/** @see forEachSequentially — same contract for configured broker profiles. */
export const forEachProfileSequentially = forEachSequentially;
