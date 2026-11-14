import { NextResponse } from "next/server";
import REGISTRY from "open-sse/providers/registry/index.js";
import { getRequestDetails } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

const CACHE_MS = 60000;
const LATENCY_SAMPLE = 50;
const EMPTY = { models: 0, providers: 0, avgLatencyMs: null, latencySamples: 0 };

let cached = null;
let inflight = null;

function registryCounts() {
  let providers = 0;
  let models = 0;
  for (const entry of REGISTRY || []) {
    if (!entry || entry.hidden === true) continue;
    const filtered = (entry.models || []).filter((m) => {
      const kind = (m && (m.kind || m.type)) || "llm";
      if (Array.isArray(entry.hiddenKinds) && entry.hiddenKinds.includes(kind)) return false;
      return true;
    });
    if (filtered.length > 0) {
      providers += 1;
      models += filtered.length;
    }
  }
  return { providers, models };
}

async function compute() {
  const { providers, models } = registryCounts();

  let avgLatencyMs = null;
  let latencySamples = 0;
  try {
    const { details } = await getRequestDetails({ page: 1, pageSize: LATENCY_SAMPLE });
    const totals = [];
    for (const detail of details || []) {
      const value = detail && detail.latency && detail.latency.total;
      if (typeof value === "number" && Number.isFinite(value) && value > 0) totals.push(value);
    }
    if (totals.length > 0) {
      const sum = totals.reduce((a, b) => a + b, 0);
      avgLatencyMs = Math.round(sum / totals.length);
      latencySamples = totals.length;
    }
  } catch (e) {
    console.log("[public/stats] latency failed:", e?.message);
  }

  return { models, providers, avgLatencyMs, latencySamples };
}

async function loadStats() {
  const now = Date.now();
  if (cached && now - cached.ts < CACHE_MS) return cached.data;
  if (inflight) return inflight;

  inflight = (async () => {
    let data = EMPTY;
    try {
      data = await compute();
    } catch (e) {
      console.log("[public/stats] compute failed:", e?.message);
      data = cached ? cached.data : EMPTY;
    }
    cached = { ts: Date.now(), data };
    inflight = null;
    return data;
  })();

  return inflight;
}

export async function GET() {
  try {
    const data = await loadStats();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" },
    });
  } catch (e) {
    console.log("[public/stats] GET failed:", e?.message);
    return NextResponse.json(EMPTY, { status: 200 });
  }
}
