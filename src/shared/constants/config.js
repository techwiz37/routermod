import pkg from "../../../package.json" with { type: "json" };

export const APP_CONFIG = {
  name: "RouterMod",
  description: "AI Infrastructure Management",
  version: pkg.version,
};

export const GITHUB_CONFIG = {
  changelogUrl: "https://raw.githubusercontent.com/decolua/9router/refs/heads/master/CHANGELOG.md",
  donateUrl: "https://9router.com/api/donate",
};

export const UPDATER_CONFIG = {
  npmPackageName: "routermod",
  installCmd: "npm i -g routermod",
  installCmdLatest: "npm i -g routermod@latest --prefer-online",
  shutdownCountdownSec: 3,
  exitDelayMs: 500,
  statusPort: 20129,
  statusPollIntervalMs: 1000,
  statusLogTailLines: 8,
  installRetries: 3,
  installRetryDelayMs: 5000,
  lingerAfterDoneMs: 30000,
  waitForExitMinMs: 5000,
  waitForExitMaxMs: 20000,
  waitForExitCheckMs: 500,
  appPort: 1337,
};

export const THEME_CONFIG = {
  storageKey: "theme",
  defaultTheme: "light", // "light" | "dark" | "system"
};

export const SUBSCRIPTION_CONFIG = {
  price: 1.0,
  currency: "USD",
  interval: "month",
  planName: "Pro Plan",
};

export const API_ENDPOINTS = {
  users: "/api/users",
  providers: "/api/providers",
  payments: "/api/payments",
  auth: "/api/auth",
};

export const CONSOLE_LOG_CONFIG = {
  maxLines: 200,
  pollIntervalMs: 1000,
};

export const CLIENT_STORE_TTL_MS = 60000;

export const QUOTA_AUTOPING_CONFIG = {
  tickIntervalMs: 60000,                // scheduler tick
  pingLeadMs: 5000,                     // fire once reset passes (within tolerance)
  refreshAheadMs: 300000,               // refetch usage when within 5min of reset
  failureCooldownMs: 900000,            // avoid failed ping spam while upstream/auth is unhealthy
  providers: {
    claude: {
      settingsKey: "claudeAutoPing",    // preserve existing settings contract
      quotaKey: "session (5h)",         // quota key returned by usage handler
      pingModel: "claude-haiku-4-5-20251001",
      pingText: "hi",
      pingMaxTokens: 1,
    },
    codex: {
      settingsKey: "codexAutoPing",
      quotaKey: "session",
      pingWhenResetAtSlides: true,
      resetAtDriftMs: 30000,
      minPingIntervalMs: 600000,
      skipWhenBlockingQuotaExhausted: true,
      // gpt-5.6-terra is the lightweight model for auto-pinging Codex 5h reset window.
      pingModel: "gpt-5.6-terra",
      pingText: "hi",
      pingInstructions: "Reply with OK.",
      pingReasoningEffort: "none",
    },
  },
};

// Proactive health checker for Token Harbor (apikey) accounts.
//
// The reactive path (markAccountUnavailable on a real 429) only fires AFTER a
// user request already hit a limited account. Token Harbor is a prepaid-wallet
// aggregator, so an exhausted balance surfaces as 402 / "insufficient quota"
// on the chat endpoint — NOT on /v1/models (which only proves the key is
// alive). This checker probes each active account on the chat endpoint with a
// 1-token request to a free model so a limited/exhausted account is detected
// BEFORE traffic selects it, then locks it via modelLock___all (the same field
// getProviderCredentials already skips) until it recovers.
export const TOKENHARBOR_HEALTH_CONFIG = {
  provider: "tokenharbor",
  settingsKey: "tokenharborHealthEnabled", // set false in settings to opt out
  tickIntervalMs: 40000,        // check every 40s
  initialDelayMs: 20000,        // let server finish booting first
  maxConcurrent: 3,             // parallel probes per tick
  requestTimeoutMs: 20000,      // abort a hung probe
  pingModel: "deepseek-v4.1-flash:free", // free model → probe costs ~nothing
  pingText: "ping",
  pingMaxTokens: 1,
  limitCooldownMs: 5 * 60 * 1000,  // limited/empty wallet → re-probe later
  deadCooldownMs: 15 * 60 * 1000,  // rejected key → bg health retests & recovers
  lockedRecheckMs: 2 * 60 * 1000,  // throttle re-probe of already-locked accounts
  healthyRecheckMs: 40000,         // healthy accounts re-probed each tick
  limitKeywords: [
    "quota", "balance", "insufficient", "limit", "allowance",
    "exhausted", "too many requests", "rate", "credit", "top up", "topup",
  ],
};

export {
  FREE_PROVIDERS,
  OAUTH_PROVIDERS,
  APIKEY_PROVIDERS,
  WEB_COOKIE_PROVIDERS,
  AI_PROVIDERS,
  AUTH_METHODS,
} from "./providers.js";

export {
  PROVIDER_MODELS,
  AI_MODELS,
} from "./models.js";
