// "Lanjutkan" should keep working in the background: the server picks the
// session up, sends the continue prompt to the model by itself and keeps the
// run alive - the browser only follows along.
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createRun } from "@/lib/agent/runs";
import { getSession } from "@/lib/agent/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTINUE_PROMPT =
  "Lanjutkan pekerjaan dari titik terakhir. Lanjutkan dari perintah yang belum " +
  "selesai, dan pastikan hasilnya benar-benar tersimpan di project.";

export async function POST(request) {
  try {
    const body = await request.json();
    const project = body.project || "";
    const sessionId = body.sessionId || "";
    const providerId = body.providerId || "";
    const model = body.model || "";

    if (!project) {
      return NextResponse.json({ error: "Project belum dipilih" }, { status: 400 });
    }

    // The history of the session is the context for the continue run.
    let baseLog = [];
    if (sessionId) {
      try {
        const session = await getSession({ project, id: sessionId });
        baseLog = Array.isArray(session?.log) ? session.log : [];
      } catch {
        baseLog = [];
      }
    }

    const messages = baseLog
      .filter(
        (e) =>
          (e.kind === "user" || e.kind === "assistant") &&
          ((e.text || "").trim() || e.media?.length)
      )
      .map((e) => ({
        role: e.kind,
        content: (e.text || "").trim() || (e.kind === "user" ? "(melampirkan media)" : ""),
      }));
    messages.push({ role: "user", content: CONTINUE_PROMPT });

    const run = createRun({ project, sessionId, providerId, model });
    // The session log is kept: the continue turn is appended, not replacing it.
    run.baseLog = baseLog;

    // Hand the work to the agent - in the background.
    const port = process.env.PORT || "1337";
    const cookie = request.headers.get("cookie") || "";
    const headers = { "Content-Type": "application/json" };
    if (cookie) headers.Cookie = cookie;

    fetch(`http://127.0.0.1:${port}/api/agent/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        project,
        sessionId,
        providerId,
        model,
        messages,
        runId: run.id,
        background: true,
      }),
    }).catch((e) => {
      console.log("[AGENT CONTINUE] background start failed:", e?.message || e);
    });

    return NextResponse.json({ ok: true, runId: run.id, prompt: CONTINUE_PROMPT });
  } catch (error) {
    console.log("Error continuing agent run:", error);
    return NextResponse.json({ error: "Gagal melanjutkan proses" }, { status: 500 });
  }
}
