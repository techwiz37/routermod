import { getRun, subscribeRun } from "@/lib/agent/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Re-attach to an agent run.
 *
 * The browser may reload while the agent is still working. The run keeps
 * running on the server, so the client can open this stream and receive every
 * event it produced so far plus the ones that follow.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const run = getRun(id);

  if (!run) {
    return new Response("data: {\"type\":\"error\",\"error\":\"Run not found\"}\n\n", {
      status: 404,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    });
  }

  const encoder = new TextEncoder();
  const sse = (obj) => `data: ${JSON.stringify(obj)}\n\n`;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sse(event)));
        } catch {
          closed = true;
        }
      };

      const unsubscribe = subscribeRun(run, send);
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: {"type":"ping"}\n\n`));
        } catch {
          closed = true;
        }
      }, 8000);

      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      };

      request.signal?.addEventListener?.("abort", cleanup);
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
