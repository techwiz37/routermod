import crypto from "node:crypto";

/**
 * In-memory registry of agent runs.
 *
 * The agent work happens on the server, so a browser reload must not cancel it.
 * Every run keeps its event buffer here, which lets the client re-attach to a
 * still-running turn and pick up where it left off.
 */

const MAX_EVENTS = 4000;
const MAX_RUNS = 60;
const RUN_TTL_MS = 6 * 60 * 60 * 1000;

const runs = new Map();
let eventSeq = 0;

function prune() {
  const now = Date.now();
  for (const [id, run] of runs) {
    const stale = now - (run.finishedAt || run.createdAt) > RUN_TTL_MS;
    if (stale) runs.delete(id);
  }
  const finished = [...runs.values()]
    .filter((r) => r.status !== "running")
    .sort((a, b) => a.createdAt - b.createdAt);
  while (runs.size - finished.length + finished.length > MAX_RUNS) {
    const oldest = finished.shift();
    if (!oldest) break;
    runs.delete(oldest.id);
  }
}

export function createRun({ project, sessionId, providerId, model } = {}) {
  const id = crypto.randomUUID();
  const run = {
    id,
    project: project || "",
    sessionId: sessionId || "",
    providerId: providerId || "",
    model: model || "",
    status: "running",
    events: [],
    createdAt: Date.now(),
    finishedAt: null,
    subscribers: new Set(),
    // Aborted when the user stops the turn.
    controller: new AbortController(),
    cancelled: false,
  };
  runs.set(id, run);
  prune();
  return run;
}

export function getRun(id) {
  return runs.get(id) || null;
}

export function listRuns(project) {
  return [...runs.values()]
    .filter((r) => !project || r.project === project)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => ({
      id: r.id,
      project: r.project,
      sessionId: r.sessionId,
      providerId: r.providerId,
      model: r.model,
      status: r.status,
      createdAt: r.createdAt,
      finishedAt: r.finishedAt,
      eventCount: r.events.length,
    }));
}

/** Record an event and push it to every live subscriber. */
export function appendRunEvent(run, event) {
  if (!run) return;
  // Monotonic seq lets a re-attached client replay only what it missed after a
  // dropped connection, instead of duplicating already-rendered text.
  const stored = { ...event, _seq: ++eventSeq };
  run.events.push(stored);
  if (run.events.length > MAX_EVENTS) {
    run.events.splice(0, run.events.length - MAX_EVENTS);
  }
  for (const fn of [...run.subscribers]) {
    try {
      fn(stored);
    } catch {
      /* a dead subscriber must not break the run */
    }
  }
}

export function finishRun(run, status = "done") {
  if (!run) return;
  run.status = status;
  run.finishedAt = Date.now();
  for (const fn of [...run.subscribers]) {
    try {
      fn({ type: "__end__", status });
    } catch {
      /* ignore */
    }
  }
  run.subscribers.clear();
}

/**
 * Stop a running turn: the upstream request is aborted and every listener
 * (the browser that sent it and any re-attached client) is notified.
 */
export function cancelRun(id) {
  const run = getRun(id);
  if (!run) return null;
  if (run.status !== "running") {
    return { id: run.id, status: run.status, stopped: false };
  }
  run.cancelled = true;
  try {
    run.controller?.abort(new Error("stopped by user"));
  } catch {
    /* ignore */
  }
  for (const fn of [...run.subscribers]) {
    try {
      fn({ type: "cancelled" });
    } catch {
      /* ignore */
    }
  }
  finishRun(run, "cancelled");
  return { id: run.id, status: run.status, stopped: true };
}

/**
 * Subscribe to a run. A finished run replays its buffer and ends right away.
 * Returns an unsubscribe function.
 */
export function subscribeRun(run, fn, afterSeq = 0) {
  if (!run) return () => {};
  // Replay buffered events the client has not seen yet. This is required for
  // both finished runs and running runs: after a dropped SSE connection the
  // browser re-attaches mid-turn and must catch up before live events resume.
  for (const event of run.events) {
    if ((event._seq || 0) <= afterSeq) continue;
    try {
      fn(event);
    } catch {
      /* ignore */
    }
  }
  if (run.status !== "running") {
    try {
      fn({ type: "__end__", status: run.status });
    } catch {
      /* ignore */
    }
    return () => {};
  }
  run.subscribers.add(fn);
  return () => run.subscribers.delete(fn);
}
