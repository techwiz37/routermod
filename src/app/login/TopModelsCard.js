"use client";

import { useState, useEffect } from "react";
import { getLoginTopModels, loadLoginTopModels } from "./loginStats";

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export default function TopModelsCard({ locale = "en" }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const i18n = {
    id: {
      title: "Top 10 Model Terpakai",
      subtitle: "Request sukses · 30 hari terakhir",
      model: "Model",
      requests: "Request",
      tokens: "Token",
      loading: "Memuat data...",
      error: "Gagal memuat data",
      noData: "Tidak ada data pemakaian",
      formatNumber: (num) => new Intl.NumberFormat("id-ID").format(num),
    },
    en: {
      title: "Top 10 Models",
      subtitle: "Successful requests · Last 30 days",
      model: "Model",
      requests: "Requests",
      tokens: "Tokens",
      loading: "Loading data...",
      error: "Failed to load data",
      noData: "No usage data available",
      formatNumber: (num) => new Intl.NumberFormat("en-US").format(num),
    },
  };

  const t = i18n[locale] || i18n.en;

  useEffect(() => {
    let alive = true;
    const fetchTopModels = async (usePrefetch = false) => {
      try {
        // Reuse the prefetched response for the first paint.
        const data = (usePrefetch && getLoginTopModels())
          ? await getLoginTopModels()
          : await loadLoginTopModels();
        if (!Array.isArray(data?.data)) throw new Error("Invalid usage response");
        if (alive) {
          setModels(data.data);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    };

    fetchTopModels(true);
    const interval = setInterval(() => fetchTopModels(false), 30000); // Refresh every 30s
    return () => { alive = false; clearInterval(interval); };
  }, []);

  return (
    <div className="an-card lf-top-models-card">
      <div className="an-card-head">
        <div className="flex items-center gap-3">
          <span className="an-ic">
            <span className="material-symbols-outlined">trending_up</span>
          </span>
          <div>
            <h3 className="an-card-title">{t.title}</h3>
            <p className="an-card-subtitle">{t.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="lf-models-body">
        {loading ? (
          <div className="lf-loading-state">
            <span className="material-symbols-outlined lf-spin">
              autorenew
            </span>
            {t.loading}
          </div>
        ) : failed && models.length === 0 ? (
          <div className="lf-empty-state" role="status">{t.error}</div>
        ) : models.length === 0 ? (
          <div className="lf-empty-state">{t.noData}</div>
        ) : (
          <div className="lf-models-table">
            <div className="lf-table-header">
              <div className="lf-col-model">{t.model}</div>
              <div className="lf-col-requests">{t.requests}</div>
              <div className="lf-col-tokens">{t.tokens}</div>
            </div>
            <div className="lf-table-body">
              {models.map((model, idx) => (
                <div key={`${model.model}-${idx}`} className="lf-table-row">
                  <div className="lf-col-model">
                    <span className="lf-rank">{idx + 1}</span>
                    <span className="lf-model-name" title={model.model}>
                      {model.model}
                    </span>
                  </div>
                  <div className="lf-col-requests" title={t.formatNumber(model.totalRequests || 0)} aria-label={`${t.formatNumber(model.totalRequests || 0)} ${t.requests}`}>
                    {compactNumber.format(model.totalRequests || 0)}
                  </div>
                  <div className="lf-col-tokens" title={t.formatNumber(model.totalTokens || 0)} aria-label={`${t.formatNumber(model.totalTokens || 0)} ${t.tokens}`}>
                    {compactNumber.format(model.totalTokens || 0)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
