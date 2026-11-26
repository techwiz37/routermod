export default {
  id: "kiro",
  priority: 10,
  alias: "kr",
  uiAlias: "kr",
  display: {
    name: "Kiro AI",
    icon: "psychology_alt",
    color: "#FF6B35",
    website: "https://kiro.dev",
    notice: {
      signupUrl: "https://kiro.dev",
    },
    deprecated: true,
    deprecationNotice: "RISK_NOTICE",
  },
  category: "free",
  transport: {
    baseUrl: "https://runtime.us-east-1.kiro.dev/generateAssistantResponse",
    baseUrls: [
      "https://runtime.us-east-1.kiro.dev/generateAssistantResponse",
      "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse",
      "https://q.us-east-1.amazonaws.com/generateAssistantResponse",
    ],
    format: "kiro",
    retry: {
      "429": 2,
    },
    headers: {
      "Content-Type": "application/json",
      Accept: "application/vnd.amazon.eventstream",
    },
    tokenUrl: "https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken",
    authUrl: "https://prod.us-east-1.auth.desktop.kiro.dev",
    usage: {
      cwHost: "https://codewhisperer.us-east-1.amazonaws.com",
      qHost: "https://q.us-east-1.amazonaws.com",
      limitsPath: "/getUsageLimits",
    },
  },
  // Static fallback = live ListAvailableModels catalog for Kiro free / Builder ID
  // accounts (verified 2026-11-14). Paid-plan models (Opus, Sonnet 5.x, GPT-5.6,
  // Kimi K3, Grok …) are served per-account by services/kiroModels.js live fetch.
  // Only upstream model ids are listed — no synthetic `-thinking` / `-agentic`
  // variants.
  models: [
    // Auto — Kiro picks the model server-side.
    { id: "auto", name: "Auto", contextLength: 1000000, rateMultiplier: 1.0 },
    // Claude
    { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5", contextLength: 200000, rateMultiplier: 1.3 },
    { id: "claude-haiku-4.5", name: "Claude Haiku 4.5", contextLength: 200000, rateMultiplier: 0.4 },
    // Open-weight
    { id: "deepseek-3.2", name: "DeepSeek 3.2", contextLength: 164000, rateMultiplier: 0.25, strip: ["image","audio"] },
    { id: "minimax-m2.5", name: "MiniMax M2.5", contextLength: 196000, rateMultiplier: 0.25 },
    { id: "minimax-m2.1", name: "MiniMax M2.1", contextLength: 196000, rateMultiplier: 0.15 },
    { id: "glm-5", name: "GLM 5", contextLength: 200000, rateMultiplier: 0.5 },
    { id: "qwen3-coder-next", name: "Qwen3 Coder Next", contextLength: 256000, rateMultiplier: 0.05, strip: ["image","audio"] },
  ],
  oauth: {
    defaultRegion: "us-east-1",
    // Kiro's token endpoints occasionally omit expiresIn. Keep a sane default
    // so a successful refresh never leaves a stale (already expired) expiresAt.
    defaultExpiresIn: 3600,
    refreshTimeoutMs: 30_000,
    refreshFailureCooldownMs: 60_000,
    refreshRejectedCacheMs: 6 * 60 * 60 * 1000,
    permanentRefreshErrors: ["access_denied", "invalid_grant", "invalid_client", "unauthorized_client", "expired_token"],
    ssoOidcEndpoint: "https://oidc.us-east-1.amazonaws.com",
    registerClientUrl: "https://oidc.us-east-1.amazonaws.com/client/register",
    deviceAuthUrl: "https://oidc.us-east-1.amazonaws.com/device_authorization",
    tokenUrl: "https://oidc.us-east-1.amazonaws.com/token",
    startUrl: "https://view.awsapps.com/start",
    // Mirrors Kiro IDE's SSO OIDC client registration.
    clientName: "Kiro IDE",
    clientType: "public",
    scopes: [
      "codewhisperer:completions",
      "codewhisperer:analysis",
      "codewhisperer:conversations",
      "codewhisperer:transformations",
      "codewhisperer:taskassist",
    ],
    grantTypes: [
      "urn:ietf:params:oauth:grant-type:device_code",
      "refresh_token",
    ],
    issuerUrl: "https://identitycenter.amazonaws.com/ssoins-722374e8c3c8e6c6",
    socialAuthEndpoint: "https://prod.us-east-1.auth.desktop.kiro.dev",
    socialLoginUrl: "https://prod.us-east-1.auth.desktop.kiro.dev/login",
    socialTokenUrl: "https://prod.us-east-1.auth.desktop.kiro.dev/oauth/token",
    socialRefreshUrl: "https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken",
    authMethods: [
      "builder-id",
      "idc",
      "google",
      "github",
      "import",
    ],
  },
  features: {
    usage: true,
    usageApikey: true,
  },
};
