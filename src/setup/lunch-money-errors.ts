export function isLunchMoneyUnauthorized(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unauthorized/i.test(message) || /\b401\b/.test(message);
}

export function isDuplicateAssetDisplayName(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("ASSET_DISPLAY_NAME_ALREADY_EXISTS");
}
