import { getApiKeyByKey } from "@/lib/db/repos/apiKeysRepo.js";
import { getCombos } from "@/lib/db/repos/combosRepo.js";
import { getKeyInFlight } from "@/lib/db/repos/keyUsageRepo.js";
import { tokenWindowMs } from "@/shared/constants/keyQuota.js";
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
import { getAdapter } from "@/lib/db/driver.js";
import { getRequestLocale } from "@/lib/i18n/requestLocale.js";
import { getClientIp } from "@/lib/auth/loginLimiter.js";
import { isIpBlacklisted, normalizeIp } from "@/shared/utils/ipBlacklist.js";
import { getSettings } from "@/lib/db/repos/settingsRepo.js";

const IP_BLOCKED_MESSAGES = {
  id: (ip) => `Akses ditolak: alamat IP ${ip} telah diblokir untuk API key ini.`,
  en: (ip) => `Access denied: IP address ${ip} has been blocked for this API key.`,
  vi: (ip) => `Truy cập bị từ chối: địa chỉ IP ${ip} đã bị chặn đối với API key này.`,
  "zh-CN": (ip) => `访问被拒绝：IP 地址 ${ip} 已被此 API 密钥封禁。`,
  "zh-TW": (ip) => `存取遭拒：IP 位址 ${ip} 已被此 API 金鑰封鎖。`,
  ja: (ip) => `アクセスが拒否されました：IP アドレス ${ip} はこの API キーでブロックされています。`,
  ko: (ip) => `접근 거부: IP 주소 ${ip}은(는) 이 API 키에서 차단되었습니다.`,
  es: (ip) => `Acceso denegado: la dirección IP ${ip} ha sido bloqueada para esta clave API.`,
  "pt-BR": (ip) => `Acesso negado: o endereço IP ${ip} foi bloqueado para esta chave de API.`,
  "pt-PT": (ip) => `Acesso negado: o endereço IP ${ip} foi bloqueado para esta chave de API.`,
  de: (ip) => `Zugriff verweigert: Die IP-Adresse ${ip} wurde für diesen API-Schlüssel gesperrt.`,
  fr: (ip) => `Accès refusé : l'adresse IP ${ip} a été bloquée pour cette clé API.`,
  ru: (ip) => `Доступ запрещён: IP-адрес ${ip} заблокирован для этого API-ключа.`,
  th: (ip) => `การเข้าถึงถูกปฏิเสธ: ที่อยู่ IP ${ip} ถูกบล็อกสำหรับ API key นี้`,
};

// The dashboard language is persisted in settings when the user switches
// language, so API clients (which never send the dashboard cookie) still get
// the blocked-IP message in the configured language.
async function resolveBlockedLocale(request) {
  const explicit = request?.headers?.get?.("x-locale");
  if (explicit && IP_BLOCKED_MESSAGES[explicit]) return explicit;
  try {
    const settings = await getSettings();
    if (settings?.locale && IP_BLOCKED_MESSAGES[settings.locale]) return settings.locale;
  } catch {}
  return getRequestLocale(request);
}

const lower = (s) => String(s).toLowerCase();
const canonicalModel = (provider, model) => lower(`${provider}/${model}`);

function keyPolicyMessages(locale) {
  if (locale === "id") {
    return {
      expired: "API key telah kedaluwarsa.",
      maintenance: "API key ini sedang dalam pemeliharaan. Silakan coba lagi nanti.",
      concurrent: (limit) => `Batas ${limit} request bersamaan untuk API key telah tercapai. Tunggu request sebelumnya selesai.`,
      window: (limit, label, reset) => `Batas request API key ${limit}/${label} telah tercapai. ${reset}`,
      tokenQuota: (used, limit, window) => `Kuota token API key telah habis (${used}/${limit} token per ${window}).`,
      spend: (used, limit, window) => `Batas biaya API key telah tercapai ($${used}/$${limit} per ${window}).`,
      tokenRate: (used, limit) => `Batas token per menit API key telah tercapai (${used}/${limit}). Silakan coba lagi sebentar.`,
      windows: {
        minute: { label: "menit", reset: "Silakan coba lagi sebentar." },
        hour: { label: "jam", reset: "Silakan coba lagi nanti." },
        day: { label: "hari", reset: "Silakan coba lagi besok." },
        month: { label: "bulan", reset: "Silakan coba lagi bulan depan." },
      },
    };
  }
  return {
    expired: "This API key has expired.",
    maintenance: "This API key is temporarily under maintenance. Please try again later.",
    concurrent: (limit) => `The concurrent request limit of ${limit} for this API key has been reached. Wait for an earlier request to finish.`,
    window: (limit, label, reset) => `The API key request limit of ${limit} per ${label} has been reached. ${reset}`,
    tokenQuota: (used, limit, window) => `The API key token quota has been exhausted (${used}/${limit} tokens per ${window}).`,
    spend: (used, limit, window) => `The API key spending limit has been reached ($${used}/$${limit} per ${window}).`,
    tokenRate: (used, limit) => `The API key tokens-per-minute limit has been reached (${used}/${limit}). Please try again shortly.`,
    windows: {
      minute: { label: "minute", reset: "Please try again shortly." },
      hour: { label: "hour", reset: "Please try again later." },
      day: { label: "day", reset: "Please try again tomorrow." },
      month: { label: "month", reset: "Please try again next month." },
    },
  };
}

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

async function ipBlacklistResponse(request, record) {
  if (!record?.ipBlacklist?.length) return null;
  const clientIp = normalizeIp(getClientIp(request));
  if (!isIpBlacklisted(clientIp, record.ipBlacklist)) return null;
  const locale = await resolveBlockedLocale(request);
  const format = IP_BLOCKED_MESSAGES[locale] || IP_BLOCKED_MESSAGES.en;
  log.warn("AUTH", `ip-blacklist: key "${record.name || record.id}" blocked ${clientIp}`);
  return errorResponse(HTTP_STATUS.FORBIDDEN, format(clientIp));
}

// Blocks requests whose client IP is on the API key's blacklist.
export async function enforceKeyIpBlacklist(request) {
  const apiKey = extractClientApiKey(request);
  if (!apiKey) return null;
  return ipBlacklistResponse(request, await getApiKeyByKey(apiKey));
}

// Returns an OpenAI-compatible error response when the key is in maintenance
// or has used its configured daily request allowance.
export async function enforceKeyPolicy(request) {
  const apiKey = extractClientApiKey(request);
  if (!apiKey) return null;
  const messages = keyPolicyMessages(getRequestLocale(request));
  const record = await getApiKeyByKey(apiKey);
  if (!record) return null;
  const ipBlocked = await ipBlacklistResponse(request, record);
  if (ipBlocked) return ipBlocked;
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
    // Persist the automatic switch-off so the dashboard reflects the expired
    // state even before the next request is made.
    try {
      const { updateApiKey } = await import("@/lib/db/repos/apiKeysRepo.js");
      await updateApiKey(record.id, { isActive: false });
    } catch (error) {
      log.warn("AUTH", `Could not mark expired API key inactive: ${error.message}`);
    }
    return errorResponse(HTTP_STATUS.UNAUTHORIZED, messages.expired);
  }
  if (record.maintenanceEnabled) {
    return errorResponse(HTTP_STATUS.SERVICE_UNAVAILABLE, record.maintenanceMessage || messages.maintenance);
  }
  const windows = [
    { key: "minuteLimit", ms: 60 * 1000, ...messages.windows.minute },
    { key: "hourLimit", ms: 60 * 60 * 1000, ...messages.windows.hour },
    { key: "dailyLimit", ms: 24 * 60 * 60 * 1000, ...messages.windows.day },
    { key: "monthLimit", ms: 30 * 24 * 60 * 60 * 1000, ...messages.windows.month },
  ];
  const activeWindows = windows
    .map((w) => ({ ...w, limit: Math.max(0, Number(record[w.key]) || 0) }))
    .filter((w) => w.limit > 0);

  const db = await getAdapter();

  // Concurrency cap is checked before the request is counted, so a key at its
  // limit never gets a slot it cannot use.
  const maxConcurrent = Math.max(0, Number(record.maxConcurrentLimit) || 0);
  if (maxConcurrent > 0 && getKeyInFlight(apiKey) >= maxConcurrent) {
    return errorResponse(
      HTTP_STATUS.RATE_LIMITED,
      messages.concurrent(maxConcurrent)
    );
  }

  for (const w of activeWindows) {
    const since = new Date(Date.now() - w.ms).toISOString();
    const row = db.get(
      `SELECT COUNT(*) AS count FROM usageHistory WHERE apiKey = ? AND timestamp >= ?`,
      [apiKey, since]
    );
    if ((Number(row?.count) || 0) >= w.limit) {
      return errorResponse(HTTP_STATUS.RATE_LIMITED, messages.window(w.limit, w.label, w.reset));
    }
  }

  const tokenLimit = Math.max(0, Number(record.tokenLimit) || 0);
  const tokensPerMinuteLimit = Math.max(0, Number(record.tokensPerMinuteLimit) || 0);
  const spendLimit = Math.max(0, Number(record.spendLimit) || 0);

  if (tokenLimit > 0 || tokensPerMinuteLimit > 0 || spendLimit > 0) {
    const tokenWindow = record.tokenLimitWindow || "24h";
    const since = new Date(Date.now() - tokenWindowMs(tokenWindow)).toISOString();
    const totals = db.get(
      `SELECT COALESCE(SUM(promptTokens), 0) AS promptTokens,
              COALESCE(SUM(completionTokens), 0) AS completionTokens,
              COALESCE(SUM(cost), 0) AS cost
         FROM usageHistory
        WHERE apiKey = ? AND timestamp >= ?`,
      [apiKey, since]
    );
    const usedTokens = (Number(totals?.promptTokens) || 0) + (Number(totals?.completionTokens) || 0);
    const usedCost = Number(totals?.cost) || 0;

    if (tokenLimit > 0 && usedTokens >= tokenLimit) {
      return errorResponse(
        HTTP_STATUS.RATE_LIMITED,
        messages.tokenQuota(usedTokens.toLocaleString("en-US"), tokenLimit.toLocaleString("en-US"), tokenWindow)
      );
    }
    if (spendLimit > 0 && usedCost >= spendLimit) {
      return errorResponse(
        HTTP_STATUS.RATE_LIMITED,
        messages.spend(usedCost.toFixed(4), spendLimit.toFixed(2), tokenWindow)
      );
    }
    if (tokensPerMinuteLimit > 0) {
      const minuteSince = new Date(Date.now() - 60 * 1000).toISOString();
      const minuteTotals = db.get(
        `SELECT COALESCE(SUM(promptTokens), 0) AS promptTokens,
                COALESCE(SUM(completionTokens), 0) AS completionTokens
           FROM usageHistory
          WHERE apiKey = ? AND timestamp >= ?`,
        [apiKey, minuteSince]
      );
      const usedPerMinute = (Number(minuteTotals?.promptTokens) || 0) + (Number(minuteTotals?.completionTokens) || 0);
      if (usedPerMinute >= tokensPerMinuteLimit) {
        return errorResponse(
          HTTP_STATUS.RATE_LIMITED,
          messages.tokenRate(usedPerMinute.toLocaleString("en-US"), tokensPerMinuteLimit.toLocaleString("en-US"))
        );
      }
    }
  }

  return null;
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
  const explicitlyAllowed = new Set(
    ctx.allow
      .filter((entry) => typeof entry === "string")
      .map((entry) => lower(entry.trim()))
      .filter(Boolean),
  );
  const out = [];
  for (const entry of list) {
    if (!entry?.id) continue;

    // Match the public identifier first. This is important for custom models:
    // the API may expose a display prefix/alias while the router resolves the
    // same entry to a different canonical provider/model pair.
    const publicCandidates = [entry.id, entry.name]
      .filter((value) => typeof value === "string" && value.trim())
      .map((value) => lower(value.trim()));
    if (publicCandidates.some((value) => explicitlyAllowed.has(value))) {
      out.push(entry);
      continue;
    }

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
