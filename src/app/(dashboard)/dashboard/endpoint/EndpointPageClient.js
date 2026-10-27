"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import PropTypes from "prop-types";
import { Button, Input, Toggle, ConfirmModal } from "@/shared/components";
import AntaresModal from "@/shared/components/AntaresModal";
import AntaresPanel from "@/shared/components/AntaresPanel";
import AntaresButton from "@/shared/components/AntaresButton";
import StarField from "@/shared/components/StarField";
import Soft3DLogo from "@/shared/components/Soft3DLogo";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useNotificationStore } from "@/store/notificationStore";
import { translate } from "@/i18n/runtime";
import {
  TUNNEL_BENEFITS,
  TUNNEL_PING_INTERVAL_MS,
  TUNNEL_PING_MAX_MS,
  STATUS_POLL_FAST_MS,
  REACHABLE_MISS_THRESHOLD,
  CLIENT_PING_FAST_MS,
} from "./endpointConstants";
import { clientPingUrl, clientPingAny } from "./endpointPing";
import useSettingsStore from "@/store/settingsStore";
import EndpointRow from "./components/EndpointRow";
import DomainRow from "./components/DomainRow";
import StatusAlert from "./components/StatusAlert";
import Tooltip from "./components/Tooltip";
import SecurityWarning from "./components/SecurityWarning";
import KeyAccessControls from "./components/KeyAccessControls";
import DashboardProviderOverview from "./components/DashboardProviderOverview";
export default function APIPageClient({ machineId }) {
  const addNotification = useNotificationStore((s) => s.addNotification);
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [showModelsModal, setShowModelsModal] = useState(false);
  const [fetchedModelsData, setFetchedModelsData] = useState(null);
  const [fetchingModelKey, setFetchingModelKey] = useState(null);

  const [requireApiKey, setRequireApiKey] = useState(false);
  const [requireLogin, setRequireLogin] = useState(true);
  const [hasPassword, setHasPassword] = useState(true);
 const [tunnelDashboardAccess, setTunnelDashboardAccess] = useState(false);

  const [tunnelChecking, setTunnelChecking] = useState(true);
  const [tunnelEnabled, setTunnelEnabled] = useState(false);
  const [tunnelReachable, setTunnelReachable] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [tunnelPublicUrl, setTunnelPublicUrl] = useState("");
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelProgress, setTunnelProgress] = useState("");
  const [tunnelStatus, setTunnelStatus] = useState(null);
  const [showEnableTunnelModal, setShowEnableTunnelModal] = useState(false);
  const [showDisableTunnelModal, setShowDisableTunnelModal] = useState(false);

  const [tsEnabled, setTsEnabled] = useState(false);
  const [tsReachable, setTsReachable] = useState(false);
  const [tsUrl, setTsUrl] = useState("");
  const [tsLoading, setTsLoading] = useState(false);
  const [tsProgress, setTsProgress] = useState("");
  const [tsStatus, setTsStatus] = useState(null);
  const [tsAuthUrl, setTsAuthUrl] = useState("");
  const [tsAuthLabel, setTsAuthLabel] = useState("");
  const [tsInstalled, setTsInstalled] = useState(null); // null=checking, true/false
  const [tsInstalling, setTsInstalling] = useState(false);
  const [tsInstallLog, setTsInstallLog] = useState([]);
  const [tsSudoPassword, setTsSudoPassword] = useState("");
  const [tsConnecting, setTsConnecting] = useState(false);
  const [showTsModal, setShowTsModal] = useState(false);
  const [showDisableTsModal, setShowDisableTsModal] = useState(false);
  const tsLogRef = useRef(null);

  const tunnelMissRef = useRef(0);
  const tsMissRef = useRef(0);
  const tunnelClientReachableRef = useRef(false);
  const tsClientReachableRef = useRef(false);
  const tunnelEverReachableRef = useRef(false);
  const tsEverReachableRef = useRef(false);
  const [tunnelEverReachable, setTunnelEverReachable] = useState(false);
  const [tsEverReachable, setTsEverReachable] = useState(false);

  const [visibleKeys, setVisibleKeys] = useState(new Set());

  const [isRemoteHost, setIsRemoteHost] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined")
      setIsRemoteHost(!["localhost", "127.0.0.1", "::1"].includes(window.location.hostname));
  }, []);

  const { copied, copy } = useCopyToClipboard();

  const isLoginUnsafe = !requireLogin;
  const unsafeReason = "Aktifkan \"Require login\" sebelum mengaktifkan tunnel.";

  useEffect(() => {
    if (tsLogRef.current) tsLogRef.current.scrollTop = tsLogRef.current.scrollHeight;
  }, [tsInstallLog]);

  useEffect(() => {
    fetchData();
    loadSettings();
  }, []);

  useEffect(() => {
    const anyEnabled = tunnelEnabled || tsEnabled;
    if (!anyEnabled) return;
    const tunnelHealthy = !tunnelEnabled || tunnelReachable;
    const tsHealthy = !tsEnabled || tsReachable;
    const allHealthy = tunnelHealthy && tsHealthy;
    const onVisible = () => { if (!document.hidden) syncTunnelStatus(); };
    document.addEventListener("visibilitychange", onVisible);
    if (allHealthy) return () => document.removeEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => { if (!document.hidden) syncTunnelStatus(); }, STATUS_POLL_FAST_MS);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tunnelEnabled, tsEnabled, tunnelReachable, tsReachable]);

  useEffect(() => {
    const probeBoth = async () => {
      if (document.hidden) return;
      if (tunnelEnabled && (tunnelUrl || tunnelPublicUrl)) {
        const ok = await clientPingAny(tunnelPublicUrl, tunnelUrl);
        tunnelClientReachableRef.current = ok;
        if (ok) { tunnelMissRef.current = 0; setTunnelReachable(true); if (!tunnelEverReachableRef.current) { tunnelEverReachableRef.current = true; setTunnelEverReachable(true); } }
        else { tunnelMissRef.current += 1; if (tunnelMissRef.current >= REACHABLE_MISS_THRESHOLD) setTunnelReachable(false); }
      } else {
        tunnelClientReachableRef.current = false;
      }
      if (tsEnabled && tsUrl) {
        const ok = await clientPingUrl(tsUrl);
        tsClientReachableRef.current = ok;
        if (ok) { tsMissRef.current = 0; setTsReachable(true); if (!tsEverReachableRef.current) { tsEverReachableRef.current = true; setTsEverReachable(true); } }
        else { tsMissRef.current += 1; if (tsMissRef.current >= REACHABLE_MISS_THRESHOLD) setTsReachable(false); }
      } else {
        tsClientReachableRef.current = false;
      }
    };
    const anyEnabled = (tunnelEnabled && (tunnelUrl || tunnelPublicUrl)) || (tsEnabled && tsUrl);
    if (!anyEnabled) return;
    probeBoth();
    const tunnelHealthy = !tunnelEnabled || tunnelReachable;
    const tsHealthy = !tsEnabled || tsReachable;
    if (tunnelHealthy && tsHealthy) return;
    const id = setInterval(probeBoth, CLIENT_PING_FAST_MS);
    return () => clearInterval(id);
  }, [tunnelEnabled, tunnelUrl, tunnelPublicUrl, tsEnabled, tsUrl, tunnelReachable, tsReachable]);

  const updateReachable = useCallback((_unused, clientRef, missRef, setter, everRef, everSetter) => {
    const reachable = clientRef.current;
    if (reachable) {
      missRef.current = 0;
      setter(true);
      if (!everRef.current) {
        everRef.current = true;
        everSetter(true);
      }
    } else {
      missRef.current += 1;
      if (missRef.current >= REACHABLE_MISS_THRESHOLD) setter(false);
    }
  }, []);

  const syncTunnelStatus = async () => {
    try {
      const statusRes = await fetch("/api/tunnel/status", { cache: "no-store" });
      if (!statusRes.ok) return;
      const data = await statusRes.json();
      const tEnabled = data.tunnel?.settingsEnabled ?? data.tunnel?.enabled ?? false;
      const tUrl = data.tunnel?.tunnelUrl || "";
      setTunnelUrl(tUrl);
      setTunnelPublicUrl(data.tunnel?.publicUrl || "");
      setTunnelEnabled(tEnabled);
      updateReachable(null, tunnelClientReachableRef, tunnelMissRef, setTunnelReachable, tunnelEverReachableRef, setTunnelEverReachable);

      const tsEn = data.tailscale?.settingsEnabled ?? data.tailscale?.enabled ?? false;
      const tsUrlVal = data.tailscale?.tunnelUrl || "";
      setTsUrl(tsUrlVal);
      setTsEnabled(tsEn);
      updateReachable(null, tsClientReachableRef, tsMissRef, setTsReachable, tsEverReachableRef, setTsEverReachable);
    } catch { /* ignore poll errors */ }
  };

  const loadSettings = async () => {
    setTunnelChecking(true);
    try {
      const [settingsData, statusRes] = await Promise.all([
        useSettingsStore.getState().fetchSettings(),
        fetch("/api/tunnel/status", { 
          cache: "no-store",
          signal: AbortSignal.timeout(10000) // 10 second timeout
        })
      ]);
      if (settingsData) {
        setRequireApiKey(settingsData.requireApiKey || false);
        setRequireLogin(settingsData.requireLogin !== false);
        setHasPassword(settingsData.hasPassword || false);
        setTunnelDashboardAccess(settingsData.tunnelDashboardAccess || false);
      }
      if (statusRes.ok) {
        const data = await statusRes.json();
        const tEnabled = data.tunnel?.settingsEnabled ?? data.tunnel?.enabled ?? false;
        const tUrl = data.tunnel?.tunnelUrl || "";
        setTunnelUrl(tUrl);
        setTunnelPublicUrl(data.tunnel?.publicUrl || "");
        setTunnelEnabled(tEnabled);
        updateReachable(null, tunnelClientReachableRef, tunnelMissRef, setTunnelReachable, tunnelEverReachableRef, setTunnelEverReachable);

        const tsEn = data.tailscale?.settingsEnabled ?? data.tailscale?.enabled ?? false;
        const tsUrlVal = data.tailscale?.tunnelUrl || "";
        setTsUrl(tsUrlVal);
        setTsEnabled(tsEn);
        updateReachable(null, tsClientReachableRef, tsMissRef, setTsReachable, tsEverReachableRef, setTsEverReachable);
      }
    } catch (error) {
      console.log("Error loading settings:", error);
    } finally {
      setTunnelChecking(false);
    }
  };

  const handleTunnelDashboardAccess = async (value) => {
    try {
      const updated = await useSettingsStore.getState().patchSettings({ tunnelDashboardAccess: value });
      if (updated) setTunnelDashboardAccess(value);
    } catch (error) {
      console.log("Error updating tunnelDashboardAccess:", error);
    }
  };

  const handleRequireApiKey = async (value) => {
    try {
      const updated = await useSettingsStore.getState().patchSettings({ requireApiKey: value });
      if (updated) setRequireApiKey(value);
    } catch (error) {
      console.log("Error updating requireApiKey:", error);
    }
  };

  const fetchData = async () => {
    try {
      const fetchKeys = async () => {
        const res = await fetch("/api/keys", {
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.keys || [];
      };

      let existing = await fetchKeys();
      if (existing.length === 0) {
        try {
          const createRes = await fetch("/api/keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ _autoProvision: true }),
            signal: AbortSignal.timeout(10000) // 10 second timeout
          });
          if (createRes.ok) existing = await fetchKeys();
        } catch { /* fall through to empty render */ }
      }
      setKeys(existing);
    } catch (error) {
      console.log("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const pingTunnelHealth = async (...urls) => {
    setTunnelLoading(true);
    const targets = urls.filter(Boolean).map((u) => `${u}/api/health`);
    const start = Date.now();
    let stepPercent = 60;
    while (Date.now() - start < TUNNEL_PING_MAX_MS) {
      stepPercent = Math.min(95, stepPercent + 5);
      setTunnelProgress(`${translate("Waiting for tunnel ready...")} (${stepPercent}%)`);
      await new Promise((r) => setTimeout(r, TUNNEL_PING_INTERVAL_MS));
      const ok = await Promise.any(targets.map(async (h) => {
        const p = await fetch(h, { mode: "cors", cache: "no-store" });
        if (p.ok) return true;
        throw new Error("not ready");
      })).catch(() => false);
      if (ok) {
        setTunnelProgress("100% Ready!");
        setTunnelEnabled(true);
        setTunnelLoading(false);
        setTunnelProgress("");
        return true;
      }
      if ((Date.now() - start) % 10000 < TUNNEL_PING_INTERVAL_MS) {
        try {
          const statusRes = await fetch("/api/tunnel/status", {
            signal: AbortSignal.timeout(5000) // 5 second timeout
          });
          if (statusRes.ok) {
            const status = await statusRes.json();
            if (!status.tunnel?.enabled && !status.tunnel?.running) {
              addNotification({ type: "error", title: translate("Tunnel Error"), message: translate("Tunnel process stopped unexpectedly.") });
              setTunnelLoading(false);
              setTunnelProgress("");
              return false;
            }
          }
        } catch { /* ignore */ }
      }
    }
    addNotification({ type: "error", title: translate("Tunnel Error"), message: translate("Tunnel created but not reachable. Please try again.") });
    setTunnelLoading(false);
    setTunnelProgress("");
    return false;
  };

  const handleEnableTunnel = async () => {
    setShowEnableTunnelModal(false);
    setTunnelLoading(true);
    setTunnelStatus(null);
    let currentPct = 10;
    setTunnelProgress(`${translate("Creating tunnel...")} (10%)`);

    let polling = true;
    const pollProgress = async () => {
      while (polling) {
        try {
          const r = await fetch("/api/tunnel/status");
          if (r.ok) {
            const s = await r.json();
            if (s.download?.downloading) {
              setTunnelProgress(`Downloading cloudflared... ${s.download.progress}%`);
            } else if (polling) {
              currentPct = Math.min(55, currentPct + 5);
              setTunnelProgress(`${translate("Creating tunnel...")} (${currentPct}%)`);
            }
          }
        } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 1200));
      }
    };
    pollProgress();

    try {
      const res = await fetch("/api/tunnel/enable", { method: "POST" });
      polling = false;
      const data = await res.json();
      if (!res.ok) {
        addNotification({ type: "error", title: translate("Tunnel Error"), message: data.error || translate("Failed to enable tunnel") });
        return;
      }

      const url = data.tunnelUrl;
      if (!url) {
        addNotification({ type: "error", title: translate("Tunnel Error"), message: translate("No tunnel URL returned") });
        return;
      }

      setTunnelUrl(url);
      setTunnelPublicUrl(data.publicUrl || "");
      addNotification({ type: "success", title: translate("Tunnel Active"), message: translate("Tunnel connected!") });
      await pingTunnelHealth(data.publicUrl, url);
    } catch (error) {
      addNotification({ type: "error", title: translate("Tunnel Error"), message: error.message });
    } finally {
      polling = false;
      setTunnelLoading(false);
      setTunnelProgress("");
    }
  };

  const handleDisableTunnel = async () => {
    setTunnelLoading(true);
    setTunnelStatus(null);
    try {
      const res = await fetch("/api/tunnel/disable", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTunnelEnabled(false);
        setTunnelUrl("");
        setTunnelPublicUrl("");
        setTunnelReachable(false);
        setShowDisableTunnelModal(false);
        addNotification({ type: "success", title: translate("Tunnel Disabled"), message: translate("Tunnel disabled") });
      } else {
        addNotification({ type: "error", title: translate("Tunnel Error"), message: data.error || translate("Failed to disable tunnel") });
      }
    } catch (error) {
      addNotification({ type: "error", title: translate("Tunnel Error"), message: error.message });
    } finally {
      setTunnelLoading(false);
    }
  };

  const checkTailscaleInstalled = async () => {
    setTsInstalled(null);
    try {
      const res = await fetch("/api/tunnel/tailscale-check");
      if (res.ok) {
        const data = await res.json();
        setTsInstalled(data.installed);
        return data;
      }
    } catch { /* ignore */ }
    setTsInstalled(false);
    return { installed: false };
  };

  const handleInstallTailscale = async () => {
    setTsInstalling(true);
    setTsStatus(null);
    setTsInstallLog([]);
    try {
      const res = await fetch("/api/tunnel/tailscale-install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sudoPassword: tsSudoPassword }),
      });
      setTsSudoPassword("");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const lines = part.split("\n");
          let event = "progress";
          let data = null;
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7).trim();
            if (line.startsWith("data: ")) {
              try { data = JSON.parse(line.slice(6)); } catch { /* skip */ }
            }
          }
          if (!data) continue;
          if (event === "progress") {
            setTsInstallLog((prev) => [...prev.slice(-50), data.message]);
          } else if (event === "done") {
            setTsInstalled(true);
            setTsInstalling(false);
            setShowTsModal(false);
            handleConnectTailscale();
            return;
          } else if (event === "error") {
            setTsStatus({ type: "error", message: data.error || "Install failed" });
          }
        }
      }
    } catch (e) {
      setTsStatus({ type: "error", message: e.message });
    } finally {
      setTsInstalling(false);
    }
  };

  const pingTsHealth = async (url) => {
    setTsProgress("Waiting for Tailscale ready...");
    const healthUrl = `${url}/api/health`;
    const start = Date.now();
    while (Date.now() - start < TUNNEL_PING_MAX_MS) {
      await new Promise((r) => setTimeout(r, TUNNEL_PING_INTERVAL_MS));
      try {
        const ping = await fetch(healthUrl, { mode: "no-cors", cache: "no-store" });
        if (ping.ok || ping.type === "opaque") return true;
      } catch { /* not ready yet */ }
    }
    return false;
  };

  const requestUserAuth = (url, label) => {
    setTsAuthUrl(url);
    setTsAuthLabel(label);
  };

  const clearUserAuth = () => {
    setTsAuthUrl("");
    setTsAuthLabel("");
  };

  const handleConnectTailscale = async () => {
    setShowTsModal(false);
    setTsConnecting(true);
    setTsLoading(true);
    setTsStatus(null);
    setTsProgress("Connecting...");
    clearUserAuth();
    try {
      const res = await fetch("/api/tunnel/tailscale-enable", { method: "POST" });
      const data = await res.json();

      if (res.ok && data.success) {
        setTsUrl(data.tunnelUrl || "");
        const reachable = await pingTsHealth(data.tunnelUrl);
        setTsEnabled(true);
        setTsStatus(reachable ? null : { type: "warning", message: "Connected but not reachable yet." });
        return;
      }

      if (data.needsLogin && data.authUrl) {
        requestUserAuth(data.authUrl, "Open Login Page");
        setTsProgress("Login required — click \"Open Login Page\" to continue");
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          try {
            const r2 = await fetch("/api/tunnel/tailscale-check");
            if (r2.ok) {
              const check = await r2.json();
              if (check.loggedIn) {
                clearUserAuth();
                setTsProgress("Starting funnel...");
                const res2 = await fetch("/api/tunnel/tailscale-enable", { method: "POST" });
                const data2 = await res2.json();
                if (res2.ok && data2.success) {
                  setTsUrl(data2.tunnelUrl || "");
                  const ok2 = await pingTsHealth(data2.tunnelUrl);
                  setTsEnabled(true);
                  setTsStatus(ok2 ? null : { type: "warning", message: "Connected but not reachable yet." });
                } else if (data2.funnelNotEnabled && data2.enableUrl) {
                  await pollFunnelEnable(data2.enableUrl);
                } else {
                  setTsStatus({ type: "error", message: data2.error || "Failed to start funnel" });
                }
                return;
              }
            }
          } catch { /* retry */ }
        }
        clearUserAuth();
        setTsStatus({ type: "error", message: "Login timed out. Please try again." });
        return;
      }

      if (data.funnelNotEnabled && data.enableUrl) {
        await pollFunnelEnable(data.enableUrl);
        return;
      }

      setTsStatus({ type: "error", message: data.error || "Failed to connect" });
    } catch (error) {
      setTsStatus({ type: "error", message: error.message });
    } finally {
      setTsLoading(false);
      setTsConnecting(false);
      setTsProgress("");
      clearUserAuth();
    }
  };

  const pollFunnelEnable = async (enableUrl) => {
    requestUserAuth(enableUrl, "Open Funnel Settings");
    setTsProgress("Click \"Open Funnel Settings\" to enable Funnel...");
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await fetch("/api/tunnel/tailscale-enable", { method: "POST" });
        const data = await res.json();
        if (res.ok && data.success) {
          clearUserAuth();
          setTsUrl(data.tunnelUrl || "");
          const ok3 = await pingTsHealth(data.tunnelUrl);
          setTsEnabled(true);
          setTsStatus(ok3 ? null : { type: "warning", message: "Connected but not reachable yet." });
          return;
        }
        if (data.funnelNotEnabled) continue;
        if (data.error) {
          clearUserAuth();
          setTsStatus({ type: "error", message: data.error });
          return;
        }
      } catch { /* retry */ }
    }
    clearUserAuth();
    setTsStatus({ type: "error", message: "Timed out waiting for Funnel to be enabled." });
  };

  const handleDisableTailscale = async () => {
    setTsLoading(true);
    setTsStatus(null);
    try {
      const res = await fetch("/api/tunnel/tailscale-disable", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTsEnabled(false);
        setTsUrl("");
        setShowDisableTsModal(false);
        addNotification({ type: "success", title: translate("Tailscale Disabled"), message: translate("Tailscale disabled") });
      } else {
        addNotification({ type: "error", title: translate("Tailscale Error"), message: data.error || translate("Failed to disable Tailscale") });
      }
    } catch (e) {
      addNotification({ type: "error", title: translate("Tailscale Error"), message: e.message });
    } finally {
      setTsLoading(false);
    }
  };

  const handleOpenTsModal = async () => {
    setTsStatus(null);
    setTsInstallLog([]);
    const data = await checkTailscaleInstalled();
    if (data?.installed && data?.hasCachedPassword) {
      handleConnectTailscale();
    } else {
      setShowTsModal(true);
    }
  };

  const handleCreateKey = async () => {
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() || undefined }),
      });
      const data = await res.json();

      if (res.ok) {
        setCreatedKey(data.key);
        await fetchData();
        setNewKeyName("");
        setShowAddModal(false);
      }
    } catch (error) {
      console.log("Error creating key:", error);
    }
  };

  const handleDeleteKey = async (id) => {
    setConfirmState({
      title: "Delete API Key",
      message: "Delete this API key?",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
          if (res.ok) {
            setKeys(keys.filter((k) => k.id !== id));
            setVisibleKeys(prev => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }
        } catch (error) {
          console.log("Error deleting key:", error);
        }
      }
    });
  };

  const fetchModelsForKey = async (key) => {
    setFetchingModelKey(key.id);
    setFetchedModelsData(null);
    try {
      const res = await fetch(`${window.location.origin}/v1/models`, {
        headers: { Authorization: `Bearer ${key.key}` },
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      setFetchedModelsData(data);
      setShowModelsModal(true);
    } catch (error) {
      setFetchedModelsData({ error: { message: error.message, type: "request_error" } });
      setShowModelsModal(true);
    } finally {
      setFetchingModelKey(null);
    }
  };

  const handleToggleKey = async (id, isActive) => {
    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (res.ok) {
        setKeys(prev => prev.map(k => k.id === id ? { ...k, isActive } : k));
      }
    } catch (error) {
      console.log("Error toggling key:", error);
    }
  };

  const handleUpdateKeyAccess = async (id, access) => {
    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.key) {
        setKeys(prev => prev.map(k => k.id === id ? { ...k, access: data.key.access } : k));
      } else {
        console.log("Error updating key access:", data.error || res.status);
      }
    } catch (error) {
      console.log("Error updating key access:", error);
    }
  };

  const maskKey = (fullKey) => {
    if (!fullKey || fullKey.length <= 10) return fullKey || "";
    return fullKey.slice(0, 6) + "•".repeat(fullKey.length - 10) + fullKey.slice(-4);
  };

  const toggleKeyVisibility = (keyId) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(keyId)) next.delete(keyId);
      else next.add(keyId);
      return next;
    });
  };

  const [baseUrl, setBaseUrl] = useState("/v1");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(`${window.location.origin}/v1`);
    }
  }, []);

  if (loading) {
    return (
      <div className="an-scope an-shell flex items-center justify-center min-h-screen">
        <div className="an-shell-bg"><StarField /></div>
        <div className="lf-loading-wrap">
          <Soft3DLogo className="size-10" />
          <div className="lf-loading-dots">
            <span /><span /><span />
          </div>
          <p className="lf-loading-text">{translate("Memuat dashboard...")}</p>
        </div>
      </div>
    );
  }

  const currentEndpoint = baseUrl;

  return (
    <div className="an-scope an-shell flex flex-col gap-5 sm:gap-6">
      {/* Antares star-field backdrop — identical to the login page */}
      <div className="an-shell-bg" aria-hidden>
        <StarField />
      </div>

      {/* ---- Hero ---- */}
      <header className="flex flex-col gap-2 min-w-0">
        <p className="an-eyebrow">
          <span className="an-num">01</span>
          <span className="an-rule" />
          <span>RouterMod · AI Gateway</span>
        </p>
        <h1 className="an-h1 text-[clamp(1.6rem,4.6vw,2.3rem)]">
          Endpoint<span className="an-dim mx-2">&amp;</span>Keys
        </h1>
        <p className="an-hint max-w-[70ch]">
          Satu endpoint untuk seluruh model AI. Salin base URL, buat API key, lalu pakai
          di klien OpenAI-compatible apa pun.
        </p>
      </header>

      {/* Real-time Provider Status & Lifetime Token Usage */}
      <DashboardProviderOverview />

      {/* Endpoint Card */}
      <AntaresPanel
        icon="dns"
        title="API Endpoint"
        subtitle="Alamat akses untuk seluruh request OpenAI-compatible"
      >
        {/* Endpoint rows */}
        <div className="flex flex-col gap-3">
          {/* Local */}
          <EndpointRow
            label="Local endpoint"
            url={currentEndpoint}
            copyId="local_url"
            copied={copied}
            onCopy={copy}
          />
          {/* Public Domain row */}
          <DomainRow
            tunnelEnabled={tunnelEnabled}
            tunnelLoading={tunnelLoading}
            tunnelReachable={tunnelReachable}
            tunnelEverReachable={tunnelEverReachable}
            tunnelProgress={tunnelProgress}
            tunnelStatus={tunnelStatus}
            tunnelChecking={tunnelChecking}
            tunnelPublicUrl={tunnelPublicUrl}
            tunnelUrl={tunnelUrl}
            copied={copied}
            copy={copy}
            isLoginUnsafe={isLoginUnsafe}
            unsafeReason={unsafeReason}
            requireApiKey={requireApiKey}
            addNotification={addNotification}
            onDisable={() => setShowDisableTunnelModal(true)}
            onGenerate={() => setShowEnableTunnelModal(true)}
            onCancelLoading={() => { setTunnelLoading(false); setTunnelProgress(""); }}
            onCancelChecking={() => setTunnelChecking(false)}
          />
        </div>

        {/* Pre-enable security gate banner */}
        {isLoginUnsafe && !tunnelEnabled && (
          <div className="mt-4">
            <SecurityWarning
              message={unsafeReason}
              action={{ label: "Open settings", href: "/dashboard/profile" }}
            />
          </div>
        )}

        {/* Security warnings when tunnel or tailscale is active */}
        {(tunnelEnabled || tsEnabled) && (
          <div className="mt-4 flex flex-col gap-2">
            {!requireApiKey && (
              <SecurityWarning
                message="Require API key is disabled — your endpoint is publicly accessible without authentication."
                action={{ label: "Enable", href: "#require-api-key" }}
              />
            )}
            {!requireLogin && (
              <SecurityWarning
                message="Require login is disabled — anyone can access your dashboard via tunnel."
                action={{
                  label: "Enable",
                  href: "/dashboard/profile",
                }}
              />
            )}
          </div>
        )}

        {/* Tunnel dashboard access option */}
        {(tunnelEnabled || tsEnabled) && (
          <div className="mt-4 pt-4 border-t border-[var(--t-line-soft)] flex items-center gap-3">
            <Toggle
              checked={tunnelDashboardAccess}
              onChange={() => handleTunnelDashboardAccess(!tunnelDashboardAccess)}
            />
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-sm leading-tight">Izinkan akses dasbor melalui domain</p>
              <Tooltip text="Jika aktif, dashboard bisa diakses lewat domain *.toolwiz.id. Jika nonaktif, hanya endpoint API yang bisa diakses via domain publik." />
            </div>
          </div>
        )}
      </AntaresPanel>

      {/* API Keys */}
      <AntaresPanel
        id="require-api-key"
        icon="vpn_key"
        title="API Keys"
        subtitle="Kunci yang dipakai klien untuk mengakses endpoint"
        action={
          <AntaresButton icon="add" size="sm" onClick={() => setShowAddModal(true)}>
            <span className="hidden sm:inline">Create Key</span>
            <span className="sm:hidden">Add</span>
          </AntaresButton>
        }
      >
        <div className="flex items-center justify-between gap-4 pb-4 mb-1 border-b border-[var(--t-line-soft)]">
          <div className="min-w-0">
            <p className="font-medium">Require API key</p>
            <p className="text-sm text-[var(--t-muted)]">
              Requests without a valid key will be rejected
            </p>
          </div>
          <Toggle
            checked={requireApiKey}
            onChange={() => handleRequireApiKey(!requireApiKey)}
          />
        </div>

        {isRemoteHost && !requireApiKey && (
          <div className="mb-4 -mt-2">
            <SecurityWarning message="Endpoint is exposed without an API key." />
          </div>
        )}

        {keys.length === 0 ? (
          <div className="text-center py-10 sm:py-12">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--t-accent-soft)] text-[var(--t-star-ink)] mb-4">
              <span className="material-symbols-outlined text-[28px]">vpn_key</span>
            </div>
            <p className="font-medium mb-1">No API keys yet</p>
            <p className="text-sm text-[var(--t-muted)] mb-4">Create your first API key to get started</p>
            <AntaresButton icon="add" onClick={() => setShowAddModal(true)}>
              Create Key
            </AntaresButton>
          </div>
        ) : (
          <div className="flex flex-col">
            {keys.map((key) => (
              <div
                key={key.id}
                className={`group py-3 border-b border-[var(--t-line-soft)] last:border-b-0 ${key.isActive === false ? "opacity-60" : ""}`}
              >
                {/* Top row: name + actions */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <p className="text-sm font-medium truncate min-w-0">{key.name}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => toggleKeyVisibility(key.id)}
                      className="p-1 hover:bg-[var(--t-raised)] rounded text-[var(--t-muted)] hover:text-[var(--t-ink)] transition-colors"
                      title={visibleKeys.has(key.id) ? "Hide key" : "Show key"}
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        {visibleKeys.has(key.id) ? "visibility_off" : "visibility"}
                      </span>
                    </button>
                    <button
                      onClick={() => copy(key.key, key.id)}
                      className="p-1 hover:bg-[var(--t-raised)] rounded text-[var(--t-muted)] hover:text-[var(--t-ink)] transition-colors"
                      title="Copy key"
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        {copied === key.id ? "check" : "content_copy"}
                      </span>
                    </button>
                    <Toggle
                      size="sm"
                      checked={key.isActive ?? true}
                      onChange={(checked) => {
                        if (key.isActive && !checked) {
                          setConfirmState({
                            title: "Pause API Key",
                            message: `Pause API key "${key.name}"?\n\nThis key will stop working immediately but can be resumed later.`,
                            onConfirm: async () => {
                              setConfirmState(null);
                              handleToggleKey(key.id, checked);
                            }
                          });
                        } else {
                          handleToggleKey(key.id, checked);
                        }
                      }}
                      title={key.isActive ? "Pause key" : "Resume key"}
                    />
                    <button
                      onClick={() => handleDeleteKey(key.id)}
                      className="p-1.5 hover:bg-[var(--t-danger)]/10 rounded text-[var(--t-danger)] transition-all"
                      title="Delete key"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                    <button
                      onClick={() => fetchModelsForKey(key)}
                      disabled={fetchingModelKey === key.id || !key.isActive}
                      className="p-1.5 hover:bg-[var(--t-accent-soft)] rounded text-[var(--t-accent)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Fetch models"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {fetchingModelKey === key.id ? "progress_activity" : "model_training"}
                      </span>
                    </button>
                  </div>
                </div>
                {/* Key value */}
                <code className="block mt-1.5 text-xs text-[var(--t-muted)] font-mono break-all leading-relaxed">
                  {visibleKeys.has(key.id) ? key.key : maskKey(key.key)}
                </code>
                {/* Meta */}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <p className="text-xs text-[var(--t-muted)]">
                    {translate("Created")} {new Date(key.createdAt).toLocaleDateString()}
                  </p>
                  {key.isActive === false && (
                    <span className="text-xs text-[var(--color-warning)]">· {translate("Paused")}</span>
                  )}
                </div>
                <KeyAccessControls
                  apiKey={key}
                  onChange={(access) => handleUpdateKeyAccess(key.id, access)}
                  onRequestRestrict={() => setConfirmState({
                    title: translate("Restrict API Key"),
                    message: `${translate("Restrict API key")} "${key.name}"?\n\n${translate("It will only be able to call the combos and models you add. Until you add one, it can call nothing.")}`,
                    onConfirm: async () => {
                      setConfirmState(null);
                      handleUpdateKeyAccess(key.id, { restricted: true, allow: key.access?.allow || [] });
                    }
                  })}
                />
              </div>
            ))}
          </div>
        )}
      </AntaresPanel>

      {/* Add Key Modal */}
      <AntaresModal
        isOpen={showAddModal}
        title="Create API Key"
        onClose={() => {
          setShowAddModal(false);
          setNewKeyName("");
        }}
      >
        <div className="flex flex-col gap-4">
          <Input variant="antares" 
            label="Key Name"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Kosongkan untuk auto (rmod-xxxxxx)"
          />
          <div className="flex gap-2">
            <Button skin="antares" onClick={handleCreateKey} fullWidth>
              Create
            </Button>
            <Button skin="antares" 
              onClick={() => {
                setShowAddModal(false);
                setNewKeyName("");
              }}
              variant="ghost"
              fullWidth
            >
              Cancel
            </Button>
          </div>
        </div>
      </AntaresModal>

      {/* Created Key Modal */}
      <AntaresModal
        isOpen={!!createdKey}
        title="API Key Created"
        onClose={() => setCreatedKey(null)}
      >
        <div className="flex flex-col gap-4">
          <div className="bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/40 rounded-lg p-4">
            <p className="text-sm text-[var(--color-warning)] mb-2 font-medium">
              Save this key now!
            </p>
            <p className="text-sm text-[var(--color-warning)]">
              This is the only time you will see this key. Store it securely.
            </p>
          </div>
          <div className="flex gap-2">
            <Input variant="antares" 
              value={createdKey || ""}
              readOnly
              className="flex-1 font-mono text-sm"
            />
            <Button skin="antares" 
              variant="secondary"
              icon={copied === "created_key" ? "check" : "content_copy"}
              onClick={() => copy(createdKey, "created_key")}
            >
              {copied === "created_key" ? "Copied!" : "Copy"}
            </Button>
          </div>
          <Button skin="antares" onClick={() => setCreatedKey(null)} fullWidth>
            Done
          </Button>
        </div>
      </AntaresModal>

      {/* Enable Tunnel Modal */}
      <AntaresModal
        isOpen={showEnableTunnelModal}
        title={translate("Enable Tunnel")}
        onClose={() => setShowEnableTunnelModal(false)}
      >
        <div className="flex flex-col gap-3.5">
          <div className="rounded-[10px] border border-[var(--t-line)] bg-[var(--t-raised)] p-3.5">
            <div className="flex items-start gap-3">
              <span className="an-panel-ico shrink-0" aria-hidden>
                <span className="material-symbols-outlined">cloud_upload</span>
              </span>
              <div className="min-w-0">
                <p className="text-[13px] sm:text-sm font-medium mb-1 text-[var(--t-ink)]">
                  {translate("Cloudflare Tunnel")}
                </p>
                <p className="text-xs text-[var(--t-muted)] leading-relaxed">
                  {translate("Expose your local 9Router to the internet. No port forwarding, no static IP needed. Share endpoint URL with your team or use it in Cursor, Cline, and other AI tools from anywhere.")}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {TUNNEL_BENEFITS.map((benefit) => (
              <div key={benefit.title} className="flex flex-col items-center text-center p-3 rounded-[10px] border border-[var(--t-line)] bg-[var(--t-raised)]">
                <span className="material-symbols-outlined text-[20px] text-[var(--t-star-ink)] mb-1">{benefit.icon}</span>
                <p className="text-xs font-medium text-[var(--t-ink)]">{translate(benefit.title)}</p>
                <p className="text-[11px] text-[var(--t-muted)] mt-0.5">{translate(benefit.desc)}</p>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 p-2.5 rounded-[10px] border border-[var(--t-line)] bg-[var(--t-raised)] text-[11px] text-[var(--t-muted)]">
            <span className="material-symbols-outlined text-[14px] text-[var(--t-star-ink)] shrink-0">info</span>
            <span>Port 7844 (TCP/UDP) • Handshake ~10-30 detik</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
            <Button skin="antares" onClick={handleEnableTunnel} fullWidth>
              {translate("Start Tunnel")}
            </Button>
            <Button skin="antares" onClick={() => setShowEnableTunnelModal(false)} variant="ghost" fullWidth>
              {translate("Cancel")}
            </Button>
          </div>
        </div>
      </AntaresModal>

      {/* Disable Cloudflare Tunnel Modal */}
      <AntaresModal
        isOpen={showDisableTunnelModal}
        title="Disable Tunnel"
        onClose={() => !tunnelLoading && setShowDisableTunnelModal(false)}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">The Cloudflare tunnel will be disconnected and your <strong>*.toolwiz.id domain will be deleted</strong>. Enabling again will generate a new domain.</p>
          <div className="flex gap-2">
            <Button skin="antares" onClick={handleDisableTunnel} fullWidth disabled={tunnelLoading} variant="danger">
              {tunnelLoading ? "Disabling..." : "Disable"}
            </Button>
            <Button skin="antares" onClick={() => setShowDisableTunnelModal(false)} variant="ghost" fullWidth disabled={tunnelLoading}>Cancel</Button>
          </div>
        </div>
      </AntaresModal>

      {/* Tailscale Modal */}
      <AntaresModal
        isOpen={showTsModal}
        title="Tailscale Funnel"
        onClose={() => { if (!tsInstalling) { setShowTsModal(false); setTsSudoPassword(""); setTsStatus(null); } }}
      >
        <div className="flex flex-col gap-4">
          {/* Checking state */}
          {tsInstalled === null && (
            <p className="text-sm text-text-muted flex items-center gap-2">
              <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
              Checking...
            </p>
          )}

          {/* Not installed */}
          {tsInstalled === false && !tsInstalling && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text-muted">Tailscale is not installed. Install it to enable Funnel.</p>
              <div className="flex gap-2">
                <Button skin="antares" onClick={handleInstallTailscale} fullWidth>
                  Install Tailscale
                </Button>
                <Button skin="antares" onClick={() => setShowTsModal(false)} variant="ghost" fullWidth>Cancel</Button>
              </div>
            </div>
          )}

          {/* Installing with progress log */}
          {tsInstalling && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                Installing Tailscale...
              </div>
              {tsInstallLog.length > 0 && (
                <div ref={tsLogRef} className="bg-[var(--color-surface-2)] rounded p-2 max-h-40 overflow-y-auto font-mono text-xs text-text-muted">
                  {tsInstallLog.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Installed: show Connect button */}
          {tsInstalled === true && !tsInstalling && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm text-[var(--color-success)]">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                Tailscale installed
              </div>
              <div className="flex gap-2">
                <Button skin="antares" 
                  onClick={() => handleConnectTailscale()}
                  fullWidth
                >
                  Connect
                </Button>
                <Button skin="antares" onClick={() => setShowTsModal(false)} variant="ghost" fullWidth>Cancel</Button>
              </div>
            </div>
          )}

          {tsStatus && <StatusAlert status={tsStatus} />}
        </div>
      </AntaresModal>

      {/* Disable Tailscale Modal */}
      <AntaresModal
        isOpen={showDisableTsModal}
        title="Disable Tailscale"
        onClose={() => !tsLoading && setShowDisableTsModal(false)}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">Tailscale Funnel will be stopped. Remote access via Tailscale URL will stop working.</p>
          <div className="flex gap-2">
            <Button skin="antares" onClick={handleDisableTailscale} fullWidth disabled={tsLoading} variant="danger">
              {tsLoading ? "Disabling..." : "Disable"}
            </Button>
            <Button skin="antares" onClick={() => setShowDisableTsModal(false)} variant="ghost" fullWidth disabled={tsLoading}>Cancel</Button>
          </div>
        </div>
      </AntaresModal>

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm}
        title={confirmState?.title || "Confirm"}
        message={confirmState?.message}
        variant="danger"
      />

      {/* Fetch Models Modal */}
      <AntaresModal
        isOpen={showModelsModal}
        title="Fetched Models"
        onClose={() => { setShowModelsModal(false); setFetchedModelsData(null); }}
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs text-[var(--t-muted)]">
            {fetchedModelsData && fetchedModelsData.object === "list"
              ? `${fetchedModelsData.data?.length ?? 0} models returned`
              : fetchedModelsData?.error?.message ?? ""}
          </p>
          {fetchedModelsData?.data && fetchedModelsData.data.length > 0 && (
            <div className="flex flex-col gap-1">
              {fetchedModelsData.data.map((m, i) => (
                <div key={i} className="font-mono text-xs text-[var(--t-muted)]">{m.id}</div>
              ))}
            </div>
          )}
          {fetchedModelsData?.data && fetchedModelsData.data.length > 0 && (
            <Button
              skin="antares"
              icon={copied === "fetched_models" ? "check" : "content_copy"}
              onClick={() => {
                const ids = fetchedModelsData.data.map(m => m.id).join("\n");
                copy(ids, "fetched_models");
              }}
              variant="ghost"
            >
              {copied === "fetched_models" ? "Copied!" : "Copy All"}
            </Button>
          )}
        </div>
      </AntaresModal>
    </div>
  );
}


APIPageClient.propTypes = {
  machineId: PropTypes.string.isRequired,
};




