"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./check-models.module.css";

const TEXT = {
  en: {
    title: "Check Models", description: "Enter your RouterMod API key to see the models it can access.",
    key: "API key", check: "Check Models", checking: "Checking...", close: "Close", copy: "Copy All", copied: "Copied",
    invalid_key: "Invalid, inactive, or expired API key.", access_denied: "This API key cannot be used from your IP address.",
    load_failed: "Could not load models. Please try again.", empty: "No models are available for this API key.",
    results: "Allowed models", copy_failed: "Could not copy. Select the model IDs and copy them manually.",
    hint: "Your key is used for this check only and cleared when you close this window.",
    ready: "Your available models will appear here.", readyHint: "Enter an API key above to check its model access.",
    show: "Show API key", hide: "Hide API key", modelId: "Model ID", placeholder: "Paste your RouterMod API key",
  },
  id: {
    title: "Cek Model", description: "Masukkan API key RouterMod untuk melihat model yang dapat diakses.",
    key: "API key", check: "Cek Model", checking: "Memeriksa...", close: "Tutup", copy: "Salin Semua", copied: "Tersalin",
    invalid_key: "API key tidak valid, nonaktif, atau kedaluwarsa.", access_denied: "API key ini tidak dapat digunakan dari alamat IP Anda.",
    load_failed: "Gagal memuat model. Silakan coba lagi.", empty: "Tidak ada model yang tersedia untuk API key ini.",
    results: "Model yang diizinkan", copy_failed: "Gagal menyalin. Pilih ID model dan salin secara manual.",
    hint: "Key hanya digunakan untuk pemeriksaan ini dan dihapus saat jendela ditutup.",
    ready: "Model yang tersedia akan tampil di sini.", readyHint: "Masukkan API key di atas untuk memeriksa akses modelnya.",
    show: "Tampilkan API key", hide: "Sembunyikan API key", modelId: "ID model", placeholder: "Tempel API key RouterMod Anda",
  },
};

export default function CheckModels({ locale = "en" }) {
  const t = TEXT[locale] || TEXT.en;
  const dialog = useRef(null);
  const controller = useRef(null);
  const busy = useRef(false);
  const id = useId();
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => () => controller.current?.abort(), []);

  const reset = () => {
    controller.current?.abort();controller.current = null;busy.current = false;
    setApiKey("");setModels(null);setError("");setCopied(false);setLoading(false);setShowKey(false);
  };
  const check = async (event) => {
    event.preventDefault();
    if (busy.current || !apiKey.trim()) return;
    const request = new AbortController();controller.current = request;busy.current = true;
    setLoading(true);setModels(null);setError("");setCopied(false);
    try {
      const response = await fetch("/api/public/check-models", {
        method: "POST", headers: { Authorization: `Bearer ${apiKey.trim()}` },
        cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]),
      });
      const result = await response.json();
      if (controller.current !== request || request.signal.aborted) return;
      if (!response.ok) { setError(TEXT.en[result.error] ? result.error : "load_failed");return; }
      setModels(result.models || []);
    } catch {
      if (!request.signal.aborted) setError("load_failed");
    } finally {
      if (controller.current === request) { busy.current = false;setLoading(false); }
    }
  };

  return <>
    <button type="button" className={styles.trigger} onClick={() => dialog.current?.showModal()}>
      <span aria-hidden="true" className="material-symbols-outlined text-lg">list_alt</span>{t.title}
    </button>
    <dialog ref={dialog} aria-labelledby={id + "-title"} aria-describedby={id + "-description"} onClose={reset}
      className={styles.dialog}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={`material-symbols-outlined ${styles.headingIcon}`} aria-hidden="true">key</span>
          <h2 id={id + "-title"}>{t.title}</h2>
        </div>
        <button type="button" aria-label={t.close} onClick={() => dialog.current?.close()} className={styles.iconButton}>
          <span aria-hidden="true" className="material-symbols-outlined">close</span>
        </button>
      </header>
      <div className={styles.body}>
      <p id={id + "-description"} className={styles.description}>{t.description}</p>
      <form onSubmit={check} className={styles.form}>
        <label htmlFor={id + "-key"}>{t.key}</label>
        <div className={styles.inputGroup}>
        <input id={id + "-key"} type={showKey ? "text" : "password"} autoComplete="off" autoCapitalize="none" spellCheck={false} required autoFocus value={apiKey} disabled={loading}
          placeholder={t.placeholder} aria-describedby={id + "-hint"} aria-invalid={error === "invalid_key"} maxLength={8192}
          onChange={(event) => { setApiKey(event.target.value);setModels(null);setError("");setCopied(false); }}
          className={styles.input} />
        <button type="button" className={styles.iconButton} aria-label={showKey ? t.hide : t.show} aria-pressed={showKey} onClick={() => setShowKey((value) => !value)}>
          <span className="material-symbols-outlined" aria-hidden="true">{showKey ? "visibility_off" : "visibility"}</span>
        </button>
        </div>
        <p id={id + "-hint"} className={styles.hint}>{t.hint}</p>
        <button type="submit" disabled={loading || !apiKey.trim()} aria-busy={loading} className={styles.submit}>
          <span className="material-symbols-outlined" aria-hidden="true">{loading ? "hourglass_top" : "manage_search"}</span>
          {loading ? t.checking : t.check}
        </button>
      </form>
      {error && <p role="alert" className={styles.error}><span aria-hidden="true" className="material-symbols-outlined">error</span>{t[error]}</p>}
      <section className={styles.results} aria-busy={loading}>
        <div className={styles.resultsHeader}>
          <h3>{t.results}{models !== null && <span className={styles.count}>{new Intl.NumberFormat(locale).format(models.length)}</span>}</h3>
          {models !== null &&
          <button type="button" disabled={!models.length} onClick={async () => {
            try { await navigator.clipboard.writeText(models.join("\n"));setCopied(true);setError(""); } catch { setError("copy_failed"); }
          }} className={styles.copy}><span className="material-symbols-outlined" aria-hidden="true">{copied ? "check" : "content_copy"}</span>{copied ? t.copied : t.copy}</button>}
        </div>
        <div role="status" aria-live="polite" className="sr-only">{loading ? t.checking : copied ? t.copied : models !== null ? `${t.results}: ${models.length}` : t.ready}</div>
        {models?.length ? <>
          <div className={styles.columnLabel}>{t.modelId}</div>
          <ul className={styles.modelList}>{models.map((model) => <li key={model}><code>{model}</code></li>)}</ul>
        </> : <div className={styles.empty}>
          <span className="material-symbols-outlined" aria-hidden="true">{loading ? "hourglass_top" : "format_list_bulleted"}</span>
          <p>{loading ? t.checking : models !== null ? t.empty : t.ready}</p>
          {!loading && models === null && <p className={styles.hint}>{t.readyHint}</p>}
        </div>}
      </section>
      </div>
    </dialog>
  </>;
}
