import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { cookies } from "next/headers";
import { getDashboardAuthSession } from "@/lib/auth/dashboardSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** In-memory job store — jobId → { lines, done, error, summary } */
const jobs = new Map();

const RUNNER = path.join(process.cwd(), "src", "bot", "ag_runner.py");
const TKN_URL = "https://raw.githubusercontent.com/techwiz37/techwiz37/refs/heads/main/tkn.txt";

async function fetchValidKeys() {
  const r = await fetch(TKN_URL, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!r.ok) return [];
  const text = await r.text();
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

async function isAuthed() {
  const cookieStore = await cookies();
  const token = cookieStore.get("dashboard_auth")?.value;
  if (!token) return false;
  const session = await getDashboardAuthSession(token);
  return !!session;
}

export async function POST(request) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let key, emails;
  try {
    const body = await request.json();
    key = body.key;
    emails = body.emails;
  } catch (_e) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!key) {
    return NextResponse.json({ error: "Key diperlukan" }, { status: 400 });
  }
  if (!Array.isArray(emails) || emails.length === 0) {
    return NextResponse.json({ error: "Daftar email kosong" }, { status: 400 });
  }

  let validKeys;
  try {
    validKeys = await fetchValidKeys();
  } catch (_e) {
    validKeys = [];
  }
  if (!validKeys.length) {
    return NextResponse.json({ error: "Tidak dapat memverifikasi key saat ini. Coba lagi." }, { status: 503 });
  }
  if (!validKeys.includes(key)) {
    return NextResponse.json({ error: "Key tidak valid atau tidak memiliki akses VIP." }, { status: 403 });
  }

  // Validation-only probe — key valid, no bot spawn
  if (emails.length === 1 && emails[0] === "__validate__") {
    return NextResponse.json({ ok: true });
  }

  if (!fs.existsSync(RUNNER)) {
    return NextResponse.json({ error: "Bot runner tidak tersedia di server." }, { status: 500 });
  }

  const reqUrl = new URL(request.url);
  const pageUrl = `${reqUrl.protocol}//${reqUrl.host}/dashboard/providers/antigravity`;

  let dashPass = "nana";
  try {
    const { getSettings } = await import("@/lib/localDb");
    const s = await getSettings();
    if (s?.password) dashPass = s.password;
  } catch (_e) { /* use default */ }

  const jobId = `ag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = { lines: [], done: false, error: null, summary: null };
  jobs.set(jobId, job);

  const pushLine = (line) => {
    if (!line.trim()) return;
    job.lines.push(line);
    if (job.lines.length > 3000) job.lines.shift();
  };

  const child = spawn("python", [RUNNER, pageUrl, dashPass, ...emails], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout.setEncoding("utf8").on("data", (d) => {
    for (const l of d.split(/\r?\n/)) {
      if (l.startsWith("{")) {
        try { job.summary = JSON.parse(l); } catch (_e) { pushLine(l); }
      } else {
        pushLine(l);
      }
    }
  });

  child.stderr.setEncoding("utf8").on("data", (d) => {
    for (const l of d.split(/\r?\n/)) pushLine(l);
  });

  child.on("error", (e) => {
    job.error = e.message;
    pushLine(`[ERROR] ${e.message}`);
    job.done = true;
  });

  child.on("close", (code) => {
    pushLine(`[Bot selesai — exit code ${code}]`);
    job.done = true;
  });

  // Auto-clean after 2 hours
  setTimeout(() => jobs.delete(jobId), 2 * 60 * 60 * 1000);

  return NextResponse.json({ jobId });
}

export async function GET(request) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const enq = (data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (_e) { /* client closed */ }
      };

      let sent = 0;

      function tick() {
        const job = jobs.get(jobId);
        if (!job) {
          enq({ error: "Job tidak ditemukan", done: true });
          try { controller.close(); } catch (_e) { /* ignore */ }
          return;
        }

        const newLines = job.lines.slice(sent);
        sent = job.lines.length;
        if (newLines.length) enq({ lines: newLines });

        if (job.done) {
          enq({ done: true, summary: job.summary, error: job.error });
          try { controller.close(); } catch (_e) { /* ignore */ }
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
