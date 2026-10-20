import { ProxyAgent, fetch as undiciFetch } from "undici";

// Test targets are tried in order until one answers. They are plain IP/trace
// endpoints instead of a big site like google.com:
//   - google.com actively blocks datacenter ranges, so a healthy premium proxy
//     can still return 403/429 and look "broken";
//   - HEAD is rejected by a lot of residential proxies, so we always use GET;
//   - every target below also reveals the exit IP, so the operator can see
//     which country the proxy actually leaves from.
const DEFAULT_TEST_URLS = [
  "https://api.ipify.org?format=json",
  "https://ipinfo.io/json",
  "https://cloudflare.com/cdn-cgi/trace",
  "https://httpbin.org/ip",
  "https://ifconfig.me/ip",
  "https://www.google.com/",
];

const DEFAULT_TIMEOUT_MS = 10000;

function getErrorMessage(err) {
  if (!err) return "Unknown error";
  const base = err?.message || String(err);
  const causeCode = err?.cause?.code || err?.code;
  const causeMessage = err?.cause?.message;

  if (causeMessage && causeMessage !== base) {
    return causeCode ? `${base}: ${causeMessage} (${causeCode})` : `${base}: ${causeMessage}`;
  }

  if (causeCode && !base.includes(causeCode)) {
    return `${base} (${causeCode})`;
  }

  return base;
}

function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

// Extract the exit IP from the different probe payloads so the pool card can
// show where the traffic actually leaves the machine.
export function extractExitIp(bodyText) {
  if (!bodyText) return null;
  const text = String(bodyText).trim();
  if (!text) return null;
  try {
    const json = JSON.parse(text);
    if (typeof json?.ip === "string") return json.ip;
    if (typeof json?.origin === "string") return json.origin;
  } catch {
    // not JSON — fall through to the plain-text formats
  }
  const trace = /^ip=(.+)$/m.exec(text);
  if (trace) return trace[1].trim();
  if (/^[\d.:a-f]{3,}$/i.test(text) && !text.includes(" ")) return text;
  return null;
}

export function extractCountry(bodyText) {
  if (!bodyText) return null;
  const text = String(bodyText).trim();
  try {
    const json = JSON.parse(text);
    if (typeof json?.country === "string") return json.country.toUpperCase();
    if (typeof json?.country_code === "string") return json.country_code.toUpperCase();
  } catch {
    // not JSON
  }
  const trace = /^loc=(.+)$/m.exec(text);
  if (trace) return trace[1].trim().toUpperCase();
  return null;
}

// Exit IP -> country code. Many pool entries share one exit IP, so the
// result is cached for a while to keep bulk health checks cheap.
const countryCache = new Map();
const COUNTRY_CACHE_TTL_MS = 30 * 60 * 1000;

async function lookupCountry(ip) {
  if (!ip) return null;
  const cached = countryCache.get(ip);
  if (cached && Date.now() - cached.at < COUNTRY_CACHE_TTL_MS) {
    return cached.code;
  }

  const providers = [
    {
      url: (addr) => `http://ip-api.com/json/${addr}?fields=status,countryCode,query`,
      pick: (j) => j?.countryCode || null,
    },
    {
      url: (addr) => `https://ipinfo.io/${addr}/json`,
      pick: (j) => j?.country || null,
    },
    {
      url: (addr) => `http://ip-api.com/json/${addr}?fields=countryCode`,
      pick: (j) => j?.countryCode || null,
    },
  ];

  for (const p of providers) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await undiciFetch(p.url(ip), {
        headers: { "User-Agent": "9Router", Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = await res.json().catch(() => null);
      const code = p.pick(json);
      if (code) {
        const normalized = String(code).trim().toUpperCase();
        countryCache.set(ip, { code: normalized, at: Date.now() });
        return normalized;
      }
    } catch {
      /* try the next provider */
    }
  }

  countryCache.set(ip, { code: null, at: Date.now() });
  return null;
}

export async function testProxyUrl({ proxyUrl, testUrl, timeoutMs } = {}) {
  const normalizedProxyUrl = normalizeString(proxyUrl);
  if (!normalizedProxyUrl) {
    return { ok: false, status: 400, error: "proxyUrl is required" };
  }

  const explicitUrl = normalizeString(testUrl);
  const targets = explicitUrl ? [explicitUrl] : DEFAULT_TEST_URLS;
  const timeoutMsRaw = Number(timeoutMs);
  const normalizedTimeoutMs =
    Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
      ? Math.min(timeoutMsRaw, 30000)
      : DEFAULT_TIMEOUT_MS;

  let dispatcher;

  try {
    try {
      dispatcher = new ProxyAgent({ uri: normalizedProxyUrl });
    } catch (err) {
      return {
        ok: false,
        status: 400,
        error: `Invalid proxy URL: ${err?.message || String(err)}`,
      };
    }

    const errors = [];

    for (const target of targets) {
      const controller = new AbortController();
      const startedAt = Date.now();
      const timer = setTimeout(() => controller.abort(), normalizedTimeoutMs);

      try {
        const res = await undiciFetch(target, {
          method: "GET",
          dispatcher,
          signal: controller.signal,
          redirect: "manual",
          headers: {
            "User-Agent": "9Router",
            Accept: "*/*",
          },
        });

        const bodyText = res.ok ? await res.text().catch(() => "") : "";
        const elapsedMs = Date.now() - startedAt;

        if (res.ok) {
          const exitIp = extractExitIp(bodyText);
          let exitCountry = extractCountry(bodyText);
          // Most probes (ipify) only return the IP -> look the country up
          // separately so the pool card can show the real region.
          if (!exitCountry && exitIp) {
            exitCountry = await lookupCountry(exitIp);
          }
          return {
            ok: true,
            status: res.status,
            statusText: res.statusText,
            url: target,
            exitIp,
            exitCountry,
            elapsedMs,
          };
        }

        // The proxy answered, the target did not like the request. Keep going:
        // a different target usually works.
        errors.push(`${target} → HTTP ${res.status}`);
      } catch (err) {
        const timedOut = err?.name === "AbortError";
        errors.push(
          timedOut
            ? `${target} → timeout ${normalizedTimeoutMs}ms`
            : `${target} → ${getErrorMessage(err)}`
        );
      } finally {
        clearTimeout(timer);
      }
    }

    // Nothing answered. Distinguish "proxy did not respond" from "proxy refused".
    const allTimedOut = errors.every((e) => e.includes("timeout"));
    const allRefused = errors.every((e) =>
      /ECONNREFUSED|ECONNRESET|EPROTO|socket hang up|UND_ERR_SOCKET|fetch failed/i.test(e)
    );

    let hint = "";
    if (allTimedOut) {
      hint = " — proxy tidak merespons (dead, overload, atau IP Anda diblokir provider)";
    } else if (allRefused) {
      hint = " — proxy menolak koneksi (kredensial salah / IP whitelist)";
    }

    return {
      ok: false,
      status: 502,
      error: `Semua target gagal: ${errors.slice(0, 3).join("; ")}${hint}`,
      errors,
    };
  } finally {
    try {
      await dispatcher?.close?.();
    } catch {
    }
  }
}
