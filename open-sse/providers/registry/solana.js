// solana.ai/chat — browser-backed free bridge (solana2api).
//
// The Python bridge runs Camoufox headful under Xvfb and handles the Vercel
// challenge, HPKE enclave and x-is-human JWE itself. RouterMod only needs an
// OpenAI-compatible chat endpoint, so this is a noAuth free provider exactly
// like OpenCode Free — no account session, OAuth or API key is stored here.
//
// Override SOLANA2API_BASE_URL when the bridge runs on another host/container
// (e.g. http://host.docker.internal:18620/v1/chat/completions).
const BASE_URL = process.env.SOLANA2API_BASE_URL
  || "http://127.0.0.1:18620/v1/chat/completions";

export default {
  id: "solana",
  priority: 45,
  hasFree: true,
  alias: "sol",
  uiAlias: "sol",
  display: {
    name: "Solana AI",
    icon: "bolt",
    color: "#14F195",
    textIcon: "SOL",
  },
  category: "free",
  noAuth: true,
  transport: {
    baseUrl: BASE_URL,
    format: "openai",
    noAuth: true,
    // The bridge returns response headers only after the browser finishes the
    // whole turn, which routinely takes 30-90s. Keep the connect deadline above
    // that so a slow-but-healthy answer is not aborted and retried. A saturated
    // worker pool answers 503 quickly, so the only long wait is real work.
    timeoutMs: 150000,
    retry: { 429: { attempts: 5, delayMs: 2500 }, 503: { attempts: 2, delayMs: 4000 } },
  },
  // From the bridge's /v1/models + MODEL_MAP. Extra alias is accepted via
  // passthroughModels so new upstream ids work without a rebuild.
  models: [
    { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash" },
    { id: "solana", name: "Solana (DeepSeek V4.1 Flash)" },
    { id: "gpt-oss-120b", name: "GPT-OSS 120B" },
    { id: "deepseek/deepseek-v4.1-flash:encrypted", name: "DeepSeek V4.1 Flash (Encrypted)" },
  ],
  passthroughModels: true,
};
