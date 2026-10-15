import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  isAgentEnabled,
  isTerminalEnabled,
  getTerminalTimeoutMs,
  resolveInsideRoot,
  isInside,
  getRootMode,
} from "@/lib/agent/config";
import { resolveModelTarget } from "@/lib/agent/providerStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_READ_BYTES = 512 * 1024;
const UPSTREAM_TIMEOUT_MS = 180000;
const HEARTBEAT_MS = 8000;
const MAX_ATTACHMENTS = 6;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 32 * 1024 * 1024;
const MEDIA_DIR = ".agent-media";
const FRAME_TIMEOUT_MS = 45000;

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function isImageMime(mime) {
  return /^image\//i.test(String(mime || ""));
}

function isVideoMime(mime) {
  return /^video\//i.test(String(mime || ""));
}

function parseAttachment(att) {
  if (!att || typeof att !== "object") return null;
  const name = String(att.name || "attachment").replace(/[\\/]/g, "_").slice(0, 120) || "attachment";
  const mime = String(att.mime || "").split(";")[0].trim().toLowerCase();
  const raw = String(att.data || "");
  const m = /^data:([^;]+)?;base64,(.*)$/s.exec(raw);
  const b64 = m ? m[2] : raw;
  const resolvedMime = mime || (m && m[1]) || "";
  if (!b64 || !resolvedMime) return null;
  let buffer;
  try {
    buffer = Buffer.from(b64, "base64");
  } catch {
    return null;
  }
  if (!buffer.length) return null;
  return { name, mime: resolvedMime, buffer };
}

function imagePart(buffer, mime) {
  return { type: "image_url", image_url: { url: `data:${mime};base64,${buffer.toString("base64")}` } };
}

function saveVideoAttachment(buffer, name, projectPath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safe = name.replace(/[^\w.\-]+/g, "_").slice(-80) || "video";
  const abs = resolvePath(projectPath, `${MEDIA_DIR}/${stamp}-${safe}`);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buffer);
  return abs;
}

function extractVideoFrame(videoPath) {
  const out = `${videoPath}.frame.jpg`;
  const isWin = process.platform === "win32";
  const bin = process.env.FFMPEG_PATH || "ffmpeg";
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch (_e) {
        /* eslint-disable-next-line no-empty */
      }
      finish(null);
    }, FRAME_TIMEOUT_MS);
    const child = spawn(bin, ["-y", "-ss", "1", "-i", videoPath, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "4", out], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    child.on("error", () => {
      clearTimeout(timer);
      finish(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return finish(null);
      try {
        const buf = fs.readFileSync(out);
        fs.rmSync(out, { force: true });
        finish(buf.length > 0 ? buf : null);
      } catch (_e) {
        finish(null);
      }
    });
  });
}

async function prepareAttachments(list, projectPath, terminal) {
  const parts = [];
  const notes = [];
  const files = [];
  const skipped = [];

  for (const att of (Array.isArray(list) ? list : []).slice(0, MAX_ATTACHMENTS)) {
    const parsed = parseAttachment(att);
    if (!parsed) {
      skipped.push("lampiran rusak/tidak terbaca");
      continue;
    }
    const { name, mime, buffer } = parsed;

    if (isImageMime(mime)) {
      if (buffer.length > MAX_IMAGE_BYTES) {
        skipped.push(`${name} (${fmtBytes(buffer.length)}) melebihi ${fmtBytes(MAX_IMAGE_BYTES)}`);
        continue;
      }
      parts.push(imagePart(buffer, mime));
      notes.push(`Gambar "${name}" (${mime}, ${fmtBytes(buffer.length)}) disertakan dalam pesan ini.`);
      continue;
    }

    if (isVideoMime(mime)) {
      if (buffer.length > MAX_VIDEO_BYTES) {
        skipped.push(`${name} (${fmtBytes(buffer.length)}) melebihi ${fmtBytes(MAX_VIDEO_BYTES)}`);
        continue;
      }
      let abs;
      try {
        abs = saveVideoAttachment(buffer, name, projectPath);
      } catch (e) {
        skipped.push(`${name}: gagal disimpan (${e?.message || e})`);
        continue;
      }
      const rel = path.relative(projectPath || process.cwd(), abs).split(path.sep).join("/");
      files.push(rel);

      if (!terminal) {
        notes.push(`Video "${name}" (${mime}, ${fmtBytes(buffer.length)}) disimpan di ${rel}. Terminal nonaktif, jadi kamu tidak bisa menganalisis isinya.`);
        continue;
      }

      const frame = await extractVideoFrame(abs);
      if (frame) {
        parts.push(imagePart(frame, "image/jpeg"));
        notes.push(
          `Video "${name}" (${mime}, ${fmtBytes(buffer.length)}) disimpan di ${rel}. Satu frame (±1 detik) diekstrak dan disertakan sebagai gambar. Gunakan run_command dengan ffprobe/ffmpeg di ${rel} untuk detail lain (durasi, resolusi, frame lain).`
        );
      } else {
        notes.push(
          `Video "${name}" (${mime}, ${fmtBytes(buffer.length)}) disimpan di ${rel}. Ekstrak frame gagal (ffmpeg tidak tersedia?). Gunakan run_command dengan ffprobe/ffmpeg untuk menganalisisnya.`
        );
      }
      continue;
    }

    skipped.push(`${name}: tipe ${mime} belum didukung (hanya gambar/video)`);
  }

  return { parts, notes, files, skipped };
}

function toolDefs({ terminal }) {
  const tools = [
    {
      type: "function",
      function: {
        name: "list_dir",
        description: "List files and folders inside a directory of the selected project. Paths are relative to the project root.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Directory path relative to project root. Use '.' for the root." },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "read_file",
        description: "Read the UTF-8 text contents of a file in the project. Returns an error for files larger than 512 KB.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path relative to project root." },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "write_file",
        description: "Create or overwrite a file with the given text content. Parent directories are created automatically.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path relative to project root." },
            content: { type: "string", description: "Full file content to write." },
          },
          required: ["path", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "delete_path",
        description: "Delete a file or (recursively) a directory inside the project.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path relative to project root." },
          },
          required: ["path"],
        },
      },
    },
  ];

  if (terminal) {
    tools.push({
      type: "function",
      function: {
        name: "run_command",
        description: "Run a shell command with the working directory set to the project root. Use for builds, tests, git, listing, etc. Long output is truncated.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "The command line to execute." },
          },
          required: ["command"],
        },
      },
    });
  }

  return tools;
}

function resolvePath(projectPath, target) {
  const abs = resolveInsideRoot(target || ".", { projectPath });
  if (getRootMode() !== "full" && projectPath && !isInside(projectPath, abs)) {
    throw new Error("Path is outside the allowed project root");
  }
  return abs;
}

function runCommand(command, cwd, timeoutMs) {
  const isWin = process.platform === "win32";
  const shellBin = isWin ? process.env.ComSpec || "cmd.exe" : process.env.SHELL || "/bin/sh";
  const shellArgs = isWin ? ["/d", "/s", "/c", command] : ["-c", command];
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const MAX_OUT = 128 * 1024;
    const child = spawn(shellBin, shellArgs, { cwd, windowsHide: true });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch (_e) {
        /* eslint-disable-next-line no-empty */
      }
      resolve({ ok: false, code: null, stdout, stderr: stderr + `\n[timeout after ${timeoutMs}ms]` });
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
      resolve({ ok: false, code: null, stdout, stderr: stderr + `\n${err.message}` });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

async function executeTool(name, args, { projectPath, terminal }) {
  try {
    if (name === "list_dir") {
      const abs = resolvePath(projectPath, args?.path || ".");
      const stat = fs.statSync(abs);
      if (!stat.isDirectory()) return { error: "Not a directory" };
      const entries = fs.readdirSync(abs, { withFileTypes: true }).map((e) => `${e.isDirectory() ? "d" : "-"} ${e.name}`);
      entries.sort();
      return { path: abs, entries };
    }

    if (name === "read_file") {
      const abs = resolvePath(projectPath, args?.path);
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) return { error: "Target is a directory" };
      if (stat.size > MAX_READ_BYTES) return { error: `File too large (${stat.size} bytes)` };
      const buf = fs.readFileSync(abs);
      if (buf.includes(0)) return { error: "File appears to be binary" };
      return { path: abs, content: buf.toString("utf8") };
    }

    if (name === "write_file") {
      const abs = resolvePath(projectPath, args?.path);
      const content = typeof args?.content === "string" ? args.content : "";
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, "utf8");
      return { ok: true, path: abs, bytes: Buffer.byteLength(content, "utf8") };
    }

    if (name === "delete_path") {
      const abs = resolvePath(projectPath, args?.path);
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) fs.rmSync(abs, { recursive: true, force: true });
      else fs.unlinkSync(abs);
      return { ok: true, path: abs };
    }

    if (name === "run_command") {
      if (!terminal) return { error: "Terminal is disabled (set AGENT_ALLOW_TERMINAL=1)" };
      const cwd = resolvePath(projectPath, ".");
      return await runCommand(String(args?.command || ""), cwd, getTerminalTimeoutMs());
    }

    return { error: `Unknown tool: ${name}` };
  } catch (e) {
    return { error: e?.message || String(e) };
  }
}

function sse(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function parseToolArgs(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

async function callUpstreamOnce({ url, headers, model, messages, tools, emit }) {
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages, tools, tool_choice: "auto", stream: true }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upstream HTTP ${res.status}: ${text.slice(0, 400)}`);
  }

  const contentType = res.headers.get("content-type") || "";

  if (!contentType.includes("event-stream")) {
    emit({ type: "status", text: "Model sedang menyusun jawaban…" });
    const data = await res.json().catch(() => null);
    const message = data?.choices?.[0]?.message;
    if (!message) throw new Error("Upstream returned no choices");
    const content = message.content || "";
    if (content) emit({ type: "assistant_text", text: content });
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    return {
      content,
      toolCalls: calls.map((c) => ({ id: c.id || "", name: c.function?.name || "", args: c.function?.arguments || "" })),
      finish: data?.choices?.[0]?.finish_reason || null,
    };
  }

  emit({ type: "status", text: "Model sedang berpikir…" });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const pending = [];
  let finish = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop();
    for (const frame of frames) {
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue;
        }
        if (parsed.error) throw new Error(parsed.error.message || String(parsed.error));
        const choice = parsed.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta || {};
        if (typeof delta.content === "string" && delta.content) {
          content += delta.content;
          emit({ type: "assistant_text", text: delta.content });
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = typeof tc.index === "number" ? tc.index : 0;
            if (!pending[idx]) pending[idx] = { id: "", name: "", args: "" };
            if (tc.id) pending[idx].id = tc.id;
            if (tc.function?.name) pending[idx].name = tc.function.name;
            if (tc.function?.arguments) pending[idx].args += tc.function.arguments;
          }
        }
        if (choice.finish_reason) finish = choice.finish_reason;
      }
    }
  }

  return { content, toolCalls: pending.filter(Boolean), finish };
}

export async function POST(request) {
  if (!isAgentEnabled()) {
    return new Response(JSON.stringify({ error: "AI Agent is disabled. Set AGENT_ENABLED=1." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const projectPath = body.project || "";
  const providerId = body.providerId;
  const model = body.model;
  const userMessages = Array.isArray(body.messages) ? body.messages : [];
  const terminal = isTerminalEnabled();
  const maxSteps = Math.min(Math.max(Number(body.maxSteps) || 12, 1), 40);

  let target;
  try {
    target = await resolveModelTarget({ providerId, model });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const systemPrompt = [
    "You are Routermod Agent, a coding assistant with direct access to a project workspace.",
    `All file paths you pass to tools are relative to the project root: ${projectPath || "(full filesystem mode)"}.`,
    "Read files before editing them. Prefer small, focused changes.",
    terminal
      ? "You may run shell commands. The working directory is always the project root."
      : "You cannot run shell commands in this session; use file tools only.",
    "When the user attaches an image, describe or analyse what you actually see in it. When the user attaches a video, it is saved into the project and only one frame is shown — inspect the real file with run_command (ffprobe/ffmpeg) when you need more.",
    "When you are done, reply with a concise summary of what you changed and why. Do not paste whole files back.",
  ].join("\n");

  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  const media = await prepareAttachments(attachments, projectPath, terminal);

  const messages = [{ role: "system", content: systemPrompt }];
  userMessages.forEach((m, i) => {
    const isLast = i === userMessages.length - 1;
    if (isLast && media.parts.length) {
      const textParts = typeof m.content === "string" && m.content.trim() ? [{ type: "text", text: m.content }] : [];
      if (media.notes.length) textParts.push({ type: "text", text: media.notes.join("\n") });
      messages.push({ role: m.role, content: [...textParts, ...media.parts] });
      return;
    }
    messages.push({ role: m.role, content: m.content });
  });

  const tools = toolDefs({ terminal });
  const url = `${target.baseUrl}/chat/completions`;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (obj) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sse(obj)));
        } catch {
          closed = true;
        }
      };
      const heartbeat = setInterval(() => send({ type: "ping", ts: Date.now() }), HEARTBEAT_MS);

      if (media.files.length || media.skipped.length) {
        send({ type: "attachments", files: media.files, skipped: media.skipped });
      }

      try {
        for (let step = 0; step < maxSteps; step++) {
          send({ type: "status", text: step === 0 ? "Menghubungi model…" : "Menyusun langkah berikutnya…" });

          const headers = { "Content-Type": "application/json", Accept: "text/event-stream" };
          if (target.apiKey) headers.Authorization = `Bearer ${target.apiKey}`;

          const { content, toolCalls } = await callUpstreamOnce({
            url,
            headers,
            model: target.model,
            messages,
            tools,
            emit: send,
          });

          if (!toolCalls.length) {
            if (!content) send({ type: "error", error: "Model tidak mengembalikan balasan apa pun. Coba model lain atau kirim ulang." });
            send({ type: "done" });
            break;
          }

          const callsWithIds = toolCalls.map((c, i) => ({ ...c, id: c.id || `call_${step}_${i}` }));

          messages.push({
            role: "assistant",
            content: content || null,
            tool_calls: callsWithIds.map((c) => ({
              id: c.id,
              type: "function",
              function: { name: c.name, arguments: c.args || "{}" },
            })),
          });

          for (const call of callsWithIds) {
            const args = parseToolArgs(call.args);
            send({ type: "tool_call", id: call.id, name: call.name, args });
            const result = await executeTool(call.name, args, { projectPath, terminal });
            send({ type: "tool_result", id: call.id, name: call.name, result, ok: !result?.error });
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify(result).slice(0, 100000),
            });
          }

          if (step === maxSteps - 1) send({ type: "done", note: "Reached max steps" });
        }
      } catch (e) {
        send({ type: "error", error: e?.message || String(e) });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch (_e) {
          /* eslint-disable-next-line no-empty */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
