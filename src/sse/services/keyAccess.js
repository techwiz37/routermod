import { getApiKeyByKey } from "@/lib/db/repos/apiKeysRepo.js";
import { getCombos } from "@/lib/db/repos/combosRepo.js";
import { getModelInfo, getComboModels } from "./model.js";
import { resolveProviderId } from "@/shared/constants/providers.js";
import {
  KEY_ACCESS_COMBO_OWNER,
  KEY_ACCESS_PROVIDER_AS_MODEL_KINDS,
  keyAccessDeniedMessage,
} from "@/shared/constants/keyAccess.js";
import { errorResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import * as log from "../utils/logger.js";

const lower = (s) => String(s).toLowerCase();
const canonicalModel = (provider, model) => lower(`${provider}/${model}`);

export function extractClientApiKey(request) {
  const headers = request?.headers;
  if (!headers?.get) return null;
  const auth = headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const xApiKey = headers.get("x-api-key");
  if (xApiKey) return xApiKey;
  const googKey = headers.get("x-goog-api-key");
  if (googKey) return googKey;
  try {
    return new URL(request.url).searchParams.get("key") || null;
  } catch {
    return null;
  }
}

export async function getKeyAccessContext(request) {
  if (request?.headers?.get && request.headers.get("x-9r-cli-token")) {
    return null;
  }
  const apiKey = extractClientApiKey(request);
  if (!apiKey) return null;
  const record = await getApiKeyByKey(apiKey);
  if (!record?.access?.restricted) return null;
  return {
    keyId: record.id,
    keyName: record.name || record.id,
    allow: record.access.allow || [],
    _sets: null,
  };
}

async function getAllowSets(ctx) {
  if (ctx._sets) return ctx._sets;
  const comboNames = new Set((await getCombos()).map((c) => lower(c.name)));
  const combos = new Set();
  const models = new Set();
  const providers = new Set();
  for (const entry of ctx.allow) {
    const key = lower(entry);
    if (comboNames.has(key)) {
      combos.add(key);
      continue;
    }
    const info = await getModelInfo(entry);
    if (info?.provider && info.model) models.add(canonicalModel(info.provider, info.model));
    if (!entry.includes("/")) providers.add(lower(resolveProviderId(entry)));
  }
  ctx._sets = { combos, models, providers };
  return ctx._sets;
}

async function isModelStringAllowed(ctx, requested) {
  const sets = await getAllowSets(ctx);
  const info = await getModelInfo(requested);
  if (!info?.provider) return sets.combos.has(lower(requested));
  return sets.models.has(canonicalModel(info.provider, info.model));
}

export function keyAccessDeniedResponse(ctx, requested) {
  log.warn("AUTH", `key-access: key "${ctx.keyName}" denied "${requested}"`);
  return errorResponse(HTTP_STATUS.FORBIDDEN, keyAccessDeniedMessage(requested));
}

export async function enforceKeyAccess(ctx, requested) {
  if (!ctx) return null;
  if (typeof requested !== "string" || !requested) return keyAccessDeniedResponse(ctx, String(requested ?? ""));
  const sets = await getAllowSets(ctx);
  const comboModels = await getComboModels(requested);
  const allowed = comboModels
    ? sets.combos.has(lower(requested))
    : await isModelStringAllowed(ctx, requested);
  return allowed ? null : keyAccessDeniedResponse(ctx, requested);
}

export async function enforceKeyAccessResolved(ctx, requested, provider, model) {
  if (!ctx) return null;
  const label = requested || (provider ? `${provider}/${model ?? ""}` : "");
  if (!provider || !model) return keyAccessDeniedResponse(ctx, label);
  const sets = await getAllowSets(ctx);
  return sets.models.has(canonicalModel(provider, model)) ? null : keyAccessDeniedResponse(ctx, label);
}

export async function enforceKeyAccessProvider(ctx, requested, comboModels) {
  if (!ctx) return null;
  if (typeof requested !== "string" || !requested) return keyAccessDeniedResponse(ctx, String(requested ?? ""));
  const sets = await getAllowSets(ctx);
  const allowed = comboModels
    ? sets.combos.has(lower(requested))
    : sets.providers.has(lower(resolveProviderId(requested)));
  return allowed ? null : keyAccessDeniedResponse(ctx, requested);
}

export async function filterAdapterModels(ctx, augmented, original) {
  if (!ctx || !Array.isArray(augmented)) return augmented;
  const keep = new Set(original || []);
  const out = [];
  for (const m of augmented) {
    if (keep.has(m) || await isModelStringAllowed(ctx, m)) out.push(m);
    else log.info("AUTH", `key-access: key "${ctx.keyName}" skips adapter model "${m}" (not allowed)`);
  }
  return out;
}

export async function filterModelsListForKey(ctx, list) {
  if (!ctx || !Array.isArray(list)) return list;
  const sets = await getAllowSets(ctx);
  const out = [];
  for (const entry of list) {
    if (!entry?.id) continue;
    if (entry.owned_by === KEY_ACCESS_COMBO_OWNER) {
      if (sets.combos.has(lower(entry.id))) out.push(entry);
      continue;
    }
    const info = await getModelInfo(entry.id);
    if (!info?.provider) continue;
    if (KEY_ACCESS_PROVIDER_AS_MODEL_KINDS.includes(entry.kind)) {
      if (sets.providers.has(lower(info.provider))) out.push(entry);
      continue;
    }
    if (sets.models.has(canonicalModel(info.provider, info.model))) out.push(entry);
  }
  return out;
}
