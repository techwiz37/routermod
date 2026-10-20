"use client";

import { useState, useEffect } from "react";
import { CardSkeleton } from "@/shared/components";
import { CLI_TOOLS, MITM_TOOLS } from "@/shared/constants/cliTools";
import { MitmLinkCard } from "./components";
import ToolSummaryCard from "./components/ToolSummaryCard";

const ALL_STATUSES_URL = "/api/cli-tools/all-statuses";

export default function CLIToolsPageClient({ machineId }) {
  const [loading, setLoading] = useState(true);
  const [toolStatuses, setToolStatuses] = useState({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(ALL_STATUSES_URL);
        if (res.ok && mounted) setToolStatuses(await res.json());
      } catch (error) {
        console.log("Error fetching tool statuses:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="an-scope flex min-w-0 flex-col gap-5">
        <div className="an-panel h-[150px] animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  const regularTools = Object.entries(CLI_TOOLS);
  const mitmTools = Object.entries(MITM_TOOLS);

  const installed = regularTools.filter(([, tool]) => toolStatuses[tool.id]?.installed);
  const connected = regularTools.filter(([, tool]) => toolStatuses[tool.id]?.has9Router);
  const guides = regularTools.filter(([, tool]) => tool.configType === "guide");

  return (
    <div className="an-scope flex min-w-0 flex-col gap-5">
      {/* Hero */}
      <section className="an-panel an-hero">
        <div className="an-hero-main">
          <span className="an-hero-eyebrow">Tool CLI</span>
          <h1 className="an-hero-title">Semua Tool CLI di Satu Tempat</h1>
          <p className="an-hero-sub">
            Pasang tool CLI favoritmu, sambungkan ke RouterMod, lalu pantau status
            koneksinya langsung dari sini.
          </p>
        </div>
        <div className="an-hero-stats">
          <div className="an-stat">
            <span className="an-stat-label">
              <span className="material-symbols-outlined">terminal</span>
              Tool CLI
            </span>
            <span className="an-stat-value">{regularTools.length}</span>
            <span className="an-stat-foot">tool yang didukung</span>
          </div>
          <div className="an-stat">
            <span className="an-stat-label">
              <span className="material-symbols-outlined">download</span>
              Terpasang
            </span>
            <span className="an-stat-value">{installed.length}</span>
            <span className="an-stat-foot">sudah ada di mesin ini</span>
          </div>
          <div className="an-stat">
            <span className="an-stat-label">
              <span className="material-symbols-outlined">bolt</span>
              Terhubung
            </span>
            <span className="an-stat-value">{connected.length}</span>
            <span className="an-stat-foot">sudah pakai RouterMod</span>
          </div>
          <div className="an-stat">
            <span className="an-stat-label">
              <span className="material-symbols-outlined">menu_book</span>
              Panduan
            </span>
            <span className="an-stat-value">{guides.length}</span>
            <span className="an-stat-foot">dokumentasi singkat</span>
          </div>
        </div>
      </section>

      {/* Tool grid */}
      <section className="an-panel">
        <header className="an-panel-head">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">terminal</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="an-panel-title">Tool CLI</h2>
            <p className="an-panel-sub">
              <span>{regularTools.length}</span>{" "}
              <span>tool yang bisa/setup langsung</span>
            </p>
          </div>
        </header>
        <div className="an-panel-pad">
          <div className="an-grid-providers !gap-2.5">
            {regularTools.map(([toolId, tool]) => (
              <ToolSummaryCard
                key={toolId}
                toolId={toolId}
                tool={tool}
                status={toolStatuses[toolId]}
              />
            ))}
          </div>
        </div>
      </section>

      {/* MITM tools */}
      <section className="an-panel">
        <header className="an-panel-head">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">security</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="an-panel-title">MITM Tools</h2>
            <p className="an-panel-sub">
              <span>{mitmTools.length}</span>{" "}
              <span>tool denganproxy MITM</span>
            </p>
          </div>
        </header>
        <div className="an-panel-pad">
          <div className="an-grid-providers !gap-2.5">
            {mitmTools.map(([toolId, tool]) => (
              <MitmLinkCard key={toolId} tool={tool} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
