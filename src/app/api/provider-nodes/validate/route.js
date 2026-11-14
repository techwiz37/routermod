import { NextResponse } from "next/server";
import { assertPublicUrl } from "@/shared/utils/ssrfGuard.js";
import { isLocalRequest } from "@/dashboardGuard";
import { getRequestLocale, localizedProviderMessage } from "@/lib/i18n/requestLocale";

const fetchWithTimeout = (url, options, timeout = 10000) => {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Request timeout")), timeout)
    )
  ]);
};

const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const getErrorMessage = (error, locale) => {
  if (error.cause?.code === "ECONNREFUSED") return localizedProviderMessage(locale, "connectionRefused");
  if (error.cause?.code === "ENOTFOUND") return localizedProviderMessage(locale, "dnsLookupFailed");
  if (error.cause?.code === "ETIMEDOUT") return localizedProviderMessage(locale, "connectionTimeout");
  if (error.message.includes("timeout")) return localizedProviderMessage(locale, "requestTimeout");
  if (error.cause?.code === "CERT_HAS_EXPIRED") return localizedProviderMessage(locale, "certExpired");
  if (error.cause?.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") return localizedProviderMessage(locale, "certVerifyFailed");
  if (error.cause?.code) return localizedProviderMessage(locale, "networkError");
  return localizedProviderMessage(locale, "networkError");
};

const getModelsErrorMessage = (status, locale) => {
  if (status === 401 || status === 403) return localizedProviderMessage(locale, "unauthorized");
  if (status === 404) return localizedProviderMessage(locale, "modelsEndpointNotFound");
  if (status >= 500) return localizedProviderMessage(locale, "serverError");
  return localizedProviderMessage(locale, "unexpectedResponse").replace("{status}", String(status));
};

const getChatErrorMessage = (status, locale) => {
  if (status === 401 || status === 403) return localizedProviderMessage(locale, "unauthorized");
  if (status === 400) return localizedProviderMessage(locale, "invalidModelOrBadRequest");
  if (status === 404) return localizedProviderMessage(locale, "chatEndpointNotFound");
  if (status >= 500) return localizedProviderMessage(locale, "serverError");
  return localizedProviderMessage(locale, "chatRequestFailed").replace("{status}", String(status));
};

export async function POST(request) {
  const locale = getRequestLocale(request);
  try {
    const body = await request.json();
    const { baseUrl, apiKey, type, modelId } = body;

    if (!baseUrl || !apiKey) {
      return NextResponse.json({ error: localizedProviderMessage(locale, "baseUrlApiKeyRequired") }, { status: 400 });
    }

    if (!isValidUrl(baseUrl)) {
      return NextResponse.json({ error: localizedProviderMessage(locale, "invalidUrl") }, { status: 400 });
    }

    if (!isLocalRequest(request)) {
      try {
        assertPublicUrl(baseUrl);
      } catch {
        return NextResponse.json({ error: localizedProviderMessage(locale, "urlNotAllowed") }, { status: 400 });
      }
    }

    if (type === "custom-embedding") {
      const normalizedBase = baseUrl.trim().replace(/\/$/, "");
      if (!modelId?.trim()) {
        return NextResponse.json({ valid: false, error: localizedProviderMessage(locale, "modelIdRequired") });
      }
      const embedRes = await fetchWithTimeout(`${normalizedBase}/embeddings`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ model: modelId.trim(), input: "ping" })
      });
      if (embedRes.ok) {
        const data = await embedRes.json().catch(() => null);
        const dims = Array.isArray(data?.data?.[0]?.embedding) ? data.data[0].embedding.length : null;
        return NextResponse.json({ valid: true, method: "embeddings", dimensions: dims });
      }
      if (embedRes.status === 401 || embedRes.status === 403) {
        return NextResponse.json({ valid: false, error: localizedProviderMessage(locale, "unauthorized") });
      }
      const errBody = await embedRes.text().catch(() => "");
      return NextResponse.json({
        valid: false,
        error: `${localizedProviderMessage(locale, "embeddingsRequestFailed").replace("{status}", String(embedRes.status))}${errBody ? `: ${errBody.slice(0, 200)}` : ""}`,
        method: "embeddings"
      });
    }

    if (type === "anthropic-compatible") {
      let normalizedBase = baseUrl.trim().replace(/\/$/, "");
      if (normalizedBase.endsWith("/messages")) {
        normalizedBase = normalizedBase.slice(0, -9);
      }

      const modelsUrl = `${normalizedBase}/models`;
      const res = await fetchWithTimeout(modelsUrl, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Authorization": `Bearer ${apiKey}`
        }
      });

      if (res.ok) return NextResponse.json({ valid: true });

      if (res.status === 401 || res.status === 403) {
        return NextResponse.json({ valid: false, error: localizedProviderMessage(locale, "unauthorized") });
      }

      if (modelId) {
        const chatRes = await fetchWithTimeout(`${normalizedBase}/chat/completions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: modelId,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1
          })
        });
        if (chatRes.ok) {
          return NextResponse.json({ valid: true, method: "chat" });
        }
        return NextResponse.json({
          valid: false,
          error: getChatErrorMessage(chatRes.status, locale),
          method: "chat"
        });
      }

      return NextResponse.json({ valid: false, error: getModelsErrorMessage(res.status, locale) });
    }

    const modelsUrl = `${baseUrl.replace(/\/$/, "")}/models`;
    const res = await fetchWithTimeout(modelsUrl, {
      headers: {
        // Send both commonly used OpenAI-compatible authentication headers.
        // Some gateways/checkers use x-api-key even when the API itself also
        // accepts the standard Bearer header.
        "Authorization": `Bearer ${apiKey}`,
        "x-api-key": apiKey,
      },
    });

    if (res.ok) return NextResponse.json({ valid: true });

    if (modelId) {
      const chatRes = await fetchWithTimeout(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "x-api-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1
        })
      });
      if (chatRes.ok) {
        return NextResponse.json({ valid: true, method: "chat" });
      }
      return NextResponse.json({
        valid: false,
        error: getChatErrorMessage(chatRes.status, locale),
        method: "chat"
      });
    }

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ valid: false, error: localizedProviderMessage(locale, "unauthorized") });
    }

    return NextResponse.json({ valid: false, error: getModelsErrorMessage(res.status, locale) });
  } catch (error) {
    const errorMessage = getErrorMessage(error, locale);
    console.error("Error validating provider node:", {
      message: error.message,
      cause: error.cause,
      code: error.cause?.code,
      userMessage: errorMessage
    });
    return NextResponse.json({ 
      valid: false,
      error: errorMessage 
    }, { status: 500 });
  }
}
