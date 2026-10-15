// APInex — OpenAI-compatible aggregator with a zero-cost `free/*` lane.
// One key reaches both the free tier and the paid catalogue; ids keep their
// vendor prefix (e.g. `free/claude-opus-4.6`, `free/deepseek-v4.1-flash`).
// Verified live: POST /v1/chat/completions with model `free/deepseek-v4.1-flash`
// returns cost_tokens:0. Docs: https://apinex.bond
export default {
  id: "apinex",
  alias: "apinex",
  aliases: [
    "apx",
    "api-nex",
  ],
  uiAlias: "apx",
  display: {
    name: "APInex",
    icon: "hub",
    color: "#B18E58",
    textIcon: "AX",
    website: "https://apinex.bond",
    notice: {
      text: "OpenAI-compatible aggregator with a free tier. Model ids keep their vendor prefix — the zero-cost set lives under `free/` (e.g. free/deepseek-v4.1-flash, free/gemini-3.1-pro), paid models are bare (e.g. claude-opus-5.5). The live catalogue is fetched from the provider.",
      apiKeyUrl: "https://apinex.bond",
    },
  },
  category: "freeTier",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.apinex.bond/v1/chat/completions",
    validateUrl: "https://api.apinex.bond/v1/models",
  },
  // Curated seed of the zero-cost lane; the live catalogue is fetched via
  // modelsFetcher and any other id is accepted via passthroughModels. The seed
  // is the offline fallback, so it stays small.
  //
  // Verified live against the public free key (4 runs each): the ids below all
  // answer 200 on /v1/chat/completions and support images. Models that returned
  // HTTP 402 ("available only with a subscription") or that are not chat
  // endpoints (free/jev-1.13 is a /v1/decisions model) were dropped from the
  // seed — they remain reachable via passthroughModels if a subscription is
  // added later.
  models: [
    { id: "free/gemini-3.8-flash", name: "Gemini 3.8 Flash (Free · Vision)", contextLength: 1000000 },
    { id: "free/gpt-6-luna", name: "GPT-6 Luna (Free · Vision)", contextLength: 400000 },
    { id: "free/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash (Free · Vision)", contextLength: 128000 },
    { id: "free/deepseek-v4-pro-0813", name: "DeepSeek V4 Pro 0813 (Free · Vision)", contextLength: 128000 },
    { id: "free/deepseek-v4-flash-0731", name: "DeepSeek V4 Flash 0731 (Free · Vision)", contextLength: 128000 },
    { id: "free/glm-5.3-flash", name: "GLM 5.3 Flash (Free · Vision)", contextLength: 200000 },
    { id: "free/qwen-3.8-max", name: "Qwen 3.8 Max (Free · Vision)", contextLength: 262144 },
    { id: "free/mimo-v2.6-pro", name: "MiMo V2.6 Pro (Free · Vision)" },
  ],
  modelsFetcher: { url: "https://api.apinex.bond/v1/models", type: "openai" },
  passthroughModels: true,
};
