"use client";

import { useEffect, useState, useRef } from "react";

const I18N = {
  id: {
    title: "Aktivitas Gateway",
    subtitle: "Live Request Feed",
    loading: "Memuat data...",
    unavailable: "Tidak tersedia",
    empty: "Belum ada request",
    model: "Model",
    status: "Status",
    time: "Waktu",
    liveLabel: "LIVE",
  },
  en: {
    title: "Gateway Activity",
    subtitle: "Live Request Feed",
    loading: "Loading...",
    unavailable: "Unavailable",
    empty: "No requests yet",
    model: "Model",
    status: "Status",
    time: "Time",
    liveLabel: "LIVE",
  },
};

function toneFor(status) {
  const s = String(status || "").toLowerCase();
  if (
    s.includes("error") ||
    s.includes("fail") ||
    s.includes("500") ||
    s.includes("502") ||
    s.includes("503")
  ) {
    return { color: "var(--t-danger)", label: "err", cls: "err" };
  }
  if (
    s.includes("pending") ||
    s.includes("running") ||
    s.includes("loading")
  ) {
    return { color: "var(--t-star-ink)", label: "pending", cls: "warn" };
  }
  return { color: "var(--t-ok)", label: "ok", cls: "ok" };
}

function timeAgoShort(ts) {
  if (!ts) return "";
  const match = String(ts).match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  let d;
  if (match) {
    d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4]), Number(match[5]), Number(match[6]));
  } else {
    d = new Date(ts);
  }
  if (isNaN(d.getTime())) return ts;
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 1) return "1 dtk";
  if (diff < 60) return `${diff} dtk`;
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam`;
  return `${Math.floor(diff / 86400)} hari`;
}

function FeedRow({ log, isNew }) {
  const parts = String(log || "").split(" | ");
  const tone = toneFor(parts[6]);
  const model = parts[1] || "-";
  const tokensIn = parts[4] || "-";
  const tokensOut = parts[5] || "-";
  const ago = timeAgoShort(parts[0]);

  return (
    <div className="lrm-row-simple" data-new={isNew ? "1" : "0"}>
      <div className="lrm-row-header">
        <div className="lrm-model-wrap">
          <span className="lrm-dot" style={{ background: tone.color }} />
          <span className="lrm-model-text">{model}</span>
        </div>
        <span className="lrm-time-text">{ago}</span>
      </div>
      <div className="lrm-tokens">
        <span className="lrm-token-in">{tokensIn}↑</span>
        <span className="lrm-token-out">{tokensOut}↓</span>
      </div>
    </div>
  );
}

export default function RecentRequestsMonitor({ locale = "id" }) {
  const t = I18N[locale] || I18N.id;
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [newKeys, setNewKeys] = useState(new Set());
  const [pulse, setPulse] = useState(false);
  const prevLogsRef = useRef([]);

  useEffect(() => {
    if (newKeys.size === 0) return;
    const timer = setTimeout(() => setNewKeys(new Set()), 1300);
    return () => clearTimeout(timer);
  }, [newKeys]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch("/api/usage/logs");
        const data = res.ok ? await res.json() : null;
        if (!alive) return;

        const next = Array.isArray(data) ? data : [];
        const prev = prevLogsRef.current;
        const freshKeys = new Set();

        if (prev.length > 0) {
          const prevSet = new Set(prev.slice(0, 5).map((l) => String(l)));
          next.slice(0, 5).forEach((l, i) => {
            if (!prevSet.has(String(l))) freshKeys.add(i);
          });
        }

        if (freshKeys.size > 0) {
          setPulse(true);
          setTimeout(() => setPulse(false), 800);
        }

        prevLogsRef.current = next;
        setNewKeys(freshKeys);
        setLogs(next);
        setFailed(false);
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    const timer = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <section className="an-card lrm-card" data-locale={locale}>
      <div className="an-card-head lrm-head">
        <div className="lrm-head-left">
          <div className="lrm-icon-wrap">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              monitoring
            </span>
          </div>
          <div>
            <div className="lrm-title">{t.title}</div>
            <div className="lrm-subtitle">{t.subtitle}</div>
          </div>
        </div>
        <div className="lrm-live-badge" data-pulse={pulse ? "1" : "0"}>
          <span className="lrm-live-dot" />
          {t.liveLabel}
        </div>
      </div>

      <div className="lrm-feed" style={{ maxHeight: 380, overflowY: "auto" }}>
        {loading ? (
          <div className="lrm-state">
            <span className="lrm-spinner" />
            {t.loading}
          </div>
        ) : failed ? (
          <div className="lrm-state lrm-state-err">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              signal_disconnected
            </span>
            {t.unavailable}
          </div>
        ) : logs.length === 0 ? (
          <div className="lrm-empty-state">
            <div className="lrm-empty-icon">
              <span className="material-symbols-outlined">inbox</span>
            </div>
            <div>{t.empty}</div>
            <div className="lrm-empty-hint">Menunggu request pertama...</div>
          </div>
        ) : (
          logs.map((log, idx) => (
            <FeedRow key={idx} log={log} isNew={newKeys.has(idx)} />
          ))
        )}
      </div>

      <div className="lrm-footer">
        <span className="lrm-count">
          {logs.length > 0 ? `${logs.length} request` : ""}
        </span>
        <span className="lrm-refresh-hint">
          <span className="material-symbols-outlined" style={{ fontSize: 11, verticalAlign: "middle" }}>
            sync
          </span>
          {" "}3s
        </span>
      </div>
    </section>
  );
}
