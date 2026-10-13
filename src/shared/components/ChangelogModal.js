"use client";

import { useEffect, useState, useRef } from "react";
import PropTypes from "prop-types";
import Image from "next/image";

let _prefetched = null;

export default function ChangelogModal({ isOpen, onClose }) {
  const [commits, setCommits] = useState(_prefetched || []);
  const [loading, setLoading] = useState(!_prefetched);
  const [error, setError] = useState("");
  const modalRef = useRef(null);

  useEffect(() => {
    if (_prefetched) return;
    fetch("/api/changelog")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        _prefetched = d.commits || [];
        setCommits(_prefetched);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && isOpen) onClose(); };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", onKey);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 md:p-8">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose} />

      <div
        ref={modalRef}
        className="relative w-full max-w-2xl bg-surface border-2 border-border rounded-xl shadow-[4px_6px_0px_var(--color-border)] animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[82vh] overflow-hidden z-10 m-auto"
      >
        {}
        <div className="flex items-center justify-between p-3.5 sm:p-4 border-b-2 border-border bg-surface-2">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-[#ff1a53]/15 border-2 border-border shadow-[1.5px_1.5px_0px_var(--color-border)] flex items-center justify-center text-[#ff1a53]">
              <span className="material-symbols-outlined text-[18px]">history</span>
            </div>
            <div>
              <h2 className="font-mono text-sm sm:text-base font-bold text-text-main uppercase tracking-wider flex items-center gap-2">
                <span>Changelog</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-border bg-surface text-[#ff1a53]">
                  Git Live
                </span>
              </h2>
              <p className="font-mono text-[10.5px] text-text-muted">
                Riwayat commit otomatis dari repositori GitHub RouterMod
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-8 rounded-md border-2 border-border bg-surface text-text-muted hover:text-text-main hover:bg-surface-2 shadow-[1.5px_1.5px_0px_var(--color-border)] active:translate-y-0.5 transition-all flex items-center justify-center cursor-pointer"
            aria-label="Tutup"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {}
        <div className="p-3.5 sm:p-5 overflow-y-auto space-y-3 custom-scrollbar flex-1">
          {loading ? (
            <div className="p-8 text-center font-mono text-xs text-text-muted flex flex-col items-center justify-center gap-2">
              <span className="material-symbols-outlined animate-spin text-[24px] text-[#ff1a53]">progress_activity</span>
              <span>Memuat commit terbaru...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg border-2 border-red-500/30 bg-red-500/10 text-red-500 font-mono text-xs">
              [!] Gagal mengambil riwayat commit: {error}
            </div>
          ) : commits.length === 0 ? (
            <div className="p-8 text-center font-mono text-xs text-text-muted">
              Belum ada riwayat commit.
            </div>
          ) : (
            commits.map((c) => (
              <div
                key={c.sha}
                className="p-3 sm:p-4 rounded-lg border-2 border-border bg-surface-2 hover:bg-surface-2/70 shadow-[2px_2px_0px_var(--color-border)] transition-all font-mono"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    {}
                    {c.avatar ? (
                      <Image
                        src={c.avatar}
                        alt={c.author}
                        width={20}
                        height={20}
                        className="rounded-full border border-border"
                        unoptimized
                      />
                    ) : (
                      <div className="size-5 rounded-full bg-primary/20 border border-border flex items-center justify-center text-[9px] font-bold text-primary">
                        {(c.author || "?")[0].toUpperCase()}
                      </div>
                    )}

                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-0.5 rounded bg-[#ff1a53] text-white text-[10.5px] font-bold hover:underline flex items-center gap-1 shadow-[1px_1px_0px_var(--color-border)]"
                    >
                      <span className="material-symbols-outlined text-[11px]">commit</span>
                      <span>{c.sha}</span>
                    </a>
                    <span className="text-[11px] font-bold text-text-main">{c.author}</span>
                  </div>
                  <span className="text-[10px] text-text-muted">
                    {c.date ? new Date(c.date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : ""}
                  </span>
                </div>

                <h3 className="text-xs sm:text-sm font-bold text-text-main break-words">{c.title}</h3>

                {c.body && (
                  <div className="mt-2 pt-2 border-t border-border text-[11px] text-text-muted whitespace-pre-wrap break-words leading-relaxed max-h-36 overflow-y-auto custom-scrollbar font-sans">
                    {c.body}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {}
        <div className="p-3 border-t-2 border-border bg-surface-2 flex items-center justify-between font-mono text-xs">
          <a
            href="https://github.com/techwiz37/routermod/commits"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#ff1a53] hover:underline font-bold inline-flex items-center gap-1 text-[11px]"
          >
            <span>Buka Semua Commit di GitHub</span>
            <span className="material-symbols-outlined text-[13px]">open_in_new</span>
          </a>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border-2 border-border bg-surface text-text-main hover:bg-surface-2 shadow-[1.5px_1.5px_0px_var(--color-border)] active:translate-y-0.5 font-bold uppercase text-[11px] cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

ChangelogModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
