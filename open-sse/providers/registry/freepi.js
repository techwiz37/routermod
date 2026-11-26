// FreePi — free AI coding agent via freepi-bridge.
//
// The Rust bridge (installed automatically by scripts/install-freepi-bridge.mjs
// on npm install) exposes an OpenAI-compatible endpoint on localhost:8787 and
// spends the user's FreePi account. RouterMod treats it as a noAuth free lane,
// the same way OpenCode Free and Solana AI are wired.
//
// FREEPI_TOKEN / ~/.free-pi/agent/credentials.json is read by the bridge
// process itself; RouterMod never stores the account JWT.
const BASE_URL = process.env.FREEPI_BRIDGE_BASE_URL
  || "http://127.0.0.1:8787/v1/chat/completions";

export default {
  id: "freepi",
  priority: 44,
  hasFree: true,
  alias: "fr",
  uiAlias: "fr",
  display: {
    name: "FreePi",
    icon: "auto_awesome",
    color: "#7C5CFF",
    textIcon: "FP",
  },
  category: "free",
  noAuth: true,
  transport: {
    baseUrl: BASE_URL,
    format: "openai",
    noAuth: true,
    // FreePi's upstream rate-limit window is short (a few seconds). The bridge
    // does not forward Retry-After, so retry with a steady backoff instead of
    // surfacing a hard 429 to the client.
    retry: { 429: { attempts: 6, delayMs: 3000 } },
  },
  // Mirrors `freepi-bridge models` (client 0.6.27, 27 models). The three
  // `free: true` promo models are listed first; the rest consume daily credits.
  models: [
    { id: "particle", name: "Particle-1 · Free Unlimited", free: true },
    { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash · Free Unlimited", free: true },
    { id: "glm-5.3-flash", name: "GLM 5.3 Flash · Free Unlimited", free: true },
    { id: "abliterated-large-flash", name: "Abliterated Large Flash" },
    { id: "abliterated-large-v2", name: "Abliterated Large V2" },
    { id: "deepseek-v4.1-flash-1017-ultrafast", name: "DeepSeek V4.1 Flash 600tps" },
    { id: "deepseek-v4.1-flash-abliterated", name: "DeepSeek V4.1 Flash Abliterated" },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
    { id: "gemini-4-carbon", name: "Gemini 4 Carbon" },
    { id: "gemini-4-hydrogen", name: "Gemini 4 Hydrogen" },
    { id: "gemini-4-neon", name: "Gemini 4 Neon" },
    { id: "gemma-4-uncensored", name: "Gemma 4 Uncensored" },
    { id: "glm-4.7-flash-heretic", name: "GLM 4.7 Flash Heretic" },
    { id: "gpt-6.2-astra", name: "GPT-6.2 Astra" },
    { id: "gpt-oss-20b", name: "GPT-OSS 20B" },
    { id: "hy4-flash", name: "Hy4 Flash" },
    { id: "inkling-2-mini", name: "Inkling 2 Mini" },
    { id: "kimi-k3.1-pro", name: "Kimi K3.1 Pro" },
    { id: "ling-3.0-flash", name: "Ling 3.0 Flash" },
    { id: "ling-3.1-flash", name: "Ling 3.1 Flash" },
    { id: "mimo-v2.6-flash", name: "MiMo V2.6 Flash (Xiaomi)" },
    { id: "qwen3.5-35b-darkbloom", name: "Qwen3.5 35B (Darkbloom)" },
    { id: "qwen3.6-plus-uncensored", name: "Qwen 3.6 Plus Uncensored" },
    { id: "qwen3.7-flash", name: "Qwen 3.7 Flash" },
    { id: "solar-mini-4", name: "Solar Mini 4" },
    { id: "solar-pro-4", name: "Solar Pro 4" },
    { id: "uncensored-1.2", name: "Uncensored 1.2" },
  ],
  passthroughModels: true,
  modelsFetcher: {
    url: "http://127.0.0.1:8787/v1/models",
    type: "openai",
  },
};
