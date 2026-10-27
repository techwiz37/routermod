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

// The upstream the proxy pool is actually used for. A proxy can be perfectly
// alive and still useless: Cloudflare (opencode.ai sits behind it) blocks the
// datacenter ranges these proxies exit from with a plain 403, so the request
// never reaches the API.
const DEFAULT_UPSTREAM_URL = "https://opencode.ai/";

// Status codes that mean "the exit IP is blocked" rather than "the request
// was wrong" — 403 from Cloudflare, 451 from a legal block.
const BLOCKED_STATUS_CODES = new Set([403, 451]);

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

/**
 * Check that the proxy can actually reach the upstream it is used for.
 *
 * The connectivity check above only proves the proxy answers — it says nothing
 * about the exit IP. Cloudflare blocks the datacenter ranges free proxies exit
 * from, and a pool that is only tested for connectivity fills up with entries
 * that look healthy and then fail every single request with a 403.
 *
 * A plain GET on the upstream root is enough: an IP block hits every path,
 * while the free-tier quota error only shows up on the inference endpoint.
 *
 * The probe runs a few times on purpose: a pool proxy rotates its exit IP per
 * connection, so one attempt can land on a blocked IP while the next one
 * works. Only a proxy that fails every attempt is really useless.
 */
export async function probeUpstreamThroughProxy({
  proxyUrl,
  targetUrl,
  timeoutMs,
  attempts,
} = {}) {
  const normalizedProxyUrl = normalizeString(proxyUrl);
  if (!normalizedProxyUrl) {
    return { ok: false, status: 400, error: "proxyUrl is required" };
  }

  const target = normalizeString(targetUrl) || DEFAULT_UPSTREAM_URL;
  const timeoutMsRaw = Number(timeoutMs);
  const normalizedTimeoutMs =
    Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
      ? Math.min(timeoutMsRaw, 30000)
      : 12000;
  const attemptsRaw = Number(attempts);
  const totalAttempts =
    Number.isFinite(attemptsRaw) && attemptsRaw > 0 ? Math.min(attemptsRaw, 10) : 3;

  const results = [];

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    const result = await probeUpstreamOnce({
      proxyUrl: normalizedProxyUrl,
      target,
      timeoutMs: normalizedTimeoutMs,
    });
    results.push(result);
    // One working connection is enough - the proxy is usable.
    if (result.ok) break;
  }

  const okCount = results.filter((r) => r.ok).length;
  const blockedCount = results.filter((r) => r.blocked).length;
  const last = results[results.length - 1] || {};

  return {
    ok: okCount > 0,
    // Blocked on every attempt: the exit IPs of this proxy are all refused.
    blocked: okCount === 0 && blockedCount === results.length && results.length > 0,
    status: last.status ?? null,
    server: last.server ?? null,
    attempts: results.length,
    okCount,
    blockedCount,
    errors: results.map((r) => r.error).filter(Boolean),
    error: last.error || null,
  };
}

/** One connection through the proxy to the upstream. */
async function probeUpstreamOnce({ proxyUrl, target, timeoutMs }) {
  let dispatcher;
  try {
    try {
      dispatcher = new ProxyAgent({ uri: proxyUrl });
    } catch (err) {
      return {
        ok: false,
        blocked: false,
        status: 400,
        error: `Invalid proxy URL: ${err?.message || String(err)}`,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

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
      const elapsedMs = Date.now() - startedAt;
      const server = res.headers?.get?.("server") || null;
      try {
        await res.text();
      } catch {
        /* drain only */
      }

      if (BLOCKED_STATUS_CODES.has(res.status)) {
        return {
          ok: false,
          blocked: true,
          status: res.status,
          server,
          elapsedMs,
          error: `IP proxy diblokir (HTTP ${res.status}${server ? ` dari ${server}` : ""}) saat mengakses ${target}`,
        };
      }

      return {
        ok: true,
        blocked: false,
        status: res.status,
        server,
        elapsedMs,
      };
    } catch (err) {
      const timedOut = err?.name === "AbortError";
      return {
        ok: false,
        blocked: false,
        status: 502,
        elapsedMs: Date.now() - startedAt,
        error: timedOut
          ? `timeout ${timeoutMs}ms saat mengakses ${target}`
          : getErrorMessage(err),
      };
    } finally {
      clearTimeout(timer);
    }
  } finally {
    try {
      await dispatcher?.close?.();
    } catch {
    }
  }
}
