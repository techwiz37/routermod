import { NextResponse } from "next/server";
import { getProviderConnections, getProviderNodeById } from "@/models";
import { getModelsByProviderId } from "open-sse/config/providerModels.js";
import { assertPublicUrl } from "@/shared/utils/ssrfGuard.js";
import { isLocalRequest } from "@/dashboardGuard";
import { resolveConnectionModels } from "@/lib/providerModels/resolveConnectionModels";

export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 15000;

const parseModelList = (data) => {
  if (Array.isArray(data)) return data;
  return data?.data || data?.models || data?.results || [];
};

const fetchWithTimeout = (url, options = {}, timeout = FETCH_TIMEOUT_MS) =>
  fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });

const buildModelsUrl = (baseUrl, isAnthropic) => {
  let base = String(baseUrl).trim().replace(/\/$/, "");
  if (isAnthropic && base.endsWith("/messages")) base = base.slice(0, -9);
  if (base.endsWith("/models")) return base;
  return `${base}/models`;
};

const errorTextOf = async (response) => {
  try {
    return (await response.text())?.slice(0, 300) || "";
  } catch {
    return "";
  }
};

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const idOf = (entry) => {
  if (typeof entry === "string") return entry.trim();
  if (!entry || typeof entry !== "object") return "";
  return String(entry.id || entry.name || entry.model || "").trim();
};

const nameOf = (entry, id) => {
  if (!entry || typeof entry !== "object") return "";
  const raw = entry.display_name || entry.displayName || entry.title || entry.name || "";
  const name = String(raw).trim().replace(/^models\//, "");
  return name && name !== id ? name : "";
};

/**
 * Decide whether a catalog entry is free, paid, or unknown.
 * Returns true (free), false (paid) or null when the endpoint exposes no pricing.
 */
const classifyFree = (entry, id) => {
  if (/:free$/i.test(id)) return true;

  if (!entry || typeof entry !== "object") return null;
  if (entry.free === true || entry.isFree === true) return true;
  if (entry.free === false || entry.isFree === false) return false;

  const pricing = entry.pricing;
  if (pricing && typeof pricing === "object") {
    const costs = [pricing.prompt, pricing.completion, pricing.image, pricing.request]
      .map(toNumber)
      .filter((value) => value !== null);
    if (costs.length > 0) return costs.every((value) => value === 0);
  }

  const costs = [entry.cost, entry.price, entry.input_cost, entry.output_cost, entry.prompt_price, entry.completion_price]
    .map(toNumber)
    .filter((value) => value !== null);
  if (costs.length > 0) return costs.every((value) => value === 0);

  return null;
};

const toModelRows = (list) => (Array.isArray(list) ? list : [])
  .map((entry) => {
    const id = idOf(entry);
    if (!id) return null;
    return { id, name: nameOf(entry, id), free: classifyFree(entry, id) };
  })
  .filter(Boolean);

/**
 * Auto-detect every model a provider exposes — no manual, one-by-one entry.
 *
 * Detection order:
 *   1. an existing connection (uses stored credentials, OAuth resolvers, ...)
 *   2. the provider's own /models endpoint without credentials
 *      (works for OpenAI/Anthropic-compatible nodes with a public /models route)
 *   3. the built-in static catalog shipped with RouterMod
 *
 * Every returned row carries `free` (true/false/null) so the dashboard can
 * import only free models, only paid ones, or everything.
 */
export async function POST(request) {
  let body = {};
  try {
    body = (await request.json()) || {};
  } catch {
    body = {};
  }

  const provider = String(body.provider || "").trim();
  if (!provider) {
    return NextResponse.json({ error: "provider required" }, { status: 400 });
  }

  const errors = [];

  // 1) Live detection through an existing connection.
  try {
    const connections = (await getProviderConnections()).filter((entry) => entry.provider === provider);
    const connection = connections.find((entry) => entry.isActive !== false) || connections[0];

    if (connection) {
      const result = await resolveConnectionModels(connection);
      if (!result.error && Array.isArray(result.models)) {
        return NextResponse.json({
          provider,
          source: "connection",
          connectionId: connection.id,
          models: toModelRows(result.models),
          ...(result.warning ? { warning: result.warning } : {})
        });
      }
      if (result.error) errors.push(result.error);
    }
  } catch (error) {
    console.log("Auto-detect (connection) failed:", error?.message || error);
    errors.push(error?.message || "Connection detection failed");
  }

  // 2) Anonymous probe of the provider endpoint (compatible nodes without a key yet).
  try {
    const node = await getProviderNodeById(provider);
    const baseUrl = node?.baseUrl;
    if (baseUrl && node.type !== "custom-embedding") {
      if (!isLocalRequest(request)) {
        try {
          assertPublicUrl(baseUrl);
        } catch {
          return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
        }
      }

      const isAnthropic = node.type === "anthropic-compatible";
      const url = buildModelsUrl(baseUrl, isAnthropic);
      const headers = { "Content-Type": "application/json" };
      if (isAnthropic) headers["anthropic-version"] = "2023-06-01";

      try {
        const response = await fetchWithTimeout(url, { method: "GET", headers });
        if (response.ok) {
          const data = await response.json().catch(() => null);
          return NextResponse.json({
            provider,
            source: "endpoint",
            models: toModelRows(parseModelList(data))
          });
        }

        const status = response.status;
        const detail = await errorTextOf(response);
        if (status === 401 || status === 403) {
          errors.push("Endpoint requires an API key — add an API key connection first");
        } else if (status === 404) {
          errors.push("/models endpoint not found on this provider");
        } else {
          errors.push(`Endpoint responded with ${status}${detail ? `: ${detail}` : ""}`);
        }
      } catch (error) {
        errors.push(error?.name === "TimeoutError" ? "Endpoint timed out" : (error?.message || "Endpoint unreachable"));
      }
    }
  } catch (error) {
    console.log("Auto-detect (endpoint) failed:", error?.message || error);
    errors.push(error?.message || "Endpoint detection failed");
  }

  // 3) Built-in catalog fallback.
  try {
    const catalog = getModelsByProviderId(provider) || [];
    if (catalog.length > 0) {
      return NextResponse.json({
        provider,
        source: "catalog",
        models: toModelRows(catalog),
        ...(errors.length ? { warning: errors.join(" · ") } : {})
      });
    }
  } catch (error) {
    console.log("Auto-detect (catalog) failed:", error?.message || error);
  }

  return NextResponse.json(
    { error: errors.length ? errors.join(" · ") : `No model source available for ${provider}` },
    { status: 400 }
  );
}
