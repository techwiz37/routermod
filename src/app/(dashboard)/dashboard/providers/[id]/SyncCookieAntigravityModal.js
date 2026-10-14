"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { Button, Modal } from "@/shared/components";

// Cookie sync modal for Antigravity.
//
// The OAuth refresh token can be revoked by Google (invalid_grant / account
// deleted) while the browser session stays alive. This modal re-logs into each
// account's Google session and persists the resulting cookie jar so the
// connection can be auto-recovered without creating duplicate connections.

export default function SyncCookieAntigravityModal({ isOpen, onClose, providerId }) {
  const [step, setStep] = useState(1); // 1 | 2
  const [key, setKey] = useState("");
  const [keyError, setKeyError] = useState("");
  const [keyLoading, setKeyLoading] = useState(false);
  const [emailText, setEmailText] = useState("");
  const [emailError, setEmailError] = useState("");
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const [done, setDone] = useState(false);
  const [summary, setSummary] = useState(null);
  const [botError, setBotError] = useState(null);
  const termRef = useRef(null);
  const sseRef = useRef(null);

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [logLines]);

  // Prefill the email box with existing Antigravity accounts, one per line as
  // `email|password`. Passwords aren't in the DB, so users fill them in.
  const loadEmails = useCallback(async () => {
    setLoadingEmails(true);
    try {
      const res = await fetch(`/api/providers`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const list = (data.connections || []).filter((c) => c.provider === providerId);
      const emails = list
        .map((c) => c.email || c.name)
        .filter((e) => typeof e === "string" && e.includes("@"));
      const unique = [...new Set(emails)];
      setEmailText(unique.map((e) => `${e}|`).join("\n"));
    } catch {
      /* ignore */
    } finally {
      setLoadingEmails(false);
    }
  }, [providerId]);

  useEffect(() => {
    if (isOpen && step === 2 && !emailText) loadEmails();
  }, [isOpen, step, emailText, loadEmails]);

  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/providers/antigravity/bot-bulk?jobId=${jobId}`, { withCredentials: true });
    sseRef.current = es;
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.lines) setLogLines((prev) => [...prev, ...data.lines]);
        if (data.done) {
          setDone(true);
          if (data.summary) setSummary(data.summary);
          if (data.error) setBotError(data.error);
          es.close();
        }
      } catch {
        /* ignore parse errors */
      }
    };
    es.onerror = () => {
      setDone(true);
      setBotError("Koneksi SSE terputus.");
      es.close();
    };
    return () => { es.close(); };
  }, [jobId]);

  const resetAll = () => {
    setStep(1);
    setKey("");
    setKeyError("");
    setKeyLoading(false);
    setEmailText("");
    setEmailError("");
    setJobId(null);
    setLogLines([]);
    setDone(false);
    setSummary(null);
    setBotError(null);
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
  };

  const handleClose = () => { resetAll(); onClose(); };

  const handleValidateKey = async () => {
    const k = key.trim();
    if (!k) { setKeyError("Masukkan access key terlebih dahulu."); return; }
    setKeyLoading(true);
    setKeyError("");
    try {
      const res = await fetch("/api/providers/antigravity/bot-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: k, emails: ["__validate__"] }),
      });
      if (res.status === 403) setKeyError("Key tidak valid atau tidak memiliki akses VIP.");
      else if (res.status === 503) setKeyError("Tidak dapat memverifikasi key saat ini. Coba lagi.");
      else if (res.status === 401) setKeyError("Sesi tidak valid. Silakan login ulang.");
      else if (res.status === 400 || res.ok) setStep(2);
      else {
        const j = await res.json().catch(() => ({}));
        setKeyError(j.error || "Terjadi kesalahan. Coba lagi.");
      }
    } catch {
      setKeyError("Network error. Coba lagi.");
    } finally {
      setKeyLoading(false);
    }
  };

  const handleStart = async () => {
    const lines = emailText.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    const entries = lines.filter((l) => l.includes("@"));
    if (entries.length === 0) {
      setEmailError("Tidak ada email valid. Format: email@domain.com|password");
      return;
    }
    const noPass = entries.filter((l) => !l.split("|")[1]?.trim());
    if (noPass.length > 0) {
      setEmailError(`${noPass.length} akun belum diisi password. Format: email@domain.com|password`);
      return;
    }
    setEmailError("");
    setStep(3);
    setLogLines([`[Sync] Memproses cookie untuk ${entries.length} akun...`]);
    setDone(false);

    try {
      const res = await fetch("/api/providers/antigravity/bot-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim(), emails: entries, mode: "cookies" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBotError(data.error || "Gagal memulai sync.");
        setDone(true);
      } else {
        setJobId(data.jobId);
      }
    } catch (e) {
      setBotError("Network error: " + e.message);
      setDone(true);
    }
  };

  const title = step === 1 ? "VIP ACCESS" : step === 2 ? "SYNC COOKIE ANTIGRAVITY" : "SYNC RUNNING";

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size={step === 3 ? "lg" : "md"}>
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-xs text-text-muted leading-relaxed">
            Sync cookie menyimpan sesi browser akun lama supaya tetap bisa dipulihkan walau refresh token Google sudah dihapus.
          </p>
          <div>
            <input
              type="password"
              value={key}
              onChange={(e) => { setKey(e.target.value); setKeyError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleValidateKey()}
              placeholder="Masukkan access key..."
              autoFocus
              className="w-full rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-sm text-[var(--color-text-main)] shadow-[2px_2px_0_var(--color-border)] focus:border-[var(--color-primary)] focus:outline-none"
            />
            {keyError && <p className="mt-1.5 text-xs text-[var(--color-danger)] font-medium">{keyError}</p>}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleValidateKey} fullWidth icon="key" loading={keyLoading}>
              Verifikasi
            </Button>
            <Button onClick={handleClose} variant="ghost" fullWidth>
              Batal
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-xs text-text-muted leading-relaxed">
            Lengkapi password tiap akun. Format:{" "}
            <code className="font-mono text-[var(--color-primary)] font-bold">email@domain.com|password</code>
          </p>
          <div>
            <textarea
              value={emailText}
              onChange={(e) => { setEmailText(e.target.value); setEmailError(""); }}
              placeholder={`email1@gmail.com|password1\nemail2@gmail.com|password2`}
              rows={10}
              className="w-full rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-3 font-mono text-xs text-[var(--color-text-main)] shadow-[2px_2px_0_var(--color-border)] focus:border-[var(--color-primary)] focus:outline-none resize-none"
            />
            {emailError && <p className="mt-1 text-xs text-[var(--color-danger)] font-medium">{emailError}</p>}
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-text-muted">
            <span>{emailText.trim().split("\n").filter((l) => l.trim().includes("@")).length} akun</span>
            <button onClick={loadEmails} className="underline hover:text-[var(--color-primary)]">
              {loadingEmails ? "memuat..." : "muat ulang dari koneksi"}
            </button>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleStart} fullWidth icon="sync">
              Mulai Sync
            </Button>
            <Button onClick={() => setStep(1)} variant="ghost" fullWidth>
              Kembali
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-t-lg bg-[var(--color-border)] border-2 border-[var(--color-border)] border-b-0">
            <span className="size-3 rounded-full bg-red-500" />
            <span className="size-3 rounded-full bg-amber-400" />
            <span className="size-3 rounded-full bg-green-500" />
            <span className="ml-2 font-mono text-[10px] text-[var(--color-surface)] font-bold uppercase tracking-wider">
              antigravity cookie sync — live output
            </span>
            {!done && (
              <span className="ml-auto flex items-center gap-1 text-[10px] font-mono text-green-400">
                <span className="size-1.5 rounded-full bg-green-400 animate-pulse" />
                RUNNING
              </span>
            )}
            {done && (
              <span className="ml-auto flex items-center gap-1 text-[10px] font-mono text-[var(--color-surface)]/70">
                <span className="size-1.5 rounded-full bg-[var(--color-surface)]/70" />
                DONE
              </span>
            )}
          </div>

          <div
            ref={termRef}
            className="rounded-b-lg border-2 border-[var(--color-border)] border-t-0 bg-[#0d1117] p-3 font-mono text-[11px] text-green-400 leading-relaxed overflow-y-auto"
            style={{ height: "320px" }}
          >
            {logLines.map((line, i) => {
              const isError = /ERROR|GAGAL|failed|error/i.test(line);
              const isSuccess = /SUKSES|sukses|200 OK|berhasil|saved/i.test(line);
              const isSep = /^---/.test(line.trim()) || /^===/.test(line.trim());
              return (
                <div
                  key={i}
                  className={
                    isError ? "text-red-400" :
                    isSuccess ? "text-green-300 font-bold" :
                    isSep ? "text-amber-400 mt-1" :
                    "text-green-400/80"
                  }
                >
                  {line || " "}
                </div>
              );
            })}
            {!done && <div className="text-green-400 animate-pulse mt-1">█</div>}
          </div>

          {done && summary && (
            <div className="flex items-center gap-3 rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 font-mono text-xs shadow-[2px_2px_0_var(--color-border)]">
              <span className="text-text-muted">Hasil:</span>
              <span className="font-bold text-[var(--color-success)]">✓ {summary.added} cookie tersimpan</span>
              {summary.failed > 0 && <span className="font-bold text-[var(--color-danger)]">✗ {summary.failed} gagal</span>}
              <span className="text-text-muted ml-auto">dari {summary.total} akun</span>
            </div>
          )}

          {done && botError && (
            <p className="text-xs text-[var(--color-danger)] font-medium font-mono">{botError}</p>
          )}

          <div className="flex gap-2">
            {done && (
              <Button onClick={resetAll} variant="secondary" fullWidth icon="refresh">
                Mulai Lagi
              </Button>
            )}
            <Button onClick={handleClose} variant={done ? "ghost" : "danger"} fullWidth icon={done ? "close" : "stop"}>
              {done ? "Tutup" : "Hentikan"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

SyncCookieAntigravityModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  providerId: PropTypes.string.isRequired,
};
