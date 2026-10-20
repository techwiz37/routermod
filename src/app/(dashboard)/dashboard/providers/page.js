"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import PropTypes from "prop-types";
import {
  Card,
  CardSkeleton,
  Button,
} from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { getProviderIconSrc } from "@/shared/utils/providerIcon";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import {
  FREE_PROVIDERS,
  FREE_TIER_PROVIDERS,
  WEB_COOKIE_PROVIDERS,
  OPENAI_COMPATIBLE_PREFIX,
  ANTHROPIC_COMPATIBLE_PREFIX,
} from "@/shared/constants/providers";
import Link from "next/link";
import { getErrorCode, getRelativeTime } from "@/shared/utils";
import { useNotificationStore } from "@/store/notificationStore";
import { onLocaleChange, translate } from "@/i18n/runtime";
import ModelAvailabilityBadge from "./components/ModelAvailabilityBadge";
import AddCompatibleModal from "./components/AddCompatibleModal";
import { STATUS_FILTER_OPTIONS, matchesStatusFilter } from "./utils";

// Items rendered per page for every provider list on this page.
const PAGE_SIZE = 5;

/** Slice `items` into the requested page and describe the pagination state. */
function paginate(items, page, size = PAGE_SIZE) {
  const list = items || [];
  const pageCount = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(1, page || 1), pageCount);
  const start = (current - 1) * size;
  return {
    page: current,
    pageCount,
    total: list.length,
    items: list.slice(start, start + size),
  };
}

/** Compact page-number list with ellipsis for long ranges. */
function pageNumbers(page, pageCount) {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const pages = new Set([1, pageCount, page]);
  if (page <= 3) [2, 3, 4].forEach((n) => pages.add(n));
  if (page >= pageCount - 2)
    [pageCount - 3, pageCount - 2, pageCount - 1].forEach((n) => pages.add(n));
  const sorted = [...pages].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push("gap");
    out.push(n);
    prev = n;
  }
  return out;
}

function AntaresPagination({ page, pageCount, total, onChange, label = "providers" }) {
  if (!total || pageCount <= 1) return null;

  return (
    <nav className="an-pagination" aria-label="Pagination">
      <button
        type="button"
        className="an-page-btn"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label={translate("Previous page")}
        title={translate("Previous page")}
      >
        <span className="material-symbols-outlined">chevron_left</span>
      </button>

      {pageNumbers(page, pageCount).map((n, i) =>
        n === "gap" ? (
          <span key={`gap-${i}`} className="an-page-gap">
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            className={`an-page-btn ${n === page ? "active" : ""}`}
            aria-current={n === page ? "page" : undefined}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        )
      )}

      <button
        type="button"
        className="an-page-btn"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        aria-label={translate("Next page")}
        title={translate("Next page")}
      >
        <span className="material-symbols-outlined">chevron_right</span>
      </button>

      <span className="an-page-info">
        <span>{page}</span>
        <span>/</span>
        <span>{pageCount}</span>
        <span>·</span>
        <span>{total}</span>
        <span>{label}</span>
      </span>
    </nav>
  );
}

AntaresPagination.propTypes = {
  page: PropTypes.number.isRequired,
  pageCount: PropTypes.number.isRequired,
  total: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string,
};

// Subtitle kartu: domain resmi provider bila ada, else jenis autentikasinya.
function providerSubtitle(provider, fallback) {
  const site = provider?.website || provider?.websiteUrl;
  if (site) {
    try {
      return new URL(site).hostname.replace(/^www\./, "");
    } catch {}
  }
  return fallback;
}

function getStatusDisplay(connected, error, errorCode) {
  const parts = [];
  if (connected > 0) {
    parts.push(
      <span key="connected" className="an-chip ok">
        <span className="size-1.5 rounded-full bg-[var(--t-ok)] animate-pulse shrink-0" />
        <span>{connected}</span>
        <span>Connected</span>
      </span>,
    );
  }
  if (error > 0) {
    parts.push(
      <span key="error" className="an-chip danger">
        <span className="size-1.5 rounded-full bg-[var(--t-danger)] shrink-0" />
        <span>{error}</span>
        <span>Error</span>
        {errorCode && <span>({errorCode})</span>}
      </span>,
    );
  }
  if (parts.length === 0) {
    return <span className="an-chip">No connections</span>;
  }
  return parts;
}

function getConnectionErrorTag(connection) {
  if (!connection) return null;

  const explicitType = connection.lastErrorType;
  if (explicitType === "runtime_error") return "RUNTIME";
  if (
    explicitType === "upstream_auth_error" ||
    explicitType === "auth_missing" ||
    explicitType === "token_refresh_failed" ||
    explicitType === "token_expired"
  )
    return "AUTH";
  if (explicitType === "upstream_rate_limited") return "429";
  if (explicitType === "upstream_unavailable") return "5XX";
  if (explicitType === "network_error") return "NET";

  const numericCode = Number(connection.errorCode);
  if (Number.isFinite(numericCode) && numericCode >= 400)
    return String(numericCode);

  const fromMessage = getErrorCode(connection.lastError);
  if (fromMessage === "401" || fromMessage === "403") return "AUTH";
  if (fromMessage && fromMessage !== "ERR") return fromMessage;

  const msg = (connection.lastError || "").toLowerCase();
  if (
    msg.includes("runtime") ||
    msg.includes("not runnable") ||
    msg.includes("not installed")
  )
    return "RUNTIME";
  if (
    msg.includes("invalid api key") ||
    msg.includes("token invalid") ||
    msg.includes("revoked") ||
    msg.includes("unauthorized")
  )
    return "AUTH";

  return "ERR";
}


export default function ProvidersPage() {
  const [connections, setConnections] = useState([]);
  const [providerNodes, setProviderNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddCompatibleModal, setShowAddCompatibleModal] = useState(false);
  const [showAddAnthropicCompatibleModal, setShowAddAnthropicCompatibleModal] =
    useState(false);
  const [testingMode, setTestingMode] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  // Pagination — one page cursor per provider list.
  const [activePage, setActivePage] = useState(1);
  const [customPage, setCustomPage] = useState(1);
  const [oauthPage, setOauthPage] = useState(1);
  const [freePage, setFreePage] = useState(1);
  const [apikeyPage, setApikeyPage] = useState(1);
  const notify = useNotificationStore();

  // Re-render when the UI locale changes so translated attributes (placeholder,
  // aria-label) stay in sync with the text nodes handled by the runtime i18n.
  const [, bumpLocale] = useState(0);
  useEffect(
    () => onLocaleChange(() => bumpLocale((n) => n + 1)),
    []
  );

  // A new search or status filter invalidates every page cursor.
  useEffect(() => {
    setActivePage(1);
    setCustomPage(1);
    setOauthPage(1);
    setFreePage(1);
    setApikeyPage(1);
  }, [searchQuery, statusFilter]);

  const matchSearch = (name) => {
    if (!searchQuery.trim()) return true;
    if (!name) return false;
    return name.toLowerCase().includes(searchQuery.trim().toLowerCase());
  };

  const sortByPriority = (entries, authType) =>
    [...entries].sort(([ka, a], [kb, b]) => {
      const pa = a.priority ?? 999;
      const pb = b.priority ?? 999;
      if (pa !== pb) return pa - pb;
      const sa = getProviderStats(ka, authType);
      const sb = getProviderStats(kb, authType);
      const ca = sa.connected > 0 ? 1 : 0;
      const cb = sb.connected > 0 ? 1 : 0;
      if (ca !== cb) return cb - ca;
      return (a.name || "").localeCompare(b.name || "");
    });

  const sortItemsByPriority = (items, authType) =>
    [...items].sort((a, b) => {
      const pa = a.priority ?? 999;
      const pb = b.priority ?? 999;
      if (pa !== pb) return pa - pb;
      const sa = getProviderStats(a.id, authType);
      const sb = getProviderStats(b.id, authType);
      const ca = sa.connected > 0 ? 1 : 0;
      const cb = sb.connected > 0 ? 1 : 0;
      if (ca !== cb) return cb - ca;
      return (a.name || "").localeCompare(b.name || "");
    });

  const fetchData = useCallback(async (silent = false) => {
    try {
      const [connectionsRes, nodesRes] = await Promise.all([
        fetch("/api/providers", { cache: "no-store" }),
        fetch("/api/provider-nodes", { cache: "no-store" }),
      ]);
      const connectionsData = await connectionsRes.json();
      const nodesData = await nodesRes.json();
      if (connectionsRes.ok)
        setConnections(connectionsData.connections || []);
      if (nodesRes.ok) setProviderNodes(nodesData.nodes || []);
    } catch (error) {
      if (!silent) console.log("Error fetching data:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(false);

    const onRefresh = () => {
      fetchData(true);
    };

    const handleStorage = (e) => {
      if (e.key === "routermod:providers-changed") {
        fetchData(true);
      }
    };

    window.addEventListener("focus", onRefresh);
    document.addEventListener("visibilitychange", onRefresh);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("routermod:providers-changed", onRefresh);

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchData(true);
      }
    }, 3000);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener("visibilitychange", onRefresh);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("routermod:providers-changed", onRefresh);
    };
  }, [fetchData]);

  const getProviderStats = (providerId, authType) => {
    const authTypes = Array.isArray(authType) ? authType : [authType];
    const providerConnections = connections.filter(
      (c) => c.provider === providerId && authTypes.includes(c.authType),
    );

    const getEffectiveStatus = (conn) => {
      const isCooldown = Object.entries(conn).some(
        ([k, v]) =>
          k.startsWith("modelLock_") && v && new Date(v).getTime() > Date.now(),
      );
      return conn.testStatus === "unavailable" && !isCooldown
        ? "active"
        : conn.testStatus;
    };

    const connected = providerConnections.filter((c) => {
      const status = getEffectiveStatus(c);
      return status === "active" || status === "success";
    }).length;

    const errorConns = providerConnections.filter((c) => {
      const status = getEffectiveStatus(c);
      return (
        status === "error" || status === "expired" || status === "unavailable"
      );
    });

    const error = errorConns.length;
    const total = providerConnections.length;
    // Accounts that are currently switched on (isActive !== false).
    const enabled = providerConnections.filter((c) => c.isActive !== false).length;
    const allDisabled =
      total > 0 && providerConnections.every((c) => c.isActive === false);

    const latestError = errorConns.sort(
      (a, b) => new Date(b.lastErrorAt || 0) - new Date(a.lastErrorAt || 0),
    )[0];
    const errorCode = latestError ? getConnectionErrorTag(latestError) : null;
    const errorTime = latestError?.lastErrorAt
      ? getRelativeTime(latestError.lastErrorAt)
      : null;

    return { connected, error, total, errorCode, errorTime, allDisabled, enabled };
  };

  const matchStatus = (stats, isNoAuth) =>
    matchesStatusFilter(statusFilter, stats, isNoAuth);

  const handleToggleProvider = async (providerId, authType, newActive) => {
    const authTypes = Array.isArray(authType) ? authType : [authType];
    const matches = (c) =>
      c.provider === providerId && authTypes.includes(c.authType);
    const providerConns = connections.filter(matches);
    setConnections((prev) =>
      prev.map((c) => (matches(c) ? { ...c, isActive: newActive } : c)),
    );
    await Promise.allSettled(
      providerConns.map((c) =>
        fetch(`/api/providers/${c.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: newActive }),
        }),
      ),
    );
  };

  const handleBatchTest = async (mode, providerId = null) => {
    if (testingMode) return;
    setTestingMode(mode === "provider" ? providerId : mode);
    setTestResults(null);
    try {
      const res = await fetch("/api/providers/test-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, providerId }),
      });
      const data = await res.json();
      setTestResults(data);
      if (data.summary) {
        const { passed, failed, total } = data.summary;
        if (failed === 0) notify.success(`All ${total} tests passed`);
        else notify.warning(`${passed}/${total} passed, ${failed} failed`);
      }
    } catch (error) {
      setTestResults({ error: "Test request failed" });
      notify.error("Provider test failed");
    } finally {
      setTestingMode(null);
    }
  };

  const knownNodeIds = new Set(providerNodes.map((node) => node.id));
  const dynamicCustomProviders = [];
  const seenDynamic = new Set();
  for (const c of connections) {
    const pid = c.provider;
    if (!pid) continue;
    if (
      !knownNodeIds.has(pid) &&
      !OAUTH_PROVIDERS[pid] &&
      !FREE_PROVIDERS[pid] &&
      !FREE_TIER_PROVIDERS[pid] &&
      !APIKEY_PROVIDERS[pid]
    ) {
      if (!seenDynamic.has(pid)) {
        seenDynamic.add(pid);
        dynamicCustomProviders.push({
          id: pid,
          name: c.providerSpecificData?.nodeName || pid,
          color: "#10A37F",
          textIcon: (pid.slice(0, 2) || "CP").toUpperCase(),
          apiType: c.providerSpecificData?.apiType || "chat",
        });
      }
    }
  }

  const compatibleProviders = [
    ...providerNodes
      .filter((node) => node.type === "openai-compatible")
      .map((node) => ({
        id: node.id,
        name: node.name || "OpenAI Compatible",
        color: "#10A37F",
        textIcon: "OC",
        apiType: node.apiType,
      })),
    ...dynamicCustomProviders,
  ].filter(
    (p) => matchSearch(p.name) && matchStatus(getProviderStats(p.id, "apikey")),
  );

  const anthropicCompatibleProviders = providerNodes
    .filter((node) => node.type === "anthropic-compatible")
    .map((node) => ({
      id: node.id,
      name: node.name || "Anthropic Compatible",
      color: "#D97757",
      textIcon: "AC",
    }))
    .filter(
      (p) => matchSearch(p.name) && matchStatus(getProviderStats(p.id, "apikey")),
    );

  const dualAuthTypes = (info, key) => {
    if (key === "kiro") return ["oauth", "apikey", "api_key"];
    const modes = info?.authModes;
    if (!Array.isArray(modes)) {
      return key in FREE_TIER_PROVIDERS || key in APIKEY_PROVIDERS
        ? ["oauth", "apikey", "api_key"]
        : "oauth";
    }
    if (!modes.includes("apikey")) return "oauth";
    return ["oauth", "apikey", "api_key"];
  };

  const oauthEntries = sortByPriority(
    Object.entries(OAUTH_PROVIDERS).filter(
      ([key, info]) =>
        !info.hidden &&
        matchSearch(info.name) &&
        matchStatus(getProviderStats(key, dualAuthTypes(info, key)), info.noAuth),
    ),
    "oauth",
  );
  const freeEntries = Object.entries(FREE_PROVIDERS)
    .filter(
      ([key, info]) =>
        !info.hidden &&
        matchSearch(info.name) &&
        matchStatus(getProviderStats(key, dualAuthTypes(info, key)), info.noAuth),
    )
    .sort(([, a], [, b]) => (b.noAuth ? 1 : 0) - (a.noAuth ? 1 : 0));
  const freeTierEntries = Object.entries(FREE_TIER_PROVIDERS)
    .filter(
      ([key, info]) =>
        !info.hidden &&
        matchSearch(info.name) &&
        (info.serviceKinds ?? ["llm"]).includes("llm") &&
        matchStatus(getProviderStats(key, dualAuthTypes(info, key)), info.noAuth),
    )
    .sort(([ka, a], [kb, b]) => {
      const pa = a.priority ?? 999;
      const pb = b.priority ?? 999;
      if (pa !== pb) return pa - pb;
      const noAuthDiff = (b.noAuth ? 1 : 0) - (a.noAuth ? 1 : 0);
      if (noAuthDiff !== 0) return noAuthDiff;
      const ca = getProviderStats(ka, dualAuthTypes(a, ka)).connected > 0 ? 0 : 1;
      const cb = getProviderStats(kb, dualAuthTypes(b, kb)).connected > 0 ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return (a.name || "").localeCompare(b.name || "");
    });
  const apikeyEntries = Object.entries(APIKEY_PROVIDERS)
    .filter(
      ([key, info]) =>
        !info.hidden &&
        (info.serviceKinds ?? ["llm"]).includes("llm") &&
        matchSearch(info.name) &&
        matchStatus(getProviderStats(key, "apikey"), info.noAuth),
    )
    .sort(([ka, a], [kb, b]) => {
      const ca = getProviderStats(ka, "apikey").total > 0 ? 0 : 1;
      const cb = getProviderStats(kb, "apikey").total > 0 ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return (a.name || "").localeCompare(b.name || "");
    });
  // Every provider list is paginated (5 per page). The API-key catalogue is no
  // longer collapsed behind a "show all" button — pagination covers it.
  const apikeyList = apikeyEntries;
  // Keys of the plain "free" tier, used to pick the right card component.
  const freeEntryKeys = new Set(freeEntries.map(([k]) => k));

  // Providers that already have an account configured. Shown as a quick-access
  // strip on top so a single account can be switched off without opening the
  // provider detail page.
  const activeProviderItems = useMemo(() => {
    const byProvider = new Map();

    const register = (providerId, info, authTypes) => {
      const stats = getProviderStats(providerId, authTypes);
      if (!stats.total) return;
      const existing = byProvider.get(providerId);
      if (existing) {
        existing.total += stats.total;
        existing.connected += stats.connected;
        existing.error += stats.error;
        existing.enabled += stats.enabled;
        existing.allDisabled = existing.allDisabled && stats.allDisabled;
        return;
      }
      byProvider.set(providerId, {
        id: providerId,
        name: info?.name || providerId,
        color: info?.color,
        textIcon: info?.textIcon,
        iconSrc: getProviderIconSrc(providerId),
        authTypes,
        total: stats.total,
        connected: stats.connected,
        error: stats.error,
        enabled: stats.enabled,
        allDisabled: stats.allDisabled,
      });
    };

    for (const [key, info] of Object.entries(OAUTH_PROVIDERS)) {
      if (info.hidden) continue;
      register(key, info, dualAuthTypes(info, key));
    }
    for (const [key, info] of Object.entries(FREE_PROVIDERS)) {
      if (info.hidden) continue;
      register(key, info, dualAuthTypes(info, key));
    }
    for (const [key, info] of Object.entries(FREE_TIER_PROVIDERS)) {
      if (info.hidden) continue;
      register(key, info, dualAuthTypes(info, key));
    }
    for (const [key, info] of Object.entries(APIKEY_PROVIDERS)) {
      if (info.hidden) continue;
      register(key, info, "apikey");
    }
    for (const node of providerNodes) {
      const info = { name: node.name || node.id, color: "#10A37F" };
      register(node.id, info, "apikey");
    }

    return [...byProvider.values()].sort(
      (a, b) => b.connected - a.connected || a.name.localeCompare(b.name)
    );
  }, [connections, providerNodes]);

  if (loading) {
    return (
      <div className="flex flex-col gap-8">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const hasAnyResult =
    oauthEntries.length > 0 ||
    freeEntries.length > 0 ||
    freeTierEntries.length > 0 ||
    apikeyEntries.length > 0 ||
    compatibleProviders.length > 0 ||
    anthropicCompatibleProviders.length > 0;

  // Number of provider cards currently rendered (post-filter).
  const visibleProviderCount =
    oauthEntries.length +
    freeEntries.length +
    freeTierEntries.length +
    apikeyList.length +
    compatibleProviders.length +
    anthropicCompatibleProviders.length;

  // Paginated slices — 5 items per list.
  const activePag = paginate(activeProviderItems, activePage);
  const customPag = paginate(
    [...compatibleProviders, ...anthropicCompatibleProviders],
    customPage
  );
  const oauthPag = paginate(oauthEntries, oauthPage);
  const freePag = paginate(
    [...freeEntries, ...freeTierEntries],
    freePage
  );
  const apikeyPag = paginate(apikeyList, apikeyPage);

  const accountsTotal = activeProviderItems.reduce((s, i) => s + i.total, 0);
  const accountsEnabled = activeProviderItems.reduce((s, i) => s + i.enabled, 0);
  const accountsError = activeProviderItems.reduce((s, i) => s + i.error, 0);
  const catalogTotal =
    oauthEntries.length +
    freeEntries.length +
    freeTierEntries.length +
    apikeyEntries.length;

  return (
    <div className="an-scope flex min-w-0 flex-col gap-5">
      {/* Hero */}
      <section className="an-panel an-hero">
        <div className="an-hero-main">
          <span className="an-hero-eyebrow">Provider</span>
          <h1 className="an-hero-title">Manage All AI Providers</h1>
          <p className="an-hero-sub">
            Turn any provider on or off, check its status, and see which accounts
            are live — all in one place.
          </p>
        </div>

        <div className="an-hero-stats">
          <div className="an-stat">
            <span className="an-stat-label">
              <span className="material-symbols-outlined">extension</span>
              Providers
            </span>
            <span className="an-stat-value">{activeProviderItems.length}</span>
            <span className="an-stat-foot">with accounts</span>
          </div>
          <div className="an-stat">
            <span className="an-stat-label">
              <span className="material-symbols-outlined">bolt</span>
              Active Accounts
            </span>
            <span className="an-stat-value">{accountsEnabled}</span>
            <span className="an-stat-foot">
              <span>{accountsTotal}</span>{" "}
              <span>registered accounts</span>
            </span>
          </div>
          <div className="an-stat">
            <span className="an-stat-label">
              <span className="material-symbols-outlined">warning</span>
              Errors
            </span>
            <span className="an-stat-value">{accountsError}</span>
            <span className="an-stat-foot">accounts need a look</span>
          </div>
          <div className="an-stat">
            <span className="an-stat-label">
              <span className="material-symbols-outlined">apps</span>
              Catalog
            </span>
            <span className="an-stat-value">{catalogTotal}</span>
            <span className="an-stat-foot">providers available</span>
          </div>
        </div>
      </section>

      {/* Quick-access strip: providers that already have an account */}
      <ActiveProvidersPanel
        items={activePag.items}
        totalCount={activeProviderItems.length}
        enabledCount={accountsEnabled}
        totalAccounts={accountsTotal}
        page={activePag.page}
        pageCount={activePag.pageCount}
        onPageChange={setActivePage}
        onToggle={handleToggleProvider}
      />

      {/* Search + filter */}
      <div className="an-toolbar">
        <div className="an-search">
          <span className="material-symbols-outlined">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={translate("Search providers...")}
            className="an-input"
            aria-label="Search providers"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="an-select"
          aria-label="Filter providers by connection status"
        >
          {STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="an-toolbar-count">
          <span>{visibleProviderCount}</span>{" "}
          <span>providers</span>
        </span>
      </div>

      {!hasAnyResult && (
        <div className="an-empty">
          <span className="material-symbols-outlined">search_off</span>
          <p>No providers found</p>
        </div>
      )}

      {/* Custom Providers */}
      <ProviderSection
        title="Custom Providers"
        subtitle="OpenAI / Anthropic Compatible"
        count={compatibleProviders.length + anthropicCompatibleProviders.length}
        bottomActions={
          <>
            <Button skin="antares" size="sm" icon="add" onClick={() => setShowAddAnthropicCompatibleModal(true)}>
              Add Anthropic Compatible
            </Button>
            <Button skin="antares" size="sm" icon="add" onClick={() => setShowAddCompatibleModal(true)}>
              Add OpenAI Compatible
            </Button>
          </>
        }
      >
        {compatibleProviders.length === 0 && anthropicCompatibleProviders.length === 0 ? (
          <div className="an-empty an-empty-row">
            <span className="material-symbols-outlined">extension</span>
            <p>No compatible endpoints yet</p>
          </div>
        ) : (
          <>
            <ProviderGrid>
              {customPag.items.map((info) => (
                <ApiKeyProviderCard
                  key={info.id}
                  providerId={info.id}
                  provider={info}
                  stats={getProviderStats(info.id, "apikey")}
                  authType="compatible"
                  onToggle={(active) => handleToggleProvider(info.id, "apikey", active)}
                />
              ))}
            </ProviderGrid>
            <AntaresPagination
              page={customPag.page}
              pageCount={customPag.pageCount}
              total={customPag.total}
              onChange={setCustomPage}
              label="providers"
            />
          </>
        )}
      </ProviderSection>

      {/* OAuth Providers */}
      {oauthEntries.length > 0 && (
        <ProviderSection
          title="OAuth Providers"
          count={oauthEntries.length}
          topActions={
            <div className="flex items-center gap-2">
              <ModelAvailabilityBadge />
              <TestAllButton
                mode="oauth"
                testingMode={testingMode}
                onTest={() => handleBatchTest("oauth")}
              />
            </div>
          }
        >
          <ProviderGrid>
            {oauthPag.items.map(([key, info]) => {
              const authTypes = dualAuthTypes(info, key);
              return (
                <ProviderCard
                  key={key}
                  providerId={key}
                  provider={info}
                  stats={getProviderStats(key, authTypes)}
                  authType="oauth"
                  onToggle={(active) => handleToggleProvider(key, authTypes, active)}
                />
              );
            })}
          </ProviderGrid>
          <AntaresPagination
            page={oauthPag.page}
            pageCount={oauthPag.pageCount}
            total={oauthPag.total}
            onChange={setOauthPage}
            label="providers"
          />
        </ProviderSection>
      )}

      {/* Free Tier Providers */}
      {(freeEntries.length > 0 || freeTierEntries.length > 0) && (
        <ProviderSection
          title="Free Tier Providers"
          count={freeEntries.length + freeTierEntries.length}
          topActions={
            <TestAllButton
              mode="free"
              testingMode={testingMode}
              onTest={() => handleBatchTest("free")}
            />
          }
        >
          <ProviderGrid>
            {freePag.items.map(([key, info]) => {
              const freeAuthTypes = dualAuthTypes(info, key);
              const isFree = freeEntryKeys.has(key);
              return isFree ? (
                <ProviderCard
                  key={key}
                  providerId={key}
                  provider={info}
                  stats={getProviderStats(key, freeAuthTypes)}
                  authType="free"
                  onToggle={(active) => handleToggleProvider(key, freeAuthTypes, active)}
                />
              ) : (
                <ApiKeyProviderCard
                  key={key}
                  providerId={key}
                  provider={info}
                  stats={getProviderStats(key, freeAuthTypes)}
                  authType={Array.isArray(freeAuthTypes) ? (freeAuthTypes[0] ?? "apikey") : freeAuthTypes}
                  onToggle={(active) => handleToggleProvider(key, freeAuthTypes, active)}
                />
              );
            })}
          </ProviderGrid>
          <AntaresPagination
            page={freePag.page}
            pageCount={freePag.pageCount}
            total={freePag.total}
            onChange={setFreePage}
            label="providers"
          />
        </ProviderSection>
      )}

      {/* API Key Providers */}
      {apikeyEntries.length > 0 && (
        <ProviderSection
          title="API Key Providers"
          count={apikeyEntries.length}
          topActions={
            <TestAllButton
              mode="apikey"
              testingMode={testingMode}
              onTest={() => handleBatchTest("apikey")}
            />
          }
        >
          <ProviderGrid>
            {apikeyPag.items.map(([key, info]) => (
              <ApiKeyProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={getProviderStats(key, "apikey")}
                authType="apikey"
                onToggle={(active) => handleToggleProvider(key, "apikey", active)}
              />
            ))}
          </ProviderGrid>
          <AntaresPagination
            page={apikeyPag.page}
            pageCount={apikeyPag.pageCount}
            total={apikeyPag.total}
            onChange={setApikeyPage}
            label="providers"
          />
        </ProviderSection>
      )}

      {/* Web Cookie Providers — use browser subscription cookie instead of API key */}
      {/* <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            Web Cookie Providers{" "}
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Object.entries(WEB_COOKIE_PROVIDERS).map(([key, info]) => (
            <ApiKeyProviderCard
              key={key}
              providerId={key}
              provider={info}
              stats={getProviderStats(key, "apikey")}
              authType="apikey"
              onToggle={(active) => handleToggleProvider(key, "apikey", active)}
            />
          ))}
        </div>
      </div> */}

      <AddCompatibleModal
        variant="openai"
        isOpen={showAddCompatibleModal}
        onClose={() => setShowAddCompatibleModal(false)}
        onCreated={(node) => {
          setProviderNodes((prev) => [...prev, node]);
          setShowAddCompatibleModal(false);
        }}
      />
      <AddCompatibleModal
        variant="anthropic"
        isOpen={showAddAnthropicCompatibleModal}
        onClose={() => setShowAddAnthropicCompatibleModal(false)}
        onCreated={(node) => {
          setProviderNodes((prev) => [...prev, node]);
          setShowAddAnthropicCompatibleModal(false);
        }}
      />

      {/* Test Results Modal */}
      {testResults && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[6vh] sm:pt-[10vh]"
          onClick={() => setTestResults(null)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-surface border border-border rounded-xl w-full max-w-[600px] max-h-[86vh] sm:max-h-[80vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-border bg-surface/95 backdrop-blur-sm rounded-t-xl">
              <h3 className="font-semibold">Test Results</h3>
              <button
                onClick={() => setTestResults(null)}
                className="p-1 rounded-lg hover:bg-bg text-text-muted hover:text-text-main transition-colors"
                aria-label="Close test results"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="p-5">
              <ProviderTestResultsView results={testResults} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveProvidersPanel({
  items,
  totalCount,
  enabledCount,
  totalAccounts,
  page,
  pageCount,
  onPageChange,
  onToggle,
}) {
  if (!items.length && !totalCount) return null;

  return (
    <section className="an-panel overflow-hidden">
      <header className="an-panel-head">
        <span className="an-panel-ico" aria-hidden>
          <span className="material-symbols-outlined">bolt</span>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="an-panel-title">Active Providers</h2>
          <p className="an-panel-sub">
            <span>{totalCount}</span>{" "}
            <span>providers with accounts</span>{" · "}
            <span>{enabledCount}/{totalAccounts}</span>{" "}
            <span>accounts on</span>{" · "}
            <span>switch them off without opening each account</span>
          </p>
        </div>
        <div className="an-panel-actions">
          <span className="an-chip ok">
            <span className="size-1.5 rounded-full bg-[var(--t-ok)] animate-pulse shrink-0" />
            <span>{enabledCount}</span>
            <span>active</span>
          </span>
        </div>
      </header>

      <div className="an-panel-pad grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {items.map((item) => (
          <div
            key={item.id}
            className={`an-pcard an-pcard-compact ${item.allDisabled ? "is-off" : ""}`}
          >
            <div className="an-pcard-top">
              <span
                className="an-pcard-ico an-pcard-ico-sm"
                style={{
                  backgroundColor:
                    item.color?.length > 7
                      ? item.color
                      : (item.color || "#888") + "22",
                }}
              >
                <ProviderIcon
                  src={item.iconSrc}
                  alt={item.name}
                  size={18}
                  className="object-contain rounded max-w-[18px] max-h-[18px]"
                  fallbackText={item.textIcon || item.id.slice(0, 2).toUpperCase()}
                  fallbackColor={item.color}
                />
              </span>

              <div className="an-pcard-head">
                <Link
                  href={`/dashboard/providers/${item.id}`}
                  className="block group"
                  title={`${translate("Open")} ${item.name}`}
                >
                  <p className="an-pcard-title truncate group-hover:text-[var(--t-star-ink)] transition-colors">
                    {item.name}
                  </p>
                </Link>
                <p className="an-pcard-sub truncate">
                  <span>{item.enabled}/{item.total}</span>{" "}
                  <span>accounts on</span>
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={!item.allDisabled}
                aria-label={`${item.allDisabled ? translate("Enable") : translate("Disable")} ${item.name}`}
                title={
                  item.allDisabled
                    ? `${translate("Enable")} ${item.name}`
                    : `${translate("Disable")} ${item.name}`
                }
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // newActive: true bila provider sedang mati, false bila menyala.
                  onToggle(item.id, item.authTypes, item.allDisabled);
                }}
                className={`an-switch ${item.allDisabled ? "off" : "on"}`}
              >
                <span className="an-switch-knob" />
                {item.allDisabled ? "Off" : "On"}
              </button>
            </div>

            <div className="an-pcard-chips">
              {item.connected > 0 && (
                <span className="an-chip ok">
                  <span className="size-1.5 rounded-full bg-[var(--t-ok)] shrink-0" />
                  <span>{item.connected}</span>
                  <span>Connected</span>
                </span>
              )}
              {item.error > 0 && (
                <span className="an-chip danger">
                  <span className="size-1.5 rounded-full bg-[var(--t-danger)] shrink-0" />
                  <span>{item.error}</span>
                  <span>Error</span>
                </span>
              )}
              {item.connected === 0 && item.error === 0 && (
                <span className="an-chip">Not tested</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {pageCount > 1 && (
        <div className="border-t border-[var(--t-line-soft)] px-4 py-3 md:px-5">
          <AntaresPagination
            page={page}
            pageCount={pageCount}
            total={totalCount}
            onChange={onPageChange}
            label="providers"
          />
        </div>
      )}
    </section>
  );
}

ActiveProvidersPanel.propTypes = {
  items: PropTypes.array,
  totalCount: PropTypes.number,
  enabledCount: PropTypes.number,
  totalAccounts: PropTypes.number,
  page: PropTypes.number,
  pageCount: PropTypes.number,
  onPageChange: PropTypes.func,
  onToggle: PropTypes.func.isRequired,
};

function ProviderSection({
  title,
  subtitle,
  count,
  topActions,
  bottomActions,
  children,
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2.5">
          <h2 className="an-sec-title">{title}</h2>
          {count !== undefined && count !== null && (
            <span className="an-sec-count">{count}</span>
          )}
          {subtitle && <span className="an-sec-sub">{subtitle}</span>}
        </div>
        {topActions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{topActions}</div>
        )}
      </header>
      {bottomActions && <div className="flex flex-wrap gap-2">{bottomActions}</div>}
      {children}
    </section>
  );
}

function ProviderGrid({ children }) {
  const items = children
    ? (Array.isArray(children) ? children : [children]).flat().filter(Boolean)
    : [];
  return <div className="an-grid-providers">{items}</div>;
}

function TestAllButton({ mode, testingMode, onTest }) {
  const active = testingMode === mode;
  return (
    <button
      onClick={onTest}
      disabled={!!testingMode}
      className={`an-btn h-8 px-3 text-[11px] gap-1.5 ${
        active
          ? "an-primary"
          : "an-ghost"
      }`}
      title={`Test all ${mode} connections`}
    >
      <span className={`material-symbols-outlined text-[14px]${active ? " animate-spin" : ""}`}>
        play_arrow
      </span>
      {active ? "Testing..." : "Test All"}
    </button>
  );
}

function ProviderCardShell({
  providerId,
  iconSrc,
  provider,
  stats,
  onToggle,
  allDisabled,
  subtitle,
  children,
}) {
  const { total } = stats;
  const isOff = !!allDisabled;

  return (
    <Link href={`/dashboard/providers/${providerId}`} className="group block h-full">
      <article className={`an-pcard ${isOff ? "is-off" : ""}`}>
        <div className="an-pcard-top">
          <span
            className="an-pcard-ico"
            style={{
              backgroundColor:
                provider.color?.length > 7
                  ? provider.color
                  : (provider.color || "#888") + "22",
            }}
          >
            <ProviderIcon
              src={iconSrc}
              alt={provider.name}
              size={24}
              className="object-contain rounded max-w-[24px] max-h-[24px]"
              fallbackText={provider.textIcon || provider.id.slice(0, 2).toUpperCase()}
              fallbackColor={provider.color}
            />
          </span>

          <div className="an-pcard-head">
            <p className="an-pcard-title truncate">{provider.name}</p>
            <p className="an-pcard-sub truncate">{subtitle}</p>
          </div>

          {total > 0 && (
            <button
              type="button"
              role="switch"
              aria-checked={!isOff}
              aria-label={`${isOff ? translate("Enable") : translate("Disable")} ${provider.name}`}
              title={isOff ? `${translate("Enable")} ${provider.name}` : `${translate("Disable")} ${provider.name}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // newActive: aktifkan bila sedang mati, nonaktifkan bila menyala.
                onToggle(isOff);
              }}
              className={`an-switch ${isOff ? "off" : "on"}`}
            >
              <span className="an-switch-knob" />
              {isOff ? "Off" : "On"}
            </button>
          )}
        </div>

        <div className="an-pcard-chips">{children}</div>

        <div className="an-pcard-foot">
          <span className="an-pcard-meta">
            {total > 0 ? (
              <>
                <span>{total}</span>{" "}
                <span>accounts registered</span>
              </>
            ) : (
              <span>No accounts yet</span>
            )}
          </span>
          <span className="material-symbols-outlined text-[15px] text-[var(--t-dim)] group-hover:text-[var(--t-star-ink)] transition-colors">
            arrow_outward
          </span>
        </div>
      </article>
    </Link>
  );
}

function ProviderCard({ providerId, provider, stats, authType, onToggle }) {
  const { connected, error, errorCode, errorTime, allDisabled } = stats;
  const isNoAuth = !!provider.noAuth;

  return (
    <ProviderCardShell
      providerId={providerId}
      iconSrc={`/providers/${provider.id}.png`}
      provider={provider}
      stats={stats}
      onToggle={onToggle}
      allDisabled={allDisabled}
      subtitle={providerSubtitle(provider, isNoAuth ? "No sign-in needed" : "OAuth")}
    >
      {allDisabled ? (
        <span className="an-chip">All accounts off</span>
      ) : isNoAuth ? (
        <span className="an-chip ok"><span className="size-1.5 rounded-full bg-[var(--t-ok)] shrink-0" />Ready</span>
      ) : (
        <>
          {getStatusDisplay(connected, error, errorCode)}
          {errorTime && <span className="text-[10px] text-[var(--t-muted)]">{errorTime}</span>}
        </>
      )}
    </ProviderCardShell>
  );
}

ProviderCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  provider: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    color: PropTypes.string,
    textIcon: PropTypes.string,
  }).isRequired,
  stats: PropTypes.shape({
    connected: PropTypes.number,
    error: PropTypes.number,
    errorCode: PropTypes.string,
    errorTime: PropTypes.string,
  }).isRequired,
  authType: PropTypes.string,
  onToggle: PropTypes.func,
};

function ApiKeyProviderCard({
  providerId,
  provider,
  stats,
  authType,
  onToggle,
}) {
  const { connected, error, errorCode, errorTime, allDisabled } = stats;
  const isCompatible = providerId.startsWith(OPENAI_COMPATIBLE_PREFIX);
  const isAnthropicCompatible = providerId.startsWith(ANTHROPIC_COMPATIBLE_PREFIX);

  const getIconPath = () => {
    if (isCompatible && provider.apiType)
      return provider.apiType === "responses"
        ? "/providers/oai-r.png"
        : "/providers/oai-cc.png";
    if (isAnthropicCompatible) return "/providers/anthropic-m.png";
    return getProviderIconSrc(provider.id);
  };

  return (
    <ProviderCardShell
      providerId={providerId}
      iconSrc={getIconPath()}
      provider={provider}
      stats={stats}
      onToggle={onToggle}
      allDisabled={allDisabled}
      subtitle={providerSubtitle(
        provider,
        isCompatible
          ? provider.apiType === "responses"
            ? "OpenAI Responses"
            : "OpenAI Compatible"
          : isAnthropicCompatible
            ? "Anthropic Compatible"
            : "API Key"
      )}
    >
      {allDisabled ? (
        <span className="an-chip">All accounts off</span>
      ) : (
        <>
          {getStatusDisplay(connected, error, errorCode)}
          {isCompatible && (
            <span className="an-chip">
              {provider.apiType === "responses" ? "Responses" : "Chat"}
            </span>
          )}
          {isAnthropicCompatible && (
            <span className="an-chip">Messages</span>
          )}
          {errorTime && <span className="text-[10px] text-[var(--t-muted)]">{errorTime}</span>}
        </>
      )}
    </ProviderCardShell>
  );
}

ApiKeyProviderCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  provider: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    color: PropTypes.string,
    textIcon: PropTypes.string,
    apiType: PropTypes.string,
  }).isRequired,
  stats: PropTypes.shape({
    connected: PropTypes.number,
    error: PropTypes.number,
    errorCode: PropTypes.string,
    errorTime: PropTypes.string,
  }).isRequired,
  authType: PropTypes.string,
  onToggle: PropTypes.func,
};

function ProviderTestResultsView({ results }) {
  if (results.error && !results.results) {
    return (
      <div className="text-center py-6">
        <span className="material-symbols-outlined text-red-500 text-[32px] mb-2 block">
          error
        </span>
        <p className="text-sm text-red-400">{results.error}</p>
      </div>
    );
  }

  const { summary, mode } = results;
  const items = results.results || [];
  const modeLabel =
    {
      oauth: "OAuth",
      free: "Free",
      apikey: "API Key",
      provider: "Provider",
      all: "All",
    }[mode] || mode;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {summary && (
        <div className="flex flex-wrap items-center gap-2 text-xs mb-1 sm:gap-3">
          <span className="text-text-muted">{modeLabel} Test</span>
          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
            {summary.passed} passed
          </span>
          {summary.failed > 0 && (
            <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 font-medium">
              {summary.failed} failed
            </span>
          )}
          <span className="text-text-muted sm:ml-auto">
            {summary.total} tested
          </span>
        </div>
      )}
      {items.map((r, i) => (
        <div
          key={r.connectionId || i}
          className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg bg-black/[0.03] px-3 py-2 text-xs dark:bg-white/[0.03] sm:flex-nowrap"
        >
          <span
            className={`material-symbols-outlined text-[16px] ${r.valid ? "text-emerald-500" : "text-red-500"}`}
          >
            {r.valid ? "check_circle" : "error"}
          </span>
          <div className="min-w-0 flex-[1_1_160px]">
            <span className="block truncate font-medium sm:inline">
              {r.connectionName}
            </span>
            <span className="block truncate text-text-muted sm:ml-1.5 sm:inline">
              ({r.provider})
            </span>
          </div>
          {r.latencyMs !== undefined && (
            <span className="shrink-0 text-text-muted font-mono tabular-nums">
              {r.latencyMs}ms
            </span>
          )}
          <span
            className={`shrink-0 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
              r.valid
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-red-500/15 text-red-400"
            }`}
          >
            {r.valid ? "OK" : r.diagnosis?.type || "ERROR"}
          </span>
        </div>
      ))}
      {items.length === 0 && (
        <div className="text-center py-4 text-text-muted text-sm">
          No active connections found for this group.
        </div>
      )}
    </div>
  );
}

ProviderTestResultsView.propTypes = {
  results: PropTypes.shape({
    mode: PropTypes.string,
    results: PropTypes.array,
    summary: PropTypes.shape({
      total: PropTypes.number,
      passed: PropTypes.number,
      failed: PropTypes.number,
    }),
    error: PropTypes.string,
  }).isRequired,
};
