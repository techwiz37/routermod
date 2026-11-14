// Rolling windows available for the per-key token quota.
// `ms` is the lookback used when summing usageHistory rows.
export const TOKEN_WINDOWS = {
  "1h": { ms: 60 * 60 * 1000, label: "1 hour" },
  "24h": { ms: 24 * 60 * 60 * 1000, label: "24 hours" },
  "7d": { ms: 7 * 24 * 60 * 60 * 1000, label: "7 days" },
  "30d": { ms: 30 * 24 * 60 * 60 * 1000, label: "30 days" },
};

export const DEFAULT_TOKEN_WINDOW = "24h";

export function tokenWindowMs(window) {
  return (TOKEN_WINDOWS[window] || TOKEN_WINDOWS[DEFAULT_TOKEN_WINDOW]).ms;
}
