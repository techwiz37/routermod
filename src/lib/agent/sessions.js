import crypto from "node:crypto";
import { makeKv } from "@/lib/db/helpers/kvStore";

const store = makeKv("agentSessions");

const MAX_SESSIONS_PER_PROJECT = 40;
const MAX_LOG_ENTRIES = 120;
const MAX_MEDIA_WITH_DATA = 24;
const MAX_BYTES = 2_500_000;

function trimLog(log) {
  const kept = Array.isArray(log) ? log.slice(-MAX_LOG_ENTRIES) : [];
  let withData = 0;
  for (let i = kept.length - 1; i >= 0; i--) {
    const entry = kept[i];
    if (!Array.isArray(entry?.media)) continue;
    entry.media = entry.media.map((m) => {
      if (!m?.data) return { name: m?.name, kind: m?.kind };
      withData += 1;
      if (withData <= MAX_MEDIA_WITH_DATA) return m;
      return { name: m.name, kind: m.kind, saved: m.saved };
    });
  }
  return kept;
}

function makeTitle(log) {
  const first = (Array.isArray(log) ? log : []).find((e) => e?.kind === "user" && (e.text || "").trim());
  return (first?.text || "Sesi baru").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function newSessionId() {
  return crypto.randomUUID();
}

export async function listSessions(project) {
  const all = await store.getAll();
  return Object.values(all)
    .filter((s) => s && s.project === project)
    .map((s) => ({
      id: s.id,
      title: s.title || "Sesi baru",
      updatedAt: s.updatedAt || s.createdAt,
      createdAt: s.createdAt,
      turns: Array.isArray(s.log) ? s.log.filter((e) => e?.kind === "user").length : 0,
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function getSession(id) {
  return id ? await store.get(id, null) : null;
}

export async function saveSession(input) {
  const id = typeof input?.id === "string" && input.id ? input.id : newSessionId();
  const now = new Date().toISOString();
  const existing = await store.get(id, null);
  const log = trimLog(input?.log);
  const payload = {
    id,
    project: String(input?.project || existing?.project || ""),
    title: makeTitle(log),
    providerId: input?.providerId || existing?.providerId || "",
    model: input?.model || existing?.model || "",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    log,
  };

  let encoded = JSON.stringify(payload).length;
  if (encoded > MAX_BYTES) {
    for (let i = 0; i < payload.log.length && encoded > MAX_BYTES; i++) {
      const entry = payload.log[i];
      if (!Array.isArray(entry?.media)) continue;
      let touched = false;
      for (let j = 0; j < entry.media.length; j++) {
        if (entry.media[j]?.data) {
          entry.media[j] = { name: entry.media[j].name, kind: entry.media[j].kind, saved: entry.media[j].saved };
          touched = true;
        }
      }
      if (touched) encoded = JSON.stringify(payload).length;
    }
  }
  while (encoded > MAX_BYTES && payload.log.length > 1) {
    payload.log = payload.log.slice(Math.ceil(payload.log.length * 0.7));
    encoded = JSON.stringify(payload).length;
  }

  await store.set(id, payload);
  await prune(payload.project);
  return { id: payload.id, title: payload.title, updatedAt: payload.updatedAt };
}

export async function deleteSession(id) {
  await store.remove(id);
}

async function prune(project) {
  if (!project) return;
  const all = await store.getAll();
  const mine = Object.values(all)
    .filter((s) => s && s.project === project)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  for (const s of mine.slice(MAX_SESSIONS_PER_PROJECT)) {
    await store.remove(s.id);
  }
}
