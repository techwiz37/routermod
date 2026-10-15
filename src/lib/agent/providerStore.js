import crypto from "node:crypto";
import { getSettings, updateSettings } from "@/lib/db/repos/settingsRepo";
import { getCapabilitiesForModel } from "open-sse/providers/capabilities.js";
import { findModelName } from "open-sse/config/providerModels.js";
import REGISTRY from "open-sse/providers/registry/index.js";

function humanizeId(id) {
  return String(id || "")
    .split(":")[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function providerDisplayName(alias) {
  if (!alias) return "";
  const entry = REGISTRY.find((e) => e.alias === alias || e.id === alias);
  return entry?.display?.name || humanizeId(alias);
}

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function genId() {
  return crypto.randomUUID();
}

function maskKey(key) {
  if (!key) return "";
  const s = String(key);
  if (s.length <= 8) return "••••";
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

function splitModelId(id) {
  const slash = String(id).indexOf("/");
  if (slash === -1) return { provider: null, model: String(id) };
  return { provider: String(id).slice(0, slash), model: String(id).slice(slash + 1) };
}

function capsForModel(id) {
  try {
    const { provider, model } = splitModelId(id);
    const c = getCapabilitiesForModel(provider, model);
    return {
      vision: Boolean(c.vision),
      pdf: Boolean(c.pdf),
      audioInput: Boolean(c.audioInput),
      videoInput: Boolean(c.videoInput),
      imageOutput: Boolean(c.imageOutput),
      audioOutput: Boolean(c.audioOutput),
      search: Boolean(c.search),
      reasoning: Boolean(c.reasoning),
      tools: c.tools !== false,
      contextWindow: c.contextWindow || null,
      maxOutput: c.maxOutput || null,
    };
  } catch (_e) {
    /* eslint-disable-next-line no-empty */
  }
  return null;
}

function modelMeta(id) {
  if (!id || typeof id !== "string") return null;
  const { provider, model } = splitModelId(id);
  let name = "";
  if (provider) {
    try {
      const found = findModelName(provider, model);
      if (found && found !== model) name = found;
    } catch (_e) {
      /* eslint-disable-next-line no-empty */
    }
  }
  if (!name) name = humanizeId(model);
  return {
    id,
    name,
    provider: provider || "",
    providerName: provider ? providerDisplayName(provider) : "",
    caps: capsForModel(id),
  };
}

function normalizeModels(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((m) => modelMeta(typeof m === "string" ? m : m?.id)).filter(Boolean);
}

async function readRawProviders() {
  const settings = await getSettings();
  return Array.isArray(settings.agentProviders) ? settings.agentProviders : [];
}

async function writeRawProviders(providers) {
  await updateSettings({ agentProviders: providers });
}

export async function listProviders({ reveal = false } = {}) {
  const raw = await readRawProviders();
  return raw.map((p) => ({
    id: p.id,
    name: p.name || "Untitled",
    baseUrl: p.baseUrl || "",
    hasKey: Boolean(p.apiKey),
    apiKey: reveal ? p.apiKey || "" : maskKey(p.apiKey),
    models: normalizeModels(p.models),
    defaultModel: p.defaultModel || "",
    createdAt: p.createdAt || null,
    updatedAt: p.updatedAt || null,
  }));
}

export async function getProvider(id) {
  const providers = await readRawProviders();
  return providers.find((p) => p.id === id) || null;
}

export async function getProviderSecret(id) {
  const p = await getProvider(id);
  if (!p) throw new Error("Provider not found");
  return { baseUrl: p.baseUrl, apiKey: p.apiKey || "", defaultModel: p.defaultModel || "" };
}

export async function upsertProvider(input) {
  const providers = await readRawProviders();
  const now = new Date().toISOString();
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  if (!baseUrl) throw new Error("baseUrl is required");

  const normName = String(input.name || "").trim().toLowerCase();
  const normUrl = baseUrl.toLowerCase();
  const isDuplicate = (p) => (p.name || "").trim().toLowerCase() === normName && (p.baseUrl || "").trim().replace(/\/+$/, "").toLowerCase() === normUrl;

  if (input.id) {
    const idx = providers.findIndex((p) => p.id === input.id);
    if (idx === -1) throw new Error("Provider not found");
    if (!normName) throw new Error("name is required");
    const clash = providers.some((p) => p.id !== input.id && isDuplicate(p));
    if (clash) throw new Error("Provider dengan nama + base URL yang sama sudah ada");
    const existing = providers[idx];
    providers[idx] = {
      ...existing,
      name: input.name ?? existing.name,
      baseUrl,
      apiKey: input.apiKey != null && input.apiKey !== "" ? input.apiKey : existing.apiKey,
      defaultModel: input.defaultModel ?? existing.defaultModel,
      updatedAt: now,
    };
    await writeRawProviders(providers);
    return providers[idx].id;
  }

  if (!normName) throw new Error("name is required");
  if (providers.some(isDuplicate)) {
    throw new Error("Provider dengan nama + base URL yang sama sudah ada");
  }

  const id = genId();
  providers.push({
    id,
    name: String(input.name).trim(),
    baseUrl,
    apiKey: input.apiKey || "",
    models: [],
    defaultModel: input.defaultModel || "",
    createdAt: now,
    updatedAt: now,
  });
  await writeRawProviders(providers);
  return id;
}

export async function deleteProvider(id) {
  const providers = await readRawProviders();
  await writeRawProviders(providers.filter((p) => p.id !== id));
  return true;
}

export async function reloadModels(id) {
  const secret = await getProviderSecret(id);
  const url = `${secret.baseUrl}/models`;
  const headers = { Accept: "application/json" };
  if (secret.apiKey) headers.Authorization = `Bearer ${secret.apiKey}`;

  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  } catch (e) {
    throw new Error(`Request to ${url} failed: ${e?.message || e}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upstream returned HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json().catch(() => null);
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  const ids = list
    .map((m) => (typeof m === "string" ? m : m?.id))
    .filter((v) => typeof v === "string" && v.trim())
    .map((v) => v.trim());
  const models = ids.map((id) => modelMeta(id)).filter(Boolean);

  const providers = await readRawProviders();
  const idx = providers.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error("Provider not found");
  providers[idx] = { ...providers[idx], models, updatedAt: new Date().toISOString() };
  await writeRawProviders(providers);
  return models;
}

export async function resolveModelTarget({ providerId, model } = {}) {
  const providers = await readRawProviders();
  if (!providers.length) throw new Error("No agent model provider configured");

  let chosen = providerId ? providers.find((p) => p.id === providerId) : null;
  if (!chosen) chosen = providers.find((p) => p.defaultModel) || providers[0];
  if (!chosen) throw new Error("No agent model provider configured");

  const first = normalizeModels(chosen.models)[0]?.id;
  const chosenModel = model || chosen.defaultModel || first;
  if (!chosenModel) throw new Error("No model selected (run 'Reload models' first)");

  return {
    baseUrl: normalizeBaseUrl(chosen.baseUrl),
    apiKey: chosen.apiKey || "",
    model: chosenModel,
    providerId: chosen.id,
  };
}
