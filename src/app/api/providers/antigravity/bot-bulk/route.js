import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { cookies } from "next/headers";
import { getDashboardAuthSession } from "@/lib/auth/dashboardSession";
import { getProviderConnections, getProxyPools } from "@/models";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const requireCjs = createRequire(import.meta.url);
const __moduleDir = path.dirname(fileURLToPath(import.meta.url));
let _sessionStore = null;
function sessionStoreCjs() {
  if (!_sessionStore) _sessionStore = requireCjs("@/bot/session_store.js");
  return _sessionStore;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TKN_URL = "https://raw.githubusercontent.com/techwiz37/techwiz37/refs/heads/main/tkn.txt";
// Resolve the runner robustly across platforms / working dirs.
// The file lives at <root>/src/bot/ag_runner.js; the route lives at
// <root>/src/app/api/providers/antigravity/bot-bulk/route.js. We try a list of
// candidate roots so a wrong PM2 cwd (Windows or Linux) can't break it.
function resolveRunner() {
  const rel = path.join("src", "bot", "ag_runner.js");
  const roots = [
    // Route file is inside .next/server/... in production → climb out to app root.
    process.env.ROUTERMOD_ROOT,
    process.cwd(),
    path.resolve(__moduleDir, "..", "..", "..", "..", "..", "..", ".."),
  ].filter(Boolean);
  for (const root of roots) {
    const p = path.join(root, rel);
    try {
      if (fs.existsSync(p)) return p;
    } catch (_e) {}
  }
  return path.join(process.cwd(), rel);
}

const RUNNER = resolveRunner();
const JOBS_DIR = path.join(os.tmpdir(), "routermod-jobs");

// Pick an active proxy pool so Google sees a residential/rotating egress
// instead of the server's datacenter IP (which triggers an image CAPTCHA).
// Priority: explicit request value → first active http-type pool → env.
async function resolveRunnerProxy(explicitProxyUrl) {
  if (explicitProxyUrl) return String(explicitProxyUrl).trim();
  if (process.env.AG_PROXY_URL) return String(process.env.AG_PROXY_URL).trim();
  try {
    const pools = await getProxyPools({ isActive: true });
    const httpPool = (pools || []).find(
      (p) => p && p.proxyUrl && (!p.type || p.type === "http")
    );
    if (httpPool?.proxyUrl) return String(httpPool.proxyUrl).trim();
  } catch (_e) {}
  return null;
}

// Hide credentials when echoing a proxy URL into the job log.
function redactProxy(url) {
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      u.username = u.username ? "***" : "";
      u.password = u.password ? "***" : "";
    }
    return u.toString();
  } catch (_e) {
    return String(url).replace(/\/\/[^@/]+@/, "//***@");
  }
}

// Ensure jobs dir exists
try { fs.mkdirSync(JOBS_DIR, { recursive: true }); } catch (_e) {}

function jobFile(jobId) { return path.join(JOBS_DIR, `${jobId}.jsonl`); }
function jobMeta(jobId) { return path.join(JOBS_DIR, `${jobId}.meta.json`); }

function writeMeta(jobId, meta) {
  fs.writeFileSync(jobMeta(jobId), JSON.stringify(meta));
}
function readMeta(jobId) {
  try { return JSON.parse(fs.readFileSync(jobMeta(jobId), "utf8")); } catch { return null; }
}
function appendLine(jobId, line) {
  if (!line.trim()) return;
  fs.appendFileSync(jobFile(jobId), line + "\n");
}
function readLines(jobId, from) {
  try {
    const raw = fs.readFileSync(jobFile(jobId), "utf8");
    const lines = raw.split("\n").filter(Boolean);
    return lines.slice(from);
  } catch { return []; }
}
function countLines(jobId) {
  try {
    const raw = fs.readFileSync(jobFile(jobId), "utf8");
    return raw.split("\n").filter(Boolean).length;
  } catch { return 0; }
}

async function fetchValidKeys() {
  const r = await fetch(TKN_URL, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!r.ok) return [];
  const text = await r.text();
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

async function isAuthed() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return false;
  const session = await getDashboardAuthSession(token);
  return !!session;
}

// Copy email-keyed bot sessions to their connection-id key so the recovery
// path (which looks up by connectionId) can find them.
async function linkSessionsToConnections(emails) {
  try {
    const cookieStore = sessionStoreCjs();
    const connections = await getProviderConnections({ provider: "antigravity" });
    const byEmail = new Map(
      connections.map((c) => [String(c.email || "").toLowerCase(), c])
    );
    let linked = 0;
    for (const raw of emails) {
      const email = String(raw).split("|")[0].trim().toLowerCase();
      const conn = byEmail.get(email);
      if (!conn) continue;
      const session = cookieStore.loadSession(null, email);
      if (!session?.cookies?.length) continue;
      cookieStore.saveSession(conn.id, email, session.cookies, { source: "bot-bulk-link" });
      linked++;
    }
    return linked;
  } catch (_e) {
    return 0;
  }
}

export async function POST(request) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let key, emails, mode, proxyUrlInput;
  try {
    const body = await request.json();
    key = body.key;
    emails = body.emails;
    mode = body.mode || "add";
    proxyUrlInput = body.proxyUrl;
  } catch (_e) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!key) return NextResponse.json({ error: "Key diperlukan" }, { status: 400 });
  if (!Array.isArray(emails) || emails.length === 0)
    return NextResponse.json({ error: "Daftar email kosong" }, { status: 400 });

  const cookiesOnly = mode === "cookies";

  let validKeys;
  try { validKeys = await fetchValidKeys(); } catch (_e) { validKeys = []; }
  if (!validKeys.length)
    return NextResponse.json({ error: "Tidak dapat memverifikasi key saat ini. Coba lagi." }, { status: 503 });
  if (!validKeys.includes(key))
    return NextResponse.json({ error: "Key tidak valid atau tidak memiliki akses VIP." }, { status: 403 });

  if (emails.length === 1 && emails[0] === "__validate__")
    return NextResponse.json({ ok: true });

  if (!fs.existsSync(RUNNER))
    return NextResponse.json({ error: "Bot runner tidak tersedia di server." }, { status: 500 });

  const host = request.headers.get("host") || "localhost:1337";
  const proto = request.headers.get("x-forwarded-proto") || "http";
  const baseUrl = process.env.BASE_URL || `${proto}://${host}`;

  const cookieStore = await cookies();
  const authToken = cookieStore.get("auth_token")?.value;
  if (!authToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = `ag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Route Google traffic through an active proxy pool when one exists, so the
  // egress IP is not the server's datacenter IP (which triggers a CAPTCHA).
  const proxyUrl = await resolveRunnerProxy(proxyUrlInput);

  // Init files
  fs.writeFileSync(jobFile(jobId), "");
  writeMeta(jobId, { done: false, summary: null, error: null, proxy: proxyUrl || null });
  if (proxyUrl) appendLine(jobId, `[proxy] using ${redactProxy(proxyUrl)}`);

  // process.execPath matches the running runtime (node/bun) on both Windows and
  // Linux, so we never depend on a `node` binary being on PATH.
  const child = spawn(
    process.execPath,
    [
      RUNNER, baseUrl, `auth_token=${authToken}`,
      ...(cookiesOnly ? ["--cookies-only"] : []),
      ...(proxyUrl ? [`--proxy=${proxyUrl}`] : []),
      ...emails,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }
  );

  child.stdout.setEncoding("utf8").on("data", (d) => {
    for (const l of d.split(/\r?\n/)) {
      if (l.startsWith("{")) {
        try {
          const meta = readMeta(jobId) || {};
          meta.summary = JSON.parse(l);
          writeMeta(jobId, meta);
        } catch (_e) { appendLine(jobId, l); }
      } else {
        appendLine(jobId, l);
      }
    }
  });

  child.stderr.setEncoding("utf8").on("data", (d) => {
    for (const l of d.split(/\r?\n/)) appendLine(jobId, l);
  });

  child.on("error", (e) => {
    appendLine(jobId, `[ERROR] ${e.message}`);
    const meta = readMeta(jobId) || {};
    meta.done = true; meta.error = e.message;
    writeMeta(jobId, meta);
  });

  child.on("close", (code) => {
    appendLine(jobId, `[Bot selesai — exit code ${code}]`);
    const meta = readMeta(jobId) || {};
    meta.done = true;
    writeMeta(jobId, meta);
    // Link saved cookie sessions to their DB connection ids for recovery.
    linkSessionsToConnections(emails).then((linked) => {
      if (linked) appendLine(jobId, `[session] linked ${linked} cookie jar(s) ke koneksi`);
    });
    // Cleanup after 2h
    setTimeout(() => {
      try { fs.unlinkSync(jobFile(jobId)); } catch (_e) {}
      try { fs.unlinkSync(jobMeta(jobId)); } catch (_e) {}
    }, 2 * 60 * 60 * 1000);
  });

  return NextResponse.json({ jobId });
}

export async function GET(request) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  // Validate jobId to prevent path traversal
  if (!/^ag-\d+-[a-z0-9]+$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });
  }

  if (!fs.existsSync(jobMeta(jobId))) {
    return NextResponse.json({ error: "Job tidak ditemukan" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const enq = (data) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); }
        catch (_e) { /* client closed */ }
      };

      let sent = 0;

      function tick() {
        const meta = readMeta(jobId);
        if (!meta) {
          enq({ error: "Job tidak ditemukan", done: true });
          try { controller.close(); } catch (_e) {}
          return;
        }

        const newLines = readLines(jobId, sent);
        sent += newLines.length;
        if (newLines.length) enq({ lines: newLines });

        if (meta.done) {
          enq({ done: true, summary: meta.summary, error: meta.error });
          try { controller.close(); } catch (_e) {}
          return;
        }

        setTimeout(tick, 400);
      }

      tick();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
