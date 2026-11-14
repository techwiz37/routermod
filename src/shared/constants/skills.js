
const REPO = "decolua/9router";
const BRANCH = "master";
const SKILL_PATH = "skills";

export const SKILLS_REPO_URL = `https://github.com/${REPO}`;
export const SKILLS_RAW_BASE = `https://raw.githubusercontent.com/${REPO}/refs/heads/${BRANCH}/${SKILL_PATH}`;
export const SKILLS_BLOB_BASE = `https://github.com/${REPO}/blob/${BRANCH}/${SKILL_PATH}`;

export const SKILLS = [
  {
    id: "9router",
    name: "9Router (Entry)",
    description: "Setup + index of all capabilities. Start here — covers base URL, auth, model discovery, and links to every capability skill.",
    endpoint: null,
    icon: "hub",
    category: "Getting started",
    usage: "Use this first to understand authentication, base URLs, and available capabilities.",
    isEntry: true,
  },
  {
    id: "9router-chat",
    name: "Chat",
    description: "Chat / code-gen via OpenAI or Anthropic format with streaming.",
    endpoint: "/v1/chat/completions",
    icon: "chat",
    category: "Text & code",
    usage: "Use for conversations, coding tasks, and streaming responses.",
  },
  {
    id: "9router-image",
    name: "Image Generation",
    description: "Text-to-image via DALL-E, Imagen, FLUX, MiniMax, SDWebUI…",
    endpoint: "/v1/images/generations",
    icon: "image",
    category: "Media",
    usage: "Use when an AI client needs to create images from a text prompt.",
  },
  {
    id: "9router-tts",
    name: "Text-to-Speech",
    description: "OpenAI / ElevenLabs / Edge / Google / Deepgram voices.",
    endpoint: "/v1/audio/speech",
    icon: "record_voice_over",
    category: "Media",
    usage: "Use to convert text into spoken audio with a selected voice.",
  },
  {
    id: "9router-stt",
    name: "Speech-to-Text",
    description: "Transcribe audio via OpenAI Whisper, Groq, Gemini, Deepgram, AssemblyAI…",
    endpoint: "/v1/audio/transcriptions",
    icon: "mic",
    category: "Media",
    usage: "Use to turn uploaded audio into text or subtitles.",
  },
  {
    id: "9router-embeddings",
    name: "Embeddings",
    description: "Vectors for RAG / semantic search via OpenAI, Gemini, Mistral…",
    endpoint: "/v1/embeddings",
    icon: "scatter_plot",
    category: "Search & RAG",
    usage: "Use to create vectors for semantic search and retrieval-augmented generation.",
  },
  {
    id: "9router-web-search",
    name: "Web Search",
    description: "Web and X search via Tavily / Exa / Brave / Serper / SearXNG / Google PSE / You.com / Xquik.",
    endpoint: "/v1/search",
    icon: "search",
    category: "Web",
    usage: "Use when an agent needs current web or X search results.",
  },
  {
    id: "9router-web-fetch",
    name: "Web Fetch",
    description: "URL → markdown / text / HTML via Firecrawl, Jina, Tavily, Exa.",
    endpoint: "/v1/web/fetch",
    icon: "language",
    category: "Web",
    usage: "Use to fetch a URL and return clean markdown, text, or HTML.",
  },
];

export function getSkillRawUrl(id) {
  return `${SKILLS_RAW_BASE}/${id}/SKILL.md`;
}

export function getSkillBlobUrl(id) {
  return `${SKILLS_BLOB_BASE}/${id}/SKILL.md`;
}
