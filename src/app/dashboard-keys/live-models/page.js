"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import KeyDashboardLayout from "../KeyDashboardLayout";
import AntaresButton from "@/shared/components/AntaresButton";
import AntaresModal from "@/shared/components/AntaresModal";
import AntaresNotice from "@/shared/components/AntaresNotice";
import AntaresPanel from "@/shared/components/AntaresPanel";
import AntaresSelect from "@/shared/components/AntaresSelect";
import StarField from "@/shared/components/StarField";
import { getCurrentLocale, onLocaleChange, translate } from "@/i18n/runtime";

const PAGE_SIZE = 12;
const SORT_OPTIONS = [
  { value: "name", label: "Model name (A–Z)" },
  { value: "latency", label: "Fastest first" },
  { value: "slowest", label: "Slowest first" },
];

export default function LiveModelsPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [page, setPage] = useState(1);
  const [copied, setCopied] = useState("");
  const [progress, setProgress] = useState(30);
  const [playgroundModel, setPlaygroundModel] = useState(null);
  const [playgroundPrompt, setPlaygroundPrompt] = useState("");
  const [playgroundAnswer, setPlaygroundAnswer] = useState("");
  const [playgroundError, setPlaygroundError] = useState("");
  const [playgroundLoading, setPlaygroundLoading] = useState(false);
  const [, setLocaleVersion] = useState(0);

  useEffect(() => onLocaleChange(() => setLocaleVersion((value) => value + 1)), []);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError("");
    // Probing many models takes a while. Start at 30% and creep forward so the
    // page never looks frozen while the requests are still in flight.
    setProgress(30);
    try {
      const response = await fetch("/api/public/live-models", { cache: "no-store", signal });
      const result = await response.json();
      if (response.status === 401) { router.replace("/login-key"); return; }
      if (!response.ok) throw new Error(result.error || translate("Could not check live models."));
      setData(result);
      setPage(1);
      setProviderFilter("");
      setQuery("");
    } catch (loadError) {
      if (loadError.name !== "AbortError") setError(loadError.message || translate("Could not check live models."));
    } finally {
      setProgress(100);
      // Let the full bar register for a moment before the results replace it.
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      setLoading(false);
    }
  }, [router]);

  // Every visit or reload re-probes the catalogue — no cache.
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Advance the progress estimate slowly while the probe is running. It never
  // reaches 100% on its own, so the real completion still sets the final value.
  useEffect(() => {
    if (!loading) return undefined;
    const timer = window.setInterval(() => {
      setProgress((value) => {
        if (value >= 96) return value;
        const step = value < 70 ? 3 : value < 88 ? 2 : 1;
        return Math.min(96, value + step);
      });
    }, 400);
    return () => window.clearInterval(timer);
  }, [loading]);

  const logout = async () => {
    await fetch("/api/public/key-dashboard", { method: "DELETE", cache: "no-store" }).catch(() => {});
    router.replace("/login-key");
  };

  const providerOptions = useMemo(() => [
    { value: "", label: translate("All providers") },
    ...(data?.providers || []).map((provider) => ({ value: provider.id, label: provider.name })),
  ], [data, setLocaleVersion]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const rows = (data?.live || []).filter((row) => {
      if (providerFilter && row.provider?.id !== providerFilter) return false;
      if (!needle) return true;
      return `${row.name} ${row.id} ${row.provider?.name || ""}`.toLocaleLowerCase().includes(needle);
    });
    return rows.sort((a, b) => {
      if (sortBy === "latency") return a.latencyMs - b.latencyMs;
      if (sortBy === "slowest") return b.latencyMs - a.latencyMs;
      return (a.name || a.id).localeCompare(b.name || b.id);
    });
  }, [data, query, providerFilter, sortBy]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const from = filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const resetPage = (setter) => (event) => { setter(event.target.value); setPage(1); };

  const copyId = async (id) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(id);
      window.setTimeout(() => setCopied(""), 1500);
    } catch {}
  };

  const openPlayground = (row) => {
    setPlaygroundModel(row);
    setPlaygroundPrompt("");
    setPlaygroundAnswer("");
    setPlaygroundError("");
    setPlaygroundLoading(false);
  };

  const closePlayground = () => {
    if (playgroundLoading) return;
    setPlaygroundModel(null);
  };

  const sendPlaygroundPrompt = async (event) => {
    event.preventDefault();
    const prompt = playgroundPrompt.trim();
    if (!playgroundModel || !prompt || playgroundLoading) return;
    setPlaygroundLoading(true);
    setPlaygroundError("");
    setPlaygroundAnswer("");
    try {
      const response = await fetch("/api/public/live-models/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ model: playgroundModel.id, prompt }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { router.replace("/login-key"); return; }
      if (!response.ok || !result.answer) throw new Error(result.error || translate("The model did not return an answer."));
      setPlaygroundAnswer(result.answer);
    } catch (playgroundFailure) {
      setPlaygroundError(playgroundFailure.message || translate("The model did not return an answer."));
    } finally {
      setPlaygroundLoading(false);
    }
  };

  const checkedLabel = data?.checkedAt
    ? new Date(data.checkedAt).toLocaleTimeString(getCurrentLocale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";

  const sortOptions = useMemo(
    () => SORT_OPTIONS.map((option) => ({ value: option.value, label: translate(option.label) })),
    [setLocaleVersion],
  );

  return (
    <KeyDashboardLayout onLogout={logout}>
      <div className="an-scope an-shell key-dashboard-page">
        <div className="an-shell-bg" aria-hidden="true"><StarField /></div>
        <div className="key-dashboard-main">
          <header className="key-dashboard-title-row">
            <div className="key-dashboard-title-copy">
              <p className="an-eyebrow"><span className="an-num">03</span><span className="an-rule" /><span>{translate("Live model catalogue")}</span></p>
              <h1 className="an-h1">{translate("Live Models")}</h1>
              <p className="an-hint key-dashboard-intro">{translate("Every visit probes the catalogue with a prompt. Only models that respond are shown.")}</p>
            </div>
            <AntaresButton type="button" variant="secondary" icon="refresh" loading={loading} onClick={() => load()}>
              {loading ? `${translate("Checking models")} ${progress}%` : translate("Re-check models")}
            </AntaresButton>
          </header>

          {loading && (
            <section className="live-models-progress" role="status" aria-live="polite">
              <div className="lm-progress-head">
                <span className="lm-progress-label">
                  <span className="material-symbols-outlined animate-spin" aria-hidden="true">progress_activity</span>
                  {translate("Probing models...")}
                </span>
                <strong className="lm-progress-value">{progress}%</strong>
              </div>
              <div
                className="lm-progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-label={translate("Probe progress")}
              >
                <span className="lm-progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </section>
          )}

          {error && (
            <AntaresNotice variant="danger" icon="error" className="key-dashboard-error">
              <p>{error}</p>
            </AntaresNotice>
          )}

          {data && (
            <>
              <section className="live-models-summary" aria-label={translate("Probe summary")}>
                <div className="live-models-tile ok"><span>{translate("Live")}</span><strong>{data.live.length}</strong></div>
                <div className="live-models-tile"><span>{translate("Checked")}</span><strong>{data.total}</strong></div>
                <div className="live-models-tile"><span>{translate("No response")}</span><strong>{data.failed}</strong></div>
                <div className="live-models-tile"><span>{translate("Checked at")}</span><strong className="live-models-time">{checkedLabel}</strong></div>
              </section>

              <section className="live-models-filter-card" aria-label={translate("Model filters")}>
                <div className="live-models-filter-head">
                  <span className="material-symbols-outlined" aria-hidden="true">tune</span>
                  <h2>{translate("Model filters")}</h2>
                </div>
                <div className="live-models-filter-grid">
                  <label className="lm-field lm-field-search">
                    <span className="lm-field-label">{translate("Search live models")}</span>
                    <span className="material-symbols-outlined lm-search-icon" aria-hidden="true">search</span>
                    <input
                      type="search"
                      value={query}
                      onChange={resetPage(setQuery)}
                      placeholder={translate("Search by name or ID...")}
                      aria-label={translate("Search live models")}
                      className="lm-search-input"
                    />
                  </label>
                  <label className="lm-field">
                    <span className="lm-field-label">{translate("Provider")}</span>
                    <AntaresSelect
                      value={providerFilter}
                      onChange={resetPage(setProviderFilter)}
                      ariaLabel={translate("Provider")}
                      options={providerOptions}
                      placeholder={translate("All providers")}
                      portal
                      maxVisible={5}
                      buttonClassName="h-[42px] w-full px-3 text-sm"
                    />
                  </label>
                  <label className="lm-field">
                    <span className="lm-field-label">{translate("Sort models")}</span>
                    <AntaresSelect
                      value={sortBy}
                      onChange={resetPage(setSortBy)}
                      ariaLabel={translate("Sort models")}
                      options={sortOptions}
                      buttonClassName="h-[42px] w-full px-3 text-sm"
                    />
                  </label>
                </div>
              </section>

              <p className="live-models-count" aria-live="polite">
                {translate("Showing {from}–{to} of {total} live models")
                  .replace("{from}", String(from))
                  .replace("{to}", String(to))
                  .replace("{total}", String(filtered.length))}
              </p>

              {filtered.length ? (
                <div className="live-models-grid">
                  {visible.map((row) => (
                    <article key={row.id} className="live-models-card">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="live-models-ico" aria-hidden><span className="material-symbols-outlined">bolt</span></span>
                        <div className="min-w-0 flex-1">
                          <h2 className="break-words text-sm font-medium leading-snug text-[var(--t-ink)]">{row.name || row.id}</h2>
                          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--t-muted)]">
                            <span className="live-models-provider-name">{row.provider?.name || translate("Gateway")}</span>
                            <span aria-hidden="true">·</span>
                            <span className="truncate font-mono">{row.id}</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyId(row.id)}
                          className="an-conn-btn shrink-0"
                          aria-label={copied === row.id ? translate("Copied") : translate("Copy model ID")}
                          title={copied === row.id ? translate("Copied") : translate("Copy model ID")}
                        >
                          <span className="material-symbols-outlined">{copied === row.id ? "check" : "content_copy"}</span>
                        </button>
                      </div>
                      <div className="live-models-card-foot">
                        <span className="an-chip ok"><span className="material-symbols-outlined">check_circle</span>{translate("Responded")}</span>
                        <div className="live-models-card-actions">
                          <span className="font-mono text-[11px] text-[var(--t-muted)]">{row.latencyMs} ms</span>
                          <button
                            type="button"
                            onClick={() => openPlayground(row)}
                            className="lm-playground-btn"
                            aria-label={`${translate("Playground")}: ${row.name || row.id}`}
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">play_arrow</span>
                            {translate("Playground")}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <AntaresPanel icon="cloud_off" title={translate("No live models")} subtitle={translate("No model matched the current filters.")} />
              )}

              {pages > 1 && (
                <nav className="live-models-pagination" aria-label={translate("Live models pages")}>
                  <AntaresButton type="button" variant="ghost" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>{translate("Previous")}</AntaresButton>
                  <span className="font-mono text-[11px] text-[var(--t-muted)]">{currentPage} / {pages}</span>
                  <AntaresButton type="button" variant="ghost" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>{translate("Next")}</AntaresButton>
                </nav>
              )}
            </>
          )}
        </div>

        <AntaresModal
          isOpen={Boolean(playgroundModel)}
          onClose={closePlayground}
          title={playgroundModel ? (playgroundModel.name || playgroundModel.id) : ""}
          subtitle={playgroundModel ? playgroundModel.id : ""}
          size="lg"
        >
          <form className="lm-playground-form" onSubmit={sendPlaygroundPrompt}>
            <label className="lm-field" htmlFor="lm-playground-prompt">
              <span className="lm-field-label">{translate("Prompt")}</span>
              <textarea
                id="lm-playground-prompt"
                className="lm-playground-input"
                value={playgroundPrompt}
                onChange={(event) => setPlaygroundPrompt(event.target.value)}
                placeholder={translate("Ask this model anything...")}
                rows={4}
                maxLength={8000}
                autoFocus
              />
            </label>
            <div className="lm-playground-actions">
              <span className="lm-playground-count">{playgroundPrompt.length} / 8000</span>
              <AntaresButton
                type="submit"
                icon="send"
                loading={playgroundLoading}
                disabled={!playgroundPrompt.trim()}
              >
                {playgroundLoading ? translate("Waiting for the model...") : translate("Send prompt")}
              </AntaresButton>
            </div>

            {(playgroundLoading || playgroundAnswer || playgroundError) && (
              <div className="lm-playground-response" aria-live="polite">
                <span className="lm-playground-response-head">{translate("Response")}</span>
                {playgroundLoading ? (
                  <p className="lm-playground-pending">{translate("Waiting for the model...")}</p>
                ) : playgroundError ? (
                  <p className="lm-playground-error">{playgroundError}</p>
                ) : (
                  <p className="lm-playground-answer">{playgroundAnswer}</p>
                )}
              </div>
            )}
          </form>
        </AntaresModal>
      </div>
    </KeyDashboardLayout>
  );
}
