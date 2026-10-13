import { NextResponse } from "next/server";
import { request as httpRequest } from "node:http";
import { beginSession, encodeSessionCookie, rewriteMimoBases, absorbSetCookies as absorbResponseCookies, originOf, loginUpstreamFetch, SESSION_COOKIE } from "@/lib/mimoLoginSession";



const API_UA =
  "miNative PC/Normal Windows_NT/10.0.19045 SDKV/1.0.0 DEVT/PC DEVS/Windows APP/miaccount_desktop APPV/0.1.0";
const SSO_UA = "MiClaw/1.0";
const LOCAL_PROXY_PORTS = [10808, 10809, 7890, 7891, 1080, 1081, 8080, 8888];


function probeLocalHttpProxy(timeoutMs = 500) {
  const attempts = LOCAL_PROXY_PORTS.map(
    (port) =>
      new Promise((resolve, reject) => {
        let settled = false;
        const done = (v) => {
          if (settled) return;
          settled = true;

          if (v) resolve(v);
          else reject(new Error(`no-proxy-${port}`));
        };
        try {
          const req = httpRequest({
            host: "127.0.0.1",
            port,
            method: "CONNECT",
            path: "account.xiaomi.com:443",
            timeout: timeoutMs,
          });
          req.on("connect", (res, socket) => {
            socket.destroy();
            done(res.statusCode === 200 || res.statusCode === 202 ? `http://127.0.0.1:${port}` : null);
          });
          req.on("timeout", () => { req.destroy(); done(null); });
          req.on("error", () => done(null));
          req.on("response", () => done(null));
          req.end();
        } catch {
          done(null);
        }
      }),
  );
  return Promise.any(attempts).catch(() => null);
}

async function hop(sess, url, ua) {
  return loginUpstreamFetch(url, {
    redirect: "manual",
    headers: { "User-Agent": ua, Accept: "text/html,application/json,*/*" },
    signal: AbortSignal.timeout(15000),
  }, sess);
}

export async function POST(request) {
  try {
    let region = "cn";
    try {
      const body = await request.json();
      const r = String(body?.region || "").toLowerCase();

      if (r === "cn" || r === "sgp" || r === "ams" || r === "ru" || r === "in") region = r;
    } catch {  }

    const sess = beginSession(region);


    let egress = null;
    let egressSource = "direct";
    if (region !== "cn") {
      const found = await probeLocalHttpProxy();
      if (found) {
        egress = found;
        egressSource = "local-probe";
      }
    }
    sess.proxyUrl = egress;


    const meRes = await hop(sess, `${sess.upstreamBase}/api/user/xiaomi/me`, API_UA);
    absorbResponseCookies(sess, meRes, `${sess.upstreamBase}/api/user/xiaomi/me`);
    const ssoLoc = meRes.headers.get("location");
    if (!ssoLoc || !/account\.xiaomi\.com/.test(ssoLoc)) {
      return NextResponse.json(
        { error: `Unexpected me response (${meRes.status}) — no account redirect` },
        { status: 502 },
      );
    }


    const loginRes = await hop(sess, ssoLoc, SSO_UA);
    absorbResponseCookies(sess, loginRes, ssoLoc);
    const pageLoc = loginRes.headers.get("location");
    if (!pageLoc) {
      return NextResponse.json(
        { error: `Unexpected serviceLogin response (${loginRes.status})` },
        { status: 502 },
      );
    }


    const pageUrl = new URL(pageLoc, "https://account.xiaomi.com");
    const origin = originOf(request);

    const proxiedPath = rewriteMimoBases(pageUrl.pathname + pageUrl.search, "toProxy", origin);
    const egressLog = egress ? egress.replace(/\/\/[^@/]+@/, "//***@") : "";
    console.log(`${new Date().toISOString().slice(11,23)} [mimo-login] start region=${sess.region} origin=${origin} egress=${egressSource}${egressLog ? ` (${egressLog})` : ""} page=${pageUrl.pathname}`);

    const res = NextResponse.json({ success: true, state: sess.state, pageUrl: proxiedPath, region });
    res.cookies.set(SESSION_COOKIE, encodeSessionCookie(sess), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 15 * 60,
    });
    return res;
  } catch (error) {
    console.log(`${new Date().toISOString().slice(11,23)} [mimo-login] start error:`, error?.message || error);
    return NextResponse.json({ error: error?.message || "login start failed" }, { status: 500 });
  }
}
