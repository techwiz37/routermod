import { getConsoleLogs, getConsoleEmitter, initConsoleLogCapture } from "@/lib/consoleLogBuffer";

export const dynamic = "force-dynamic";

initConsoleLogCapture();

// Lines per frame. Small frames keep the stream alive through proxies that
// buffer large chunks.
const FRAME_LINES = 20;
// A short heartbeat keeps the pipe warm on slow proxies.
const HEARTBEAT_MS = 3000;

export async function GET(request) {
  const encoder = new TextEncoder();
  const emitter = getConsoleEmitter();
  const state = { closed: false, send: null, sendLines: null, sendClear: null, keepalive: null };

  const cleanup = () => {
    if (state.closed) return;
    state.closed = true;
    if (state.send) emitter.off("line", state.send);
    if (state.sendLines) emitter.off("lines", state.sendLines);
    if (state.sendClear) emitter.off("clear", state.sendClear);
    if (state.keepalive) clearInterval(state.keepalive);
  };

  request.signal.addEventListener("abort", cleanup, { once: true });

  const stream = new ReadableStream({
    start(controller) {
      const push = (text) => {
        if (state.closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup();
        }
      };

      // A tiny first frame so proxies flush the response right away.
      push(`data: ${JSON.stringify({ type: "open" })}\n\n`);

      const buffered = getConsoleLogs();
      for (let i = 0; i < buffered.length; i += FRAME_LINES) {
        push(
          `data: ${JSON.stringify({ type: "lines", lines: buffered.slice(i, i + FRAME_LINES) })}\n\n`
        );
      }

      state.send = (line) => push(`data: ${JSON.stringify({ type: "line", line })}\n\n`);

      state.sendLines = (lines) => {
        if (state.closed || !Array.isArray(lines) || lines.length === 0) return;
        for (let i = 0; i < lines.length; i += FRAME_LINES) {
          push(
            `data: ${JSON.stringify({ type: "lines", lines: lines.slice(i, i + FRAME_LINES) })}\n\n`
          );
        }
      };

      state.sendClear = () => push(`data: ${JSON.stringify({ type: "clear" })}\n\n`);

      emitter.on("line", state.send);
      emitter.on("lines", state.sendLines);
      emitter.on("clear", state.sendClear);

      state.keepalive = setInterval(() => {
        if (state.closed) {
          clearInterval(state.keepalive);
          return;
        }
        push(": ping\n\n");
      }, HEARTBEAT_MS);
    },

    cancel() {
      cleanup();
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
