import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { isAgentEnabled, resolveInsideRoot, isInside, getRootMode } from "@/lib/agent/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_READ_BYTES = 2 * 1024 * 1024;
const MAX_WRITE_BYTES = 5 * 1024 * 1024;

function disabled() {
  return NextResponse.json(
    { error: "AI Agent is disabled. Set AGENT_ENABLED=1 to turn it on." },
    { status: 403 },
  );
}

function fail(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function safeResolve(projectPath, targetPath) {
  const abs = resolveInsideRoot(targetPath, { projectPath });
  if (getRootMode() !== "full" && projectPath && !isInside(projectPath, abs)) {
    throw new Error("Path is outside the allowed project root");
  }
  return abs;
}

export async function GET(request) {
  if (!isAgentEnabled()) return disabled();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "list";
  const projectPath = searchParams.get("project") || "";
  const target = searchParams.get("path") || ".";

  try {
    const abs = safeResolve(projectPath, target);

    if (action === "list") {
      const stat = fs.statSync(abs);
      if (!stat.isDirectory()) return fail("Not a directory");
      const entries = fs.readdirSync(abs, { withFileTypes: true }).map((e) => {
        let size = 0;
        let mtime = null;
        try {
          const s = fs.statSync(path.join(abs, e.name));
          size = s.size;
          mtime = s.mtimeMs;
        } catch (_e) {
          /* eslint-disable-next-line no-empty */
        }
        return { name: e.name, type: e.isDirectory() ? "dir" : "file", size, mtime };
      });
      entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return NextResponse.json({ path: abs, parent: path.dirname(abs), entries });
    }

    if (action === "read") {
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) return fail("Target is a directory");
      if (stat.size > MAX_READ_BYTES) {
        return fail(`File too large to open (${stat.size} bytes > ${MAX_READ_BYTES})`, 413);
      }
      const buf = fs.readFileSync(abs);
      const binary = buf.includes(0);
      return NextResponse.json({
        path: abs,
        size: stat.size,
        binary,
        content: binary ? "" : buf.toString("utf8"),
      });
    }

    return fail(`Unknown action: ${action}`);
  } catch (e) {
    return fail(e?.message || String(e), 400);
  }
}

export async function POST(request) {
  if (!isAgentEnabled()) return disabled();
  const body = await readBody(request);
  const action = body.action;
  const projectPath = body.project || "";
  const target = body.path || ".";

  try {
    const abs = safeResolve(projectPath, target);

    if (action === "write") {
      const content = typeof body.content === "string" ? body.content : "";
      if (Buffer.byteLength(content, "utf8") > MAX_WRITE_BYTES) return fail("Content too large", 413);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, "utf8");
      return NextResponse.json({ ok: true, path: abs });
    }

    if (action === "mkdir") {
      fs.mkdirSync(abs, { recursive: true });
      return NextResponse.json({ ok: true, path: abs });
    }

    if (action === "rename") {
      const to = body.to;
      if (!to) return fail("Missing 'to'");
      const absTo = safeResolve(projectPath, to);
      fs.mkdirSync(path.dirname(absTo), { recursive: true });
      fs.renameSync(abs, absTo);
      return NextResponse.json({ ok: true, from: abs, to: absTo });
    }

    if (action === "delete") {
      const recursive = body.recursive === true;
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) {
        if (!recursive) return fail("Directory delete requires recursive:true");
        fs.rmSync(abs, { recursive: true, force: true });
      } else {
        fs.unlinkSync(abs);
      }
      return NextResponse.json({ ok: true, path: abs });
    }

    return fail(`Unknown action: ${action}`);
  } catch (e) {
    return fail(e?.message || String(e), 400);
  }
}
