"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PropTypes from "prop-types";
import KeyDashboardLayout from "../KeyDashboardLayout";
import AntaresButton from "@/shared/components/AntaresButton";
import StarField from "@/shared/components/StarField";
import { PagePendingMarker, usePageReady } from "@/shared/components/PageReadyContext";
import { onLocaleChange, translate } from "@/i18n/runtime";
import { formatCompact, formatFull } from "@/shared/utils/compactNumber";

function RankRow({ rank, title, subtitle, requests, tokens, metricLabel }) {
  return (
    <li className="flex items-center gap-3 border-t border-[var(--t-line-soft)] py-3 first:border-t-0 first:pt-1">
      <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--t-dim)]">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[12px] font-semibold leading-relaxed text-[var(--t-ink)]" title={title}>
          {title}
        </p>
        <p className="truncate font-mono text-[10.5px] leading-relaxed text-[var(--t-muted)]" title={subtitle}>
          {subtitle}
        </p>
      </div>
      <div className="shrink-0 text-right font-mono text-[11px] tabular-nums leading-relaxed">
        <p className="text-[var(--t-ink)]" title={`${formatFull(requests)} ${metricLabel}`}>
          {formatCompact(requests)}
        </p>
        <p className="text-[var(--t-muted)]" title={`${formatFull(tokens)} ${translate("tokens")}`}>
          {formatCompact(tokens)} {translate("tokens")}
        </p>
      </div>
    </li>
  );
}

RankRow.propTypes = {
  rank: PropTypes.number.isRequired,
  title: PropTypes.string,
  subtitle: PropTypes.string,
  requests: PropTypes.number,
  tokens: PropTypes.number,
  metricLabel: PropTypes.string,
};

export default function TopModelsKeysPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [, setLocaleVersion] = useState(0);

  usePageReady(loading);

  useEffect(() => onLocaleChange(() => setLocaleVersion((value) => value + 1)), []);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/public/top-usage", { cache: "no-store", signal });
      const result = await response.json();
      if (response.status === 401) {
        router.replace("/login-key");
        return;
      }
      if (!response.ok) throw new Error(result.error || translate("Could not load leaderboard."));
      setData(result);
    } catch (loadError) {
      if (loadError.name !== "AbortError") setError(loadError.message || translate("Could not load leaderboard."));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const logout = async () => {
    await fetch("/api/public/key-dashboard", { method: "DELETE", cache: "no-store" }).catch(() => {});
    router.replace("/login-key");
  };

  const models = data?.models || [];
  const keys = data?.keys || [];
  const totals = data?.totals || { requests: 0, tokens: 0 };

  return (
    <KeyDashboardLayout onLogout={logout}>
      <div className="an-scope an-shell key-dashboard-page top-models-keys-page">
        <div className="an-shell-bg" aria-hidden="true"><StarField /></div>
        <PagePendingMarker active={loading && !data} />
        <div className="key-dashboard-main">
          <section className="key-dashboard-title-row" aria-labelledby="top-models-keys-title">
            <div className="key-dashboard-title-copy">
              <p className="an-eyebrow">
                <span className="an-num">06</span>
                <span className="an-rule" />
                <span>{translate("Leaderboard")}</span>
              </p>
              <h1 id="top-models-keys-title" className="an-h1">
                {translate("Top Models")} <span className="an-dim">&amp; {translate("Keys")}</span>
              </h1>
              <p className="an-hint key-dashboard-intro">
                {translate("Most used models and keys across the router.")}
              </p>
              <p className="key-dashboard-key-name">
                {translate("All time")} · {formatCompact(totals.requests)} {translate("requests")} · {formatCompact(totals.tokens)} {translate("tokens")}
              </p>
            </div>
          </section>

          {error && (
            <section role="alert" className="an-panel key-dashboard-error">
              <div className="key-dashboard-error-copy">
                <p className="key-dashboard-error-title">{translate("Failed to load statistics")}</p>
                <p className="key-dashboard-error-message">{error}</p>
              </div>
              <AntaresButton type="button" variant="ghost" onClick={() => load()} className="key-dashboard-retry">
                {translate("Retry")}
              </AntaresButton>
            </section>
          )}

          {data && (
            <div className="key-dashboard-content" aria-busy={loading}>
              <section className="key-dashboard-details" style={{ marginTop: 0 }} aria-label={translate("Top Models & Keys")}>
                <div className="an-panel key-dashboard-analytics-panel">
                  <header className="an-panel-head">
                    <span className="an-panel-ico" aria-hidden>
                      <span className="material-symbols-outlined">model_training</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="an-panel-title">{translate("Most used models")}</h2>
                      <p className="an-panel-sub">{translate("Top 10 models by total requests.")}</p>
                    </div>
                  </header>
                  <div className="an-panel-pad">
                    {models.length ? (
                      <ol className="key-dashboard-list">
                        {models.map((model, index) => (
                          <RankRow
                            key={`${model.model}-${index}`}
                            rank={index + 1}
                            title={model.model}
                            subtitle={`${formatCompact(model.requests)} ${translate("requests")} · ${formatCompact(model.tokens)} ${translate("tokens")}`}
                            requests={model.requests}
                            tokens={model.tokens}
                            metricLabel={translate("requests")}
                          />
                        ))}
                      </ol>
                    ) : (
                      <p className="key-dashboard-panel-empty">{translate("No model usage recorded yet.")}</p>
                    )}
                  </div>
                </div>

                <div className="an-panel key-dashboard-analytics-panel">
                  <header className="an-panel-head">
                    <span className="an-panel-ico" aria-hidden>
                      <span className="material-symbols-outlined">key</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="an-panel-title">{translate("Most used keys")}</h2>
                      <p className="an-panel-sub">{translate("Top 10 keys by total requests, excluding the admin key.")}</p>
                    </div>
                  </header>
                  <div className="an-panel-pad">
                    {keys.length ? (
                      <ol className="key-dashboard-list">
                        {keys.map((key, index) => (
                          <RankRow
                            key={`${key.masked}-${index}`}
                            rank={index + 1}
                            title={key.name || key.masked || translate("Unknown key")}
                            subtitle={key.name ? key.masked : translate("Key")}
                            requests={key.requests}
                            tokens={key.tokens}
                            metricLabel={translate("requests")}
                          />
                        ))}
                      </ol>
                    ) : (
                      <p className="key-dashboard-panel-empty">{translate("No key usage recorded yet.")}</p>
                    )}
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </KeyDashboardLayout>
  );
}
