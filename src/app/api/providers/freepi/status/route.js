import { NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const dynamic = "force-dynamic";

function bridgeBin() {
  const candidates = [
    process.env.FREEPI_BRIDGE_BIN,
    path.join(process.cwd(), ".bin", "freepi-bridge"),
    path.resolve(process.cwd(), "..", "..", ".bin", "freepi-bridge"),
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

async function probe(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500), cache: "no-store" });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: true, data };
    }
    return { ok: false, status: res.status };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function GET() {
  const baseUrl = process.env.FREEPI_BRIDGE_BASE_URL || "http://127.0.0.1:8787/v1/chat/completions";
  let healthUrl = baseUrl;
  try {
    const u = new URL(baseUrl);
    u.pathname = "/health";
    u.search = "";
    healthUrl = u.toString();
  } catch {}

  const credPath = path.join(os.homedir(), ".free-pi", "agent", "credentials.json");
  const hasToken = !!(process.env.FREEPI_TOKEN || (fs.existsSync(credPath) && fs.statSync(credPath).size > 0));
  const [health, models] = await Promise.all([
    probe(healthUrl),
    probe(baseUrl.replace(/\/chat\/completions\/?$/, "/models")),
  ]);

  return NextResponse.json({
    hasToken,
    tokenSource: process.env.FREEPI_TOKEN ? "env" : (hasToken ? "cli" : null),
    bridgeInstalled: !!bridgeBin(),
    bridgeRunning: health.ok,
    bridgeHealth: health,
    models: models.ok ? (models.data?.data || []).map((m) => m.id) : [],
    authCommand: "npx free-pi-cli@latest",
  });
}
