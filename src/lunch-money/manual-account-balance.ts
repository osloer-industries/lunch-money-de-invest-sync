/** Narrow slice of the Lunch Money v2 manual-accounts API used to read and set balances. */
export interface ManualAccountBalanceApi {
  manualAccounts: {
    get: (id: number) => Promise<{ balance: string; currency: string }>;
    update: (id: number, data: { balance: string; balance_as_of?: string }) => Promise<unknown>;
  };
}

export interface ManualAccountBalance {
  readonly balance: number;
  readonly currency: string;
}

export async function getManualAccountBalance(
  client: ManualAccountBalanceApi,
  accountId: number,
): Promise<ManualAccountBalance> {
  const account = await client.manualAccounts.get(accountId);
  const balance = Number(account.balance);
  if (!Number.isFinite(balance)) {
    throw new TypeError(`Lunch Money manual account ${accountId} returned a non-numeric balance`);
  }
  return { balance, currency: account.currency.toLowerCase() };
}

/** `PUT /manual_accounts/{id}` with a 2-decimal balance; `balance_as_of` defaults to now on the server. */
export async function setManualAccountBalance(
  client: ManualAccountBalanceApi,
  accountId: number,
  balance: number,
  asOf?: string,
): Promise<void> {
  await client.manualAccounts.update(accountId, {
    balance: balance.toFixed(2),
    ...(asOf ? { balance_as_of: asOf } : {}),
  });
}
