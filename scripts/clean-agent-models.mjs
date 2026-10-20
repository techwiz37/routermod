// Clean the agent model list: keep only models that really answer, and pick
// the fastest one as the default.
// Usage: node scripts/clean-agent-models.mjs
// Env:
//   ROUTERMOD_BASE   - router base URL (default http://127.0.0.1:1945)
//   ROUTERMOD_KEY    - router API key (required)
//   ROUTERMOD_TOKEN_FILE - path to a file containing the dashboard auth token
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.ROUTERMOD_BASE || "http://127.0.0.1:1945";
const KEY = process.env.ROUTERMOD_KEY;
if (!KEY) {
  console.error("ROUTERMOD_KEY is required (router API key).");
  process.exit(1);
}
const OUT = process.env.ROUTERMOD_TOKEN_FILE
  || path.join(os.tmpdir(), "opencode", "rm-session.txt");
const token = fs.readFileSync(OUT, "utf8").trim();
const H = { Cookie: `auth_token=${token}`, "Content-Type": "application/json" };

const { providers } = await (await fetch(`${BASE}/api/agent/providers`, { headers: H })).json();
const p = providers[0];

const good = [];
for (const m of p.models) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: m.id,
        messages: [{ role: "user", content: "hi" }],
        stream: false,
        max_tokens: 30,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      console.log(`  x ${m.id} (${ms}ms) -> ${res.status}`);
      continue;
    }
    const j = await res.json().catch(() => ({}));
    const text = String(j?.choices?.[0]?.message?.content || "");
    if (/no longer available|not available|has been deprecated/i.test(text)) {
      console.log(`  x ${m.id} (${ms}ms) -> deprecated`);
      continue;
    }
    good.push({ id: m.id, ms });
    console.log(`  v ${m.id} (${ms}ms)`);
  } catch {
    console.log(`  x ${m.id} -> timeout/error`);
  }
}

if (!good.length) {
  console.log("tidak ada model hidup — tidak diubah");
  process.exit(1);
}

good.sort((a, b) => a.ms - b.ms);
const res = await fetch(`${BASE}/api/agent/providers`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    id: p.id,
    name: p.name,
    baseUrl: `${BASE}/v1`,
    apiKey: KEY,
    defaultModel: good[0].id,
    models: good.map((g) => g.id),
  }),
});
console.log("\nupdate:", res.status, JSON.stringify(await res.json()));
console.log("model hidup :", good.map((g) => `${g.id} (${g.ms}ms)`).join(", "));
console.log("default     :", good[0].id);
