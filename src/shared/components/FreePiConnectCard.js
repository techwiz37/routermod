"use client";

import { useCallback, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Card, Button, Badge } from "./";

const REFRESH_MS = 15000;

export default function FreePiConnectCard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/providers/freepi/status", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(await res.json());
      setError("");
    } catch (e) {
      setError(e.message || "Could not check FreePi status");
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const copyLogin = async () => {
    const cmd = status?.authCommand || "npx free-pi-cli@latest";
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      setError("");
    } catch {
      setError(`Salin manual: ${cmd}`);
    }
  };

  const connected = !!status?.bridgeRunning;
  const tokenReady = !!status?.hasToken;
  const missingBridge = status?.bridgeInstalled === false;
  const stalled = tokenReady && !connected;

  const startBridge = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/providers/freepi/start", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setTimeout(load, 3000);
    } catch (e) {
      setError(e.message || "Gagal menyalakan bridge");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="freepi-card">
      {/* Head: icon + title + status + refresh (wraps cleanly on phones) */}
      <div className="freepi-head">
        <span className="freepi-ico" aria-hidden>
          <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
        </span>
        <div className="freepi-head-copy">
          <div className="freepi-head-title-row">
            <h2 className="freepi-title">FreePi Bridge</h2>
            <Badge variant={connected ? "success" : tokenReady ? "warning" : "default"} size="sm">
              {connected ? "Connected" : tokenReady ? "Starting…" : "Not connected"}
            </Badge>
            {missingBridge && <Badge variant="danger" size="sm">Bridge missing</Badge>}
          </div>
          <p className="freepi-subtitle">
            Satu kali login GitHub, setelah itu bridge berjalan otomatis bersama RouterMod.
          </p>
        </div>
        <Button variant="secondary" size="sm" icon="refresh" onClick={load} disabled={loading} aria-label="Refresh FreePi status" />
      </div>

      {error && <p className="freepi-error" role="alert">{error}</p>}

      {!tokenReady && (
        <div className="freepi-step">
          <div className="freepi-step-head">
            <span className="material-symbols-outlined text-[16px]" aria-hidden>login</span>
            <span>Langkah sekali ini — butuh terminal</span>
          </div>
          <div className="freepi-command">
            <code>{status?.authCommand || "npx free-pi-cli@latest"}</code>
            <button type="button" onClick={copyLogin} className="freepi-copy" aria-label="Salin perintah login">
              <span className="material-symbols-outlined text-[15px]">{copied ? "check" : "content_copy"}</span>
            </button>
          </div>
          <p className="freepi-hint">Login GitHub via device code, lalu tutup. Token disimpan CLI, bukan RouterMod.</p>
          <div className="freepi-actions">
            <Button size="sm" icon={copied ? "check" : "content_copy"} onClick={copyLogin} className="freepi-action">
              {copied ? "Tersalin" : "Salin perintah"}
            </Button>
            <a href="https://freepi.ai/" target="_blank" rel="noopener noreferrer" className="freepi-action-link">
              <Button size="sm" variant="ghost" icon="open_in_new" className="freepi-action">Buka freepi.ai</Button>
            </a>
          </div>
        </div>
      )}

      {stalled && (
        <div className="freepi-state freepi-state-wait">
          <span className="material-symbols-outlined animate-spin text-[16px]" aria-hidden>progress_activity</span>
          <div className="min-w-0 flex-1">
            <p>Token terdeteksi, tapi bridge belum merespons. RouterMod sedang mencoba menyalakannya otomatis.</p>
            {status?.bridgeHealth?.error && (
              <p className="mt-1 font-mono text-[10px] opacity-80"> health: {String(status.bridgeHealth.error).slice(0, 120)}</p>
            )}
            <Button size="sm" variant="ghost" icon="play_arrow" onClick={startBridge} disabled={loading} className="mt-2">
              {loading ? "Menyalakan…" : "Nyalahkan bridge sekarang"}
            </Button>
          </div>
        </div>
      )}

      {connected && (
        <div className="freepi-state freepi-state-ok">
          <span className="material-symbols-outlined text-[16px]" aria-hidden>check_circle</span>
          <span>
            Bridge aktif di <code>127.0.0.1:8787</code> · {status?.models?.length || 0} model.
            {' '}Pakai <code>fr/&lt;model&gt;</code> di client kamu.
          </span>
        </div>
      )}
    </Card>
  );
}

FreePiConnectCard.propTypes = { /* no props needed */ };
