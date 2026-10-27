import { NextResponse } from "next/server";
import { getProxyPoolById, updateProxyPool } from "@/models";
import { testProxyUrl, probeUpstreamThroughProxy } from "@/lib/network/proxyTest";
import { fetch as undiciFetch } from "undici";

async function testVercelRelay(relayUrl, timeoutMs = 10000) {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await undiciFetch(relayUrl, {
      method: "GET",
      headers: {
        "x-relay-target": "https://httpbin.org",
        "x-relay-path": "/get",
      },
      signal: controller.signal,
    });
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: err?.name === "AbortError" ? "Relay test timed out" : (err?.message || String(err)),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const proxyPool = await getProxyPoolById(id);

    if (!proxyPool) {
      return NextResponse.json({ error: "Proxy pool not found" }, { status: 404 });
    }

    const isRelay =
      proxyPool.type === "vercel" ||
      proxyPool.type === "cloudflare" ||
      proxyPool.type === "deno" ||
      proxyPool.type === "netlify";

    const result = isRelay
      ? await testVercelRelay(proxyPool.proxyUrl)
      : await testProxyUrl({ proxyUrl: proxyPool.proxyUrl });
    // Second gate: the exit IP must also be accepted by the upstream.
    // Cloudflare blocks the datacenter ranges these proxies leave from, and a
    // proxy that cannot reach the API fails every request no matter how
    // healthy the connectivity test looks.
    const upstream = isRelay
      ? { ok: true, blocked: false, status: null, error: null }
      : await probeUpstreamThroughProxy({ proxyUrl: proxyPool.proxyUrl });

    const blocked = Boolean(upstream?.blocked);
    // The proxy is useless for this pool when it cannot reach the upstream at
    // all - not only when Cloudflare refuses the exit IP.
    const upstreamDead = !upstream?.ok;
    const healthy = Boolean(result?.ok) && !upstreamDead;
    const now = new Date().toISOString();

    const failureReason = !result?.ok
      ? (result.error || `Proxy test failed with status ${result.status}`)
      : blocked
        ? (upstream.error || "IP proxy diblokir oleh Cloudflare di opencode.ai")
        : upstreamDead
          ? (upstream.error || `Proxy tidak bisa menjangkau upstream (HTTP ${upstream?.status ?? "?"})`)
          : null;

    await updateProxyPool(id, {
      testStatus: healthy ? "active" : "error",
      lastTestedAt: now,
      lastError: failureReason,
      // A blocked exit IP is worse than a dead proxy: it looks healthy and
      // fails every request. Keep it out of the rotation until it is retested.
      isActive: healthy,
      // Persist the exit IP so the pool card can show where traffic leaves from.
      exitIp: result?.ok ? (result.exitIp || null) : null,
      exitCountry: result?.ok ? (result.exitCountry || null) : null,
      upstreamStatus: upstream?.status ?? null,
      upstreamError: upstream?.error || null,
      upstreamOkCount: upstream?.okCount ?? null,
      upstreamAttempts: upstream?.attempts ?? null,
      upstreamCheckedAt: now,
    });

    return NextResponse.json({
      ok: healthy,
      status: result.status,
      statusText: result.statusText || null,
      error: failureReason,
      blocked,
      upstream: {
        ok: Boolean(upstream?.ok),
        status: upstream?.status ?? null,
        error: upstream?.error || null,
        okCount: upstream?.okCount ?? null,
        attempts: upstream?.attempts ?? null,
      },
      elapsedMs: result.elapsedMs || 0,
      exitIp: result?.ok ? (result.exitIp || null) : null,
      exitCountry: result?.ok ? (result.exitCountry || null) : null,
      testedAt: now,
    });
  } catch (error) {
    console.log("Error testing proxy pool:", error);
    return NextResponse.json({ error: "Failed to test proxy pool" }, { status: 500 });
  }
}
