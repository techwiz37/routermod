"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { RequestLogger, CardSkeleton } from "@/shared/components";
import AntaresSegmented from "@/shared/components/AntaresSegmented";
import StarField from "@/shared/components/StarField";
import UsageStats from "@/shared/components/UsageStats";
import RequestDetailsTab from "./components/RequestDetailsTab";
import LiveServerTab from "./components/LiveServerTab";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
  { value: "all", label: "All" },
];

const TABS = [
  { value: "overview", label: "Ringkasan", icon: "space_dashboard" },
  { value: "details", label: "Detail", icon: "list_alt" },
  { value: "live", label: "Live Server", icon: "monitor_heart" },
];

export default function UsagePage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <UsageContent />
    </Suspense>
  );
}

function UsageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [period, setPeriod] = useState("today");

  const tabFromUrl = searchParams.get("tab");
  const activeTab = tabFromUrl && ["overview", "details", "live", "logs"].includes(tabFromUrl)
    ? tabFromUrl
    : "overview";

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="an-scope an-shell flex flex-col gap-5 sm:gap-6">
      <div className="an-shell-bg" aria-hidden>
        <StarField />
      </div>

      {/* ---- Hero ---- */}
      <header className="flex min-w-0 flex-col gap-2">
        <p className="an-eyebrow">
          <span className="an-num">02</span>
          <span className="an-rule" />
          <span>RouterMod · Analytics</span>
        </p>
        <h1 className="an-h1 text-[clamp(1.6rem,4.6vw,2.3rem)]">
          Usage <span className="an-dim mx-2">Analytics</span>
        </h1>
        <p className="an-hint max-w-[70ch]">
          Pantau konsumsi token, estimasi biaya, dan kesehatan provider dalam satu ruang kendali real-time.
        </p>
      </header>

      {/* Navigation toolbar */}
      <div className="us-toolbar">
        <AntaresSegmented
          options={TABS}
          value={activeTab}
          onChange={handleTabChange}
          className="us-tabs"
        />
        {activeTab === "overview" ? (
          <div className="us-toolbar-right">
            <span className="us-period-label">Rentang waktu</span>
            <AntaresSegmented
              options={PERIODS}
              value={period}
              onChange={setPeriod}
              size="sm"
            />
          </div>
        ) : (
          <span className="us-toolbar-hint">
            <span className="material-symbols-outlined" aria-hidden="true">schedule</span>
            Data diperbarui otomatis
          </span>
        )}
      </div>

      {/* Content - Lazy loaded per tab */}
      {activeTab === "overview" && (
        <Suspense fallback={<CardSkeleton />}>
          <UsageStats period={period} setPeriod={setPeriod} hidePeriodSelector />
        </Suspense>
      )}
      {activeTab === "details" && (
        <Suspense fallback={<CardSkeleton />}>
          <RequestDetailsTab />
        </Suspense>
      )}
      {activeTab === "live" && (
        <Suspense fallback={<CardSkeleton />}>
          <LiveServerTab />
        </Suspense>
      )}
      {activeTab === "logs" && (
        <Suspense fallback={<CardSkeleton />}>
          <RequestLogger />
        </Suspense>
      )}
    </div>
  );
}
