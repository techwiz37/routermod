import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { isAgentEnabled, isTerminalEnabled, getTerminalTimeoutMs, resolveInsideRoot } from "@/lib/agent/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request) {
  if (!isAgentEnabled()) {
    return fail("AI Agent is disabled. Set AGENT_ENABLED=1 to turn it on.", 403);
  }
  if (!isTerminalEnabled()) {
    return fail("Terminal is disabled. Set AGENT_ALLOW_TERMINAL=1 to turn it on.", 403);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return fail("Invalid JSON body");
  }

  const command = typeof body.command === "string" ? body.command.trim() : "";
  if (!command) return fail("Missing 'command'");

  const projectPath = body.project || "";
  let cwd;
  try {
    cwd = resolveInsideRoot(projectPath || ".", { projectPath });
  } catch (e) {
    return fail(e?.message || String(e));
  }

  const timeoutMs = getTerminalTimeoutMs();
  const isWin = process.platform === "win32";
  const shellBin = isWin ? process.env.ComSpec || "cmd.exe" : process.env.SHELL || "/bin/sh";
  const shellArgs = isWin ? ["/d", "/s", "/c", command] : ["-c", command];

  return await new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const MAX_OUT = 256 * 1024;

    const child = spawn(shellBin, shellArgs, {
      cwd,
      env: { ...process.env, AGENT_SPAWNED: "1" },
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch (_e) {
        /* eslint-disable-next-line no-empty */
      }
      resolve(NextResponse.json({
        ok: false,
        timedOut: true,
        stdout,
        stderr: stderr + `\n[agent] command exceeded ${timeoutMs}ms and was killed`,
        code: null,
      }, { status: 200 }));
    }, timeoutMs);

    child.stdout?.on("data", (d) => {
      if (stdout.length < MAX_OUT) stdout += d.toString("utf8");
    });
    child.stderr?.on("data", (d) => {
      if (stderr.length < MAX_OUT) stderr += d.toString("utf8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(NextResponse.json({ ok: false, error: err.message }, { status: 200 }));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(NextResponse.json({
        ok: code === 0,
        code,
        stdout,
        stderr,
        truncated: stdout.length >= MAX_OUT || stderr.length >= MAX_OUT,
      }, { status: 200 }));
    });
  });
}
