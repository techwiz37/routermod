import { proxy as dashboardProxy, isAuthenticated } from "./dashboardGuard";
import {
  sessionFromRequest,
  isAccountProxyPath,
  isMimoTakeoverPath,
  takeoverUpstreamPath,
  proxyAccountRequest,
  runTakeover,
  attachSessionCookie,
  originOf,
} from "./lib/mimoLoginSession";

// Tunnel host patterns — only CF-based tunnels and toolwiz.id subdomains
const TUNNEL_HOST_RE = [/\.trycloudflare\.com$/, /\.toolwiz\.id$/];
// Paths allowed through even when tunnel disabled (API + LLM endpoints)
const TUNNEL_ALLOW_RE = /^\/(api|v1|v1beta|codex|responses|systemone)(\/|$)/;

function isTunnelHost(host) {
  const hostname = (host || "").split(":")[0];
  return TUNNEL_HOST_RE.some((re) => re.test(hostname));
}

// Read tunnel state from JSON state file — works in proxy sandbox
async function isTunnelActive() {
  try {
    // Dynamic imports of builtins work in Next.js proxy Node runtime
    const [{ default: fs }, { default: path }] = await Promise.all([
      import("node:fs"),
      import("node:path"),
    ]);
    const appData = process.env.APPDATA || process.env.HOME + "/AppData/Roaming";
    const stateFile = path.join(appData, "routermod", "tunnel", "state.json");
    if (!fs.existsSync(stateFile)) return false;
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    // Disabled = tunnelUrl cleared to null
    return !!(state?.tunnelUrl);
  } catch (e) {
    console.warn("[proxy-gate] isTunnelActive error:", e?.message);
    return null; // fail open
  }
}

const BLOCKED_HTML = `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Tunnel Nonaktif</title><style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1117;font-family:monospace;color:#e2e8f0}.card{border:2px solid #ff1a53;border-radius:12px;padding:32px 28px;max-width:420px;width:90%;box-shadow:4px 4px 0 #ff1a5340;background:#161922;text-align:center}.icon{font-size:40px;margin-bottom:16px}h1{font-size:18px;font-weight:900;color:#ff1a53;letter-spacing:.1em;margin-bottom:8px;text-transform:uppercase}p{font-size:13px;color:#94a3b8;line-height:1.6;margin-bottom:20px}.badge{display:inline-block;padding:4px 12px;border:1.5px solid #ff1a5360;border-radius:6px;font-size:11px;color:#ff1a53;background:#ff1a5310;letter-spacing:.08em}.hint{margin-top:16px;font-size:11px;color:#475569}</style></head><body><div class="card"><div class="icon">🔒</div><h1>Tunnel Nonaktif</h1><p>Akses dashboard via URL tunnel diblokir karena tunnel sedang dinonaktifkan.</p><span class="badge">403 — TUNNEL DISABLED</span><p class="hint">Aktifkan tunnel dari dashboard lokal untuk mengizinkan akses remote.</p></div></body></html>`;

export default async function proxy(request) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || "";

  // Block web UI access via tunnel when tunnel is disabled
  if (isTunnelHost(host) && !TUNNEL_ALLOW_RE.test(pathname)) {
    const active = await isTunnelActive();
    if (active === false) {
      return new Response(BLOCKED_HTML, {
        status: 403,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  }

  // Xiaomi account session-login proxy (src/lib/mimoLoginSession.js).
  // Session state (region + accumulated cookie jar) travels in the httpOnly
  // 9r_mimo_login cookie — route handlers and this proxy run in separate
  // bundles, so module-level maps are NOT shared. The cookie is only set by
  // the auth-gated login/start route, and the branch below ALSO requires a
  // valid dashboard session: a forged 9r_mimo_login cookie (client-controlled
  // header, unsigned payload) must never turn the app into an unauthenticated
  // forwarder. No URL-carried session — it would leak the jar via history/logs/Referer.
  const cookies = request.headers.get("cookie") || "";
  const hasSessionCookie = cookies.includes("9r_mimo_login=");
  if (hasSessionCookie && !(await isAuthenticated(request))) {
    // Forged or stale session cookie without dashboard auth — drop it early.
    const res = await dashboardProxy(request);
    const headers = new Headers(res.headers);
    headers.append("Set-Cookie", "9r_mimo_login=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }
  if (!hasSessionCookie && /^\/(fe\/|pass)/.test(pathname) && !pathname.startsWith("/_next")) {
    // Anomaly: a login-flow XHR arrived without the session — the classic
    // cause of silent SPA "Something went wrong" 404s. Narrow to login paths
    // so unrelated unknown routes don't spam this.
    console.log(`${new Date().toISOString().slice(11,23)} [mimo-login] no-session ${pathname} (cookie header: ${cookies ? cookies.slice(0, 80) : "<none>"})`);
  }
  if (hasSessionCookie) {
    const sess = sessionFromRequest(request);
    if (sess) {
      const origin = originOf(request);
      try {
        if (isMimoTakeoverPath(pathname)) {
          const upstreamUrl = `${sess.upstreamBase}${takeoverUpstreamPath(pathname)}${request.nextUrl.search || ""}`;
          return attachSessionCookie(await runTakeover(sess, upstreamUrl, origin), sess);
        }
        if (isAccountProxyPath(pathname)) {
          return attachSessionCookie(await proxyAccountRequest(sess, request, origin), sess);
        }
      } catch (e) {
        console.log(`${new Date().toISOString().slice(11,23)} [mimo-login] proxy error:`, e?.message || e);
        return new Response("mimo login proxy error", { status: 502 });
      }
    } else {
      // Anomaly (should not happen in a healthy flow): cookie present but unparseable.
      console.log(`${new Date().toISOString().slice(11,23)} [mimo-login] session cookie undecodable — falling through (${pathname})`);
    }
  }

  // Cookie present but expired/invalid — clear it on the way past.
  if (hasSessionCookie) {
    const res = await dashboardProxy(request);
    const headers = new Headers(res.headers);
    headers.append("Set-Cookie", "9r_mimo_login=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }

  return dashboardProxy(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
