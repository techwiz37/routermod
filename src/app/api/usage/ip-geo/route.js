import { NextResponse } from "next/server";
import net from "node:net";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FAIL_TTL_MS = 5 * 60 * 1000;
const MAX_IPS = 100;
const cache = new Map();

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb)/.test(v6);
}

async function lookupBatch(ips) {
  const res = await fetch("http://ip-api.com/batch?fields=status,query,countryCode,country,city", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ips.map((query) => ({ query }))),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`geo lookup HTTP ${res.status}`);
  return res.json();
}

export async function POST(request) {
  let ips;
  try {
    const body = await request.json();
    ips = Array.isArray(body?.ips) ? body.ips : [];
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const unique = [...new Set(ips.filter((ip) => typeof ip === "string" && net.isIP(ip.trim())).map((ip) => ip.trim()))].slice(0, MAX_IPS);
  const now = Date.now();
  const result = {};
  const pending = [];

  for (const ip of unique) {
    if (isPrivateIp(ip)) {
      result[ip] = { local: true };
      continue;
    }
    const hit = cache.get(ip);
    if (hit && hit.expires > now) result[ip] = hit.data;
    else pending.push(ip);
  }

  if (pending.length) {
    try {
      const rows = await lookupBatch(pending);
      for (const row of Array.isArray(rows) ? rows : []) {
        const data =
          row?.status === "success" && row.countryCode
            ? { countryCode: row.countryCode, country: row.country || "", city: row.city || "" }
            : null;
        cache.set(row.query, { data, expires: now + (data ? CACHE_TTL_MS : FAIL_TTL_MS) });
        result[row.query] = data;
      }
    } catch {
      for (const ip of pending) {
        cache.set(ip, { data: null, expires: now + FAIL_TTL_MS });
        result[ip] = null;
      }
    }
  }

  return NextResponse.json({ geo: result });
}
