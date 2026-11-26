// Rolling windows available for the per-key token quota.
// `ms` is the lookback used when summing usageHistory rows.
export const TOKEN_WINDOWS = {
  "1m": { ms: 60 * 1000, label: "1 minute" }, // For testing only
  "1h": { ms: 60 * 60 * 1000, label: "1 hour" },
  "24h": { ms: 24 * 60 * 60 * 1000, label: "24 hours" },
  "7d": { ms: 7 * 24 * 60 * 60 * 1000, label: "7 days" },
  "30d": { ms: 30 * 24 * 60 * 60 * 1000, label: "30 days" },
};

export const DEFAULT_TOKEN_WINDOW = "24h";

export function tokenWindowMs(window) {
  return (TOKEN_WINDOWS[window] || TOKEN_WINDOWS[DEFAULT_TOKEN_WINDOW]).ms;
}

/**
 * Absolute expiry for a key. An explicit expiresAt always wins. Otherwise a
 * quota with "Reset token" turned off is a fixed lifetime: the key dies when
 * the window ends, whether or not any tokens are left. A quota that resets
 * every window never expires on its own.
 */
export function keyExpiryAt(record) {
  if (!record) return null;
  if (record.expiresAt) return record.expiresAt;
  const resetEnabled = !(record.tokenResetEnabled === false || record.tokenResetEnabled === 0);
  if (resetEnabled) return null;
  const hasQuota = Number(record.tokenLimit) > 0 || Number(record.spendLimit) > 0;
  if (!hasQuota) return null;
  const anchor = Date.parse(record.tokenCycleStart || record.createdAt || "");
  if (!Number.isFinite(anchor)) return null;
  return new Date(anchor + tokenWindowMs(record.tokenLimitWindow)).toISOString();
}
