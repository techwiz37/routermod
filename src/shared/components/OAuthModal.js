"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import PropTypes from "prop-types";
import { Button, Input } from "@/shared/components";
import AntaresModal from "./AntaresModal";
import { SurfaceSkinContext } from "./SurfaceSkinContext";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { translate } from "@/i18n/runtime";

function friendlyError(msg) {
  if (!msg) return "An unknown error occurred.";
  const m = String(msg);
  if (/fetch failed|network|ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(m))
    return "Could not connect to the server. Check your internet connection and try again.";
  if (/timeout/i.test(m))
    return "Connection timed out. Please try again.";
  if (/unauthorized|401/i.test(m))
    return "Token or credentials are invalid. Make sure you are logged in correctly.";
  if (/forbidden|403/i.test(m))
    return "Access denied. The account does not have permission for this action.";
  if (/not found|404/i.test(m))
    return "Endpoint not found. The provider may not be configured.";
  if (/invalid.*token|token.*invalid|token.*expired|expired.*token/i.test(m))
    return "Token is invalid or expired. Please reconnect.";
  if (/invalid.*code|code.*invalid/i.test(m))
    return "Authorization code is invalid or already used.";
  if (/popup.*blocked|blocked.*popup/i.test(m))
    return "Popup blocked by the browser. Allow popups for this site and try again.";
  if (/cancelled|canceled|cancel/i.test(m))
    return "Operation cancelled.";
  if (/No authorization URL/i.test(m))
    return "Provider did not return an authorization URL. Check the provider configuration.";
  if (/Authentication failed/i.test(m))
    return "Authentication failed. Make sure your account is active and try again.";
  if (/invalid_grant/i.test(m))
    return "Authorization code is invalid or expired. Please restart the login process.";
  if (/invalid_client/i.test(m))
    return "Client configuration is invalid. Check the Client ID and Client Secret.";
  if (/access_denied/i.test(m))
    return "Access denied by the provider. Make sure you approved the requested permissions.";
  return m.split("\n")[0];
}

const PROXY_OAUTH_PROVIDERS = new Set(["trae", "windsurf", "zed", "antigravity"]);

const PASTE_TOKEN_PROVIDERS = {
  trae: {
    label: "Cloud-IDE-JWT",
    instructions:
      "Sign in at trae.ai (or solo.trae.ai), open DevTools → Network, copy the Cloud-IDE-JWT token from any request's Authorization header (~14-day lifetime).",
    placeholder: "Paste Cloud-IDE-JWT here...",
    ideName: "Trae",
    ideOptional: true, // token can be grabbed from DevTools without the IDE
  },
  windsurf: {
    label: "Windsurf API key",
    instructions:
      "In the Windsurf/VS Code IDE, run the \"Windsurf: Provide Auth Token\" command, then copy the displayed sk-ws-... key.",
    placeholder: "Paste sk-ws-... key here...",
    ideName: "Windsurf",
    ideOptional: false,
  },
};

export default function OAuthModal({ isOpen, provider, providerInfo, onSuccess, onClose, oauthMeta, idcConfig }) {
  const [step, setStep] = useState("waiting"); // waiting | input | success | error
  const [authData, setAuthData] = useState(null);
  const [callbackUrl, setCallbackUrl] = useState("");
  const [error, setError] = useState(null);
  const [isDeviceCode, setIsDeviceCode] = useState(false);
  const [deviceData, setDeviceData] = useState(null);
  const [polling, setPolling] = useState(false);
  const [authMode, setAuthMode] = useState("browser"); // "browser" | "paste-token"
  const [pasteToken, setPasteToken] = useState("");
  const [ideStatus, setIdeStatus] = useState(null);
  const popupRef = useRef(null);
  const pollingAbortRef = useRef(false);
  const openedRef = useRef(false);
  const flowRef = useRef({ proxyStarted: false, proxyProvider: null, stopSent: false });
  const onSuccessRef = useRef(onSuccess);
  const onCloseRef = useRef(onClose);
  const isOpenRef = useRef(isOpen);
  const startOAuthFlowRef = useRef(null);
  const { copied, copy } = useCopyToClipboard();

  const [isLocalhost] = useState(() => typeof window !== "undefined");
  const [placeholderUrl] = useState(() => (typeof window !== "undefined" ? `${window.location.origin}/callback?code=...` : "/callback?code=..."));
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [manualExpanded, setManualExpanded] = useState(false);
  const callbackProcessedRef = useRef(false);


  const exchangeTokens = useCallback(async (code, state) => {
    if (!authData) return;
    try {
      const res = await fetch(`/api/oauth/${provider}/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          redirectUri: authData.redirectUri,
          codeVerifier: authData.codeVerifier,
          state,
          ...(authData.systemId ? { systemId: authData.systemId } : {}),
          ...(oauthMeta ? { meta: oauthMeta } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setStep("success");
      onSuccessRef.current?.();
    } catch (err) {
      setError(friendlyError(err.message));      setStep("error");
    }
  }, [authData, provider, oauthMeta]);

  const completeXaiManualCode = useCallback(async (code) => {
    if (!authData?.state) return;
    try {
      const res = await fetch("/api/oauth/xai/manual-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, state: authData.state }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setStep("success");
      onSuccessRef.current?.();
    } catch (err) {
      setError(friendlyError(err.message));      setStep("error");
    }
  }, [authData]);

  const startPolling = useCallback(async (deviceCode, codeVerifier, interval, extraData, deadlineMs) => {
    pollingAbortRef.current = false;
    setPolling(true);
    const startedAt = Date.now();
    const deadline = startedAt + (Number.isFinite(deadlineMs) && deadlineMs > 0 ? deadlineMs : 120_000);

    while (Date.now() < deadline) {
      if (pollingAbortRef.current) {
        console.log("[OAuthModal] Polling aborted");
        setPolling(false);
        return;
      }

      await new Promise((r) => setTimeout(r, interval * 1000));

      if (pollingAbortRef.current) {
        console.log("[OAuthModal] Polling aborted after sleep");
        setPolling(false);
        return;
      }

      try {
        const res = await fetch(`/api/oauth/${provider}/poll`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceCode, codeVerifier, extraData }),
        });

        const data = await res.json();

        if (data.success) {
          pollingAbortRef.current = true; // Stop polling immediately
          setStep("success");
          setPolling(false);
          onSuccessRef.current?.();
          return;
        }

        if (data.error === "expired_token" || data.error === "access_denied" || data.fatal) {
          throw new Error(data.errorDescription || data.error);
        }

        if (data.error === "slow_down") {
          interval = Math.min(interval + 5, 30);
        }
      } catch (err) {
        setError(friendlyError(err.message));        setStep("error");
        setPolling(false);
        return;
      }
    }

    setError("Authorization timed out. Please try again.");
    setStep("error");
    setPolling(false);
  }, [provider]);

  const stopOwnedProxy = useCallback(() => {
    const flow = flowRef.current;
    if (flow.proxyStarted && !flow.stopSent && flow.proxyProvider) {
      flow.stopSent = true;
      fetch(`/api/oauth/${flow.proxyProvider}/stop-proxy`).catch(() => {});
    }
  }, []);

  const startProxyFlow = useCallback(async (providerId) => {
    const startRes = await fetch(`/api/oauth/${providerId}/start-proxy`);
    const startData = await startRes.json();
    if (!startRes.ok || !startData.success || !startData.callbackUrl) {
      throw new Error(startData.reason || startData.error || `Failed to start ${providerId} callback server`);
    }
    flowRef.current.proxyStarted = true;
    flowRef.current.proxyProvider = providerId;
    flowRef.current.stopSent = false;
    if (!isOpenRef.current) {
      stopOwnedProxy();
      return;
    }
    const authorizeUrl = new URL(`/api/oauth/${providerId}/authorize`, window.location.origin);
    authorizeUrl.searchParams.set("redirect_uri", startData.callbackUrl);
    const authRes = await fetch(authorizeUrl);
    const authData = await authRes.json();
    if (!authRes.ok) {
      stopOwnedProxy();
      throw new Error(authData.error);
    }
    if (!isOpenRef.current) {
      stopOwnedProxy();
      return;
    }
    const regBody = { state: authData.state };
    if (authData.codeVerifier) regBody.codeVerifier = authData.codeVerifier;
    if (authData.systemId) regBody.systemId = authData.systemId;
    if (providerId === "antigravity") regBody.redirectUri = startData.callbackUrl;
    const regRes = await fetch(`/api/oauth/${providerId}/register-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(regBody),
    });
    let regData = null;
    try {
      regData = await regRes.json();
    } catch {
      regData = null;
    }
    if (!regRes.ok || regData?.success === false) {
      stopOwnedProxy();
      throw new Error(regData?.error || "Failed to register login session; please retry");
    }
    if (!isOpenRef.current) return; // closed mid-flight: close effect owns cleanup now
    setAuthData({ ...authData, proxyProvider: providerId });
    setStep("waiting");
    popupRef.current = window.open(authData.authUrl, "oauth_popup", "width=600,height=700");
    if (!popupRef.current) setStep("input"); // popup blocked → fall back to manual paste
  }, [stopOwnedProxy]);

  const startOAuthFlow = async () => {
    if (!provider) return;
    try {
      setError(null);

      if (PROXY_OAUTH_PROVIDERS.has(provider) && authMode === "browser") {
        await startProxyFlow(provider);
        return;
      }

      const deviceCodeProviders = [
        "github",
        "kiro",
        "kimi",
        "kimi-coding",
        "kilocode",
        "codebuddy-cn",
        "codebuddy-intl",
        "qoder",
        "qoder-cn",
        "grok-cli",
        "muse",
        "glm",
        "minimax-code",
        "minimax-code-global",
        "nous",
      ];
      if (deviceCodeProviders.includes(provider)) {
        setIsDeviceCode(true);
        setStep("waiting");

        const deviceCodeUrl = new URL(`/api/oauth/${provider}/device-code`, window.location.origin);
        if (provider === "kiro" && idcConfig?.startUrl) {
          deviceCodeUrl.searchParams.set("start_url", idcConfig.startUrl);
          if (idcConfig.region) {
            deviceCodeUrl.searchParams.set("region", idcConfig.region);
          }
          deviceCodeUrl.searchParams.set("auth_method", "idc");
        }
        const res = await fetch(deviceCodeUrl.toString());
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        setDeviceData(data);

        const verifyUrl = data.verification_uri_complete || data.verification_uri;
        if (verifyUrl) window.open(verifyUrl, "_blank", "noopener,noreferrer");

        const extraData = provider === "kiro"
          ? {
              _clientId: data._clientId,
              _clientSecret: data._clientSecret,
              _region: data._region,
              _authMethod: data._authMethod,
              _startUrl: data._startUrl,
            }
          : (provider === "qoder" || provider === "qoder-cn")
          ? {
              _qoderNonce: data._qoderNonce,
              _qoderMachineId: data._qoderMachineId,
              _qoderVerifier: data.codeVerifier,
            }
          : (provider === "kimi" || provider === "kimi-coding")
          ? { _kimiDeviceId: data._kimiDeviceId }
          : provider === "glm"
          ? { _zcodePollToken: data._zcodePollToken }
          : (provider === "minimax-code" || provider === "minimax-code-global")
          ? { _minimaxPollByUser: data._minimaxPollByUser }
          : null;
        startPolling(
          data.device_code || data.user_code,
          data.codeVerifier,
          data.interval || 5,
          extraData,
          Number.isFinite(data.expires_in) && data.expires_in > 0
            ? data.expires_in * 1000
            : undefined,
        );
        return;
      }

      let redirectUri;
      if (provider === "codex") {
        redirectUri = "http://localhost:1455/auth/callback";
      } else if (provider === "xai") {
        redirectUri = "http://127.0.0.1:56121/callback";
      } else {
        redirectUri = `${window.location.origin}/callback`;
      }

      const authorizeUrl = new URL(`/api/oauth/${provider}/authorize`, window.location.origin);
      authorizeUrl.searchParams.set("redirect_uri", redirectUri);
      if (oauthMeta) {
        Object.entries(oauthMeta).forEach(([k, v]) => { if (v) authorizeUrl.searchParams.set(k, v); });
      }
      const res = await fetch(authorizeUrl.toString());
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      let codexProxyActive = false;
      let codexServerSide = false;
      if (provider === "codex") {
        try {
          const proxyUrl = new URL(`/api/oauth/codex/start-proxy`, window.location.origin);
          proxyUrl.searchParams.set("app_port", appPort);
          proxyUrl.searchParams.set("state", data.state);
          proxyUrl.searchParams.set("code_verifier", data.codeVerifier);
          proxyUrl.searchParams.set("redirect_uri", redirectUri);
          const proxyRes = await fetch(proxyUrl.toString());
          const proxyData = await proxyRes.json();
          codexProxyActive = proxyData.success;
          codexServerSide = !!proxyData.serverSide;
        } catch {
          codexProxyActive = false;
        }
      }

      let xaiProxyActive = false;
      let xaiServerSide = false;
      if (provider === "xai") {
        try {
          const proxyUrl = new URL(`/api/oauth/xai/start-proxy`, window.location.origin);
          proxyUrl.searchParams.set("app_port", appPort);
          proxyUrl.searchParams.set("state", data.state);
          proxyUrl.searchParams.set("code_verifier", data.codeVerifier);
          proxyUrl.searchParams.set("redirect_uri", redirectUri);
          const proxyRes = await fetch(proxyUrl.toString());
          const proxyData = await proxyRes.json();
          xaiProxyActive = proxyData.success;
          xaiServerSide = !!proxyData.serverSide;
          if (!xaiProxyActive && proxyData.reason === "port_busy") {
            throw new Error("Port 56121 in use; close the conflicting process and retry");
          }
        } catch (e) {
          if (e?.message) throw e;
          xaiProxyActive = false;
        }
      }

      setAuthData({ ...data, redirectUri, codexServerSide, xaiServerSide });

      if ((provider === "codex" && codexProxyActive) || (provider === "xai" && xaiProxyActive)) {
        flowRef.current.proxyStarted = true;
        flowRef.current.proxyProvider = provider;
        flowRef.current.stopSent = false;
      }

      if (!data.authUrl) {
        if (data.flowType === "device_code") {
          throw new Error(
            `Provider ${provider} uses device-code login but is not wired in the OAuth modal device-code list`
          );
        }
        throw new Error("No authorization URL returned from OAuth provider");
      }

      if (provider === "codex" && codexProxyActive) {
        setStep("waiting");
        popupRef.current = window.open(data.authUrl, "oauth_popup", "width=600,height=700");
        if (!popupRef.current) {
          setStep("input");
        }
      } else if (provider === "xai" && xaiProxyActive) {
        setStep("waiting");
        popupRef.current = window.open(data.authUrl, "oauth_popup", "width=600,height=700");
        if (!popupRef.current) {
          setStep("input");
        }
      } else if (!isLocalhost || provider === "codex" || provider === "xai") {
        setStep("input");
        window.open(data.authUrl, "_blank");
      } else {
        setStep("waiting");
        popupRef.current = window.open(data.authUrl, "oauth_popup", "width=600,height=700");
        if (!popupRef.current) {
          setStep("input");
        }
      }
    } catch (err) {
      setError(friendlyError(err.message));      setStep("error");
    }
  };

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onCloseRef.current = onClose;
    isOpenRef.current = isOpen;
    startOAuthFlowRef.current = startOAuthFlow;
  });

  useEffect(() => {
    if (!isOpen || !provider) return;
    if (openedRef.current) return;
    openedRef.current = true;
    setAuthData(null);
    setCallbackUrl("");
    setError(null);
    setIsDeviceCode(false);
    setDeviceData(null);
    setPolling(false);
    setAuthMode("browser");
    setPasteToken("");
    setIdeStatus(null);
    pollingAbortRef.current = false;
    flowRef.current = { proxyStarted: false, proxyProvider: null, stopSent: false };
    if (PASTE_TOKEN_PROVIDERS[provider]) {
      fetch(`/api/oauth/${provider}/ide-status`)
        .then((r) => r.json())
        .then((data) => setIdeStatus(data))
        .catch(() => setIdeStatus({ installed: false, path: null }));
    }
    startOAuthFlowRef.current();
  }, [isOpen, provider]);

  useEffect(() => {
    if (isOpen) return;
    pollingAbortRef.current = true;
    openedRef.current = false;
    stopOwnedProxy();
    flowRef.current = { proxyStarted: false, proxyProvider: null, stopSent: false };
  }, [isOpen, provider, stopOwnedProxy]);

  useEffect(() => {
    const pollProvider = authData?.codexServerSide
      ? "codex"
      : authData?.xaiServerSide
        ? "xai"
        : authData?.proxyProvider
          ? authData.proxyProvider
          : null;
    if (!pollProvider || !authData?.state) return;
    if (callbackProcessedRef.current) return;
    let cancelled = false;
    const POLL_INTERVAL_MS = 1500;
    const MAX_ATTEMPTS = 200; // ~5 minutes
    let attempts = 0;

    const tick = async () => {
      if (cancelled || callbackProcessedRef.current) return;
      attempts += 1;
      try {
          const res = await fetch(`/api/oauth/${pollProvider}/poll-status?state=${encodeURIComponent(authData.state)}`);
        const data = await res.json();
        if (cancelled || callbackProcessedRef.current) return;
        if (data.status === "done") {
          callbackProcessedRef.current = true;
          setStep("success");
          onSuccessRef.current?.();
          return;
        }
        if (data.status === "error") {
          callbackProcessedRef.current = true;
          setError(friendlyError(data.error) || "Authentication failed. Please try again.");
          setStep("error");
          return;
        }
      } catch {
      }
      if (attempts >= MAX_ATTEMPTS) {
        callbackProcessedRef.current = true;
        setError("Authentication timed out. Please try again.");
        setStep("error");
        return;
      }
      setTimeout(tick, POLL_INTERVAL_MS);
    };
    setTimeout(tick, POLL_INTERVAL_MS);
    return () => { cancelled = true; };
  }, [authData]);

  useEffect(() => {
    if (!authData) return;
    callbackProcessedRef.current = false; // Reset when authData changes

    const handleCallback = async (data) => {
      if (callbackProcessedRef.current) return; // Already processed

      const { code, token, state, error: callbackError, errorDescription } = data;

      if (callbackError) {
        callbackProcessedRef.current = true;
        setError(friendlyError(errorDescription || callbackError));
        setStep("error");
        return;
      }

      if (token || code) {
        callbackProcessedRef.current = true;
        await exchangeTokens(token || code, state);
      }
    };

    const handleMessage = (event) => {
      const isLocalhost = event.origin.includes("localhost") || event.origin.includes("127.0.0.1");
      const isSameOrigin = event.origin === window.location.origin;
      if (!isLocalhost && !isSameOrigin) return;
      
      if (event.data?.type === "oauth_callback") {
        handleCallback(event.data.data);
      }
    };
    window.addEventListener("message", handleMessage);

    let channel;
    try {
      channel = new BroadcastChannel("oauth_callback");
      channel.onmessage = (event) => handleCallback(event.data);
    } catch (e) {
      console.log("BroadcastChannel not supported");
    }

    const handleStorage = (event) => {
      if (event.key === "oauth_callback" && event.newValue) {
        try {
          const data = JSON.parse(event.newValue);
          handleCallback(data);
          localStorage.removeItem("oauth_callback");
        } catch (e) {
          console.log("Failed to parse localStorage data");
        }
      }
    };
    window.addEventListener("storage", handleStorage);

    try {
      const stored = localStorage.getItem("oauth_callback");
      if (stored) {
        const data = JSON.parse(stored);
        if (data.timestamp && Date.now() - data.timestamp < 30000) {
          handleCallback(data);
        }
        localStorage.removeItem("oauth_callback");
      }
    } catch {
    }

    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
      if (channel) channel.close();
    };
  }, [authData, exchangeTokens]);

  const processOAuthCallback = useCallback(async (rawInput) => {
    if (!rawInput || typeof rawInput !== "string" || callbackProcessedRef.current) return false;
    let input = rawInput.trim();
    if (!input) return false;

    // Check if input looks like an OAuth URL or authorization code
    const isUrl = input.startsWith("http://") || input.startsWith("https://");
    const hasCodeParam = input.includes("code=");
    const isLoopback = input.includes("127.0.0.1") || input.includes("localhost");
    const isRawGoogleCode = (input.startsWith("4/") || input.startsWith("4%2F")) && input.length >= 20;
    const isJwt = input.startsWith("eyJ") && input.includes(".");

    if (!isUrl && !hasCodeParam && !isLoopback && !isRawGoogleCode && !isJwt && provider !== "xai" && provider !== "kimchi") {
      return false;
    }

    try {
      setAutoDetecting(true);
      setError(null);
      setCallbackUrl(input);

      if (authMode === "paste-token" && PASTE_TOKEN_PROVIDERS[provider]) {
        const res = await fetch(`/api/oauth/${provider}/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: input }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        callbackProcessedRef.current = true;
        setStep("success");
        onSuccessRef.current?.();
        return true;
      }

      let code = input;
      let redirectUri = authData?.redirectUri;
      if (code.includes("code=") || code.startsWith("http")) {
        try {
          const u = new URL(code, "http://localhost");
          const extractedCode = u.searchParams.get("code");
          if (extractedCode) code = extractedCode;
          if (code.startsWith("http") && u.origin && u.pathname) {
            redirectUri = `${u.origin}${u.pathname}`;
          } else if (!redirectUri && u.origin && u.pathname) {
            redirectUri = `${u.origin}${u.pathname}`;
          }
        } catch {}
      }

      if (code.includes("%")) {
        try { code = decodeURIComponent(code); } catch {}
      }

      if (PROXY_OAUTH_PROVIDERS.has(provider) || provider === "antigravity") {
        const res = await fetch(`/api/oauth/${provider}/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            state: authData?.state,
            ...(redirectUri ? { redirectUri } : {}),
            ...(authData?.codeVerifier ? { codeVerifier: authData.codeVerifier } : {}),
            ...(authData?.systemId ? { systemId: authData.systemId } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        callbackProcessedRef.current = true;
        setStep("success");
        onSuccessRef.current?.();
        return true;
      }

      if (isJwt) {
        await exchangeTokens(code, null);
        callbackProcessedRef.current = true;
        return true;
      }

      if (provider === "xai" && input && !input.includes("://") && !input.includes("?") && !input.includes("code=")) {
        await completeXaiManualCode(input);
        callbackProcessedRef.current = true;
        return true;
      }

      if (provider === "kimchi" && input && !input.includes("://") && !input.includes("?")) {
        await exchangeTokens(input, null);
        callbackProcessedRef.current = true;
        return true;
      }

      const url = new URL(input);
      const extractedCode = url.searchParams.get("code");
      const token = url.searchParams.get("token");
      const state = url.searchParams.get("state");
      const errorParam = url.searchParams.get("error");

      if (errorParam) {
        throw new Error(url.searchParams.get("error_description") || errorParam);
      }

      if (!extractedCode && !token) {
        throw new Error(
          provider === "xai"
            ? "Paste the callback URL or copied xAI code"
            : provider === "kimchi"
              ? "No Kimchi token found in URL"
              : "No authorization code found in URL"
        );
      }

      await exchangeTokens(token || extractedCode, state);
      callbackProcessedRef.current = true;
      return true;
    } catch (err) {
      setError(friendlyError(err.message));
      return false;
    } finally {
      setAutoDetecting(false);
    }
  }, [authData, authMode, completeXaiManualCode, exchangeTokens, provider]);

  // Auto-detect callback URL or code from clipboard when returning to the tab
  useEffect(() => {
    if (!isOpen || (step !== "waiting" && step !== "input")) return;
    if (!PROXY_OAUTH_PROVIDERS.has(provider) && provider !== "xai" && provider !== "codex") return;

    let activeCheck = false;
    let lastChecked = "";

    const checkClipboard = async () => {
      if (activeCheck || callbackProcessedRef.current) return;
      activeCheck = true;
      try {
        if (typeof navigator === "undefined" || !navigator.clipboard?.readText) return;
        const text = await navigator.clipboard.readText();
        if (!text || typeof text !== "string") return;
        const trimmed = text.trim();
        if (!trimmed || trimmed === lastChecked) return;
        lastChecked = trimmed;

        const hasCodeParam = trimmed.includes("code=");
        const isLoopback = trimmed.includes("127.0.0.1") || trimmed.includes("localhost");
        const isRawGoogleCode = (trimmed.startsWith("4/") || trimmed.startsWith("4%2F")) && trimmed.length >= 20;

        if (hasCodeParam || isLoopback || isRawGoogleCode) {
          console.log("[OAuthModal] Auto-detected OAuth callback in clipboard!");
          await processOAuthCallback(trimmed);
        }
      } catch {
      } finally {
        activeCheck = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkClipboard();
      }
    };

    const handleFocus = () => {
      checkClipboard();
    };

    const handlePointerDown = () => {
      checkClipboard();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen, step, provider, processOAuthCallback]);

  const handleManualSubmit = async () => {
    if (authMode === "paste-token") {
      await processOAuthCallback(pasteToken);
    } else {
      await processOAuthCallback(callbackUrl);
    }
  };

  const handleClose = useCallback(() => {
    stopOwnedProxy();
    onCloseRef.current();
  }, [stopOwnedProxy]);

  if (!provider || !providerInfo) return null;
  const isXaiProvider = provider === "xai";
  const isKimchiProvider = provider === "kimchi";
  const deviceLoginUrl = deviceData?.verification_uri_complete || deviceData?.verification_uri || "";
  const modalTitle = isXaiProvider ? "Connect Grok Build OAuth" : `Connect ${providerInfo.name}`;
  const manualPlaceholder = isXaiProvider
    ? "http://127.0.0.1:56121/callback?code=... or copied code"
    : isKimchiProvider
      ? `${placeholderUrl.replace("code=...", "token=...")} or copied token`
      : placeholderUrl;

  return (
    <AntaresModal isOpen={isOpen} title={modalTitle} onClose={handleClose} size="lg">
      <SurfaceSkinContext.Provider value="antares">
        <div className="flex flex-col gap-4">
        {/* Proxy OAuth (trae/windsurf/zed): browser flow; paste-token only when configured */}
        {PROXY_OAUTH_PROVIDERS.has(provider) && (step === "waiting" || step === "input" || step === "error") && (
          <>
            {PASTE_TOKEN_PROVIDERS[provider] && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setAuthMode("browser"); setError(null); setStep("waiting"); startOAuthFlow(); }}
                  className={`min-h-11 flex-1 rounded-lg border px-3 text-sm transition-colors ${authMode === "browser" ? "border-primary bg-primary/10 text-[var(--t-accent)]" : "border-[var(--t-line)] text-[var(--t-muted)] hover:text-[var(--t-accent)]"}`}
                >
                  🌐 Sign in with browser
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode("paste-token"); setError(null); setStep("input"); }}
                  className={`min-h-11 flex-1 rounded-lg border px-3 text-sm transition-colors ${authMode === "paste-token" ? "border-primary bg-primary/10 text-[var(--t-accent)]" : "border-[var(--t-line)] text-[var(--t-muted)] hover:text-[var(--t-accent)]"}`}
                >
                  🔑 Paste token
                </button>
              </div>
            )}

            {authMode === "browser" && (
              <div className="space-y-4">
                {/* Status indicator */}
                <div className="flex min-w-0 items-center gap-2 px-3 py-2.5 border border-[var(--t-line)] rounded-lg bg-[var(--t-raised)]">
                  <span className="material-symbols-outlined shrink-0 text-base text-[var(--t-accent)] animate-spin">progress_activity</span>
                  <span className="text-xs font-medium leading-snug sm:text-sm">
                    {autoDetecting
                      ? translate("Processing callback from clipboard...")
                      : translate("Waiting for browser authorization…")}
                  </span>
                </div>

                {/* Open login button (crucial for mobile when popup is blocked or opens in background) */}
                {authData?.authUrl && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      onClick={() => window.open(authData.authUrl, "_blank")}
                      icon="open_in_new"
                      className="w-full sm:flex-1"
                    >
                      Buka Halaman Login {providerInfo.name}
                    </Button>
                    <Button
                      variant="secondary"
                      icon={copied === "auth_url" ? "check" : "content_copy"}
                      onClick={() => copy(authData.authUrl, "auth_url")}
                      className="w-full sm:w-auto"
                    >
                      Copy Link
                    </Button>
                  </div>
                )}

                {/* Automated Connect Card for Remote/Mobile Users */}
                <div className="rounded-xl border-2 border-[var(--t-line)] bg-[var(--t-raised)] p-3 space-y-3 shadow-sm sm:p-4">
                  <div className="flex items-start gap-2 text-xs font-semibold leading-snug text-[var(--t-accent)] sm:text-sm">
                    <span className="material-symbols-outlined shrink-0 text-lg animate-pulse">magic_button</span>
                    <span>{translate("Access from phone / external network (automatic)")}</span>
                  </div>
                  <ol className="break-words text-[11px] text-[var(--t-muted)] space-y-1.5 list-decimal list-inside leading-relaxed sm:text-xs">
                    <li>
                      {translate("Open the login page and choose your {provider} account.").replace("{provider}", providerInfo.name)}
                    </li>
                    <li>
                      {translate("When the")}{" "}
                      <code className="break-all text-[var(--t-accent)] font-mono font-medium">127.0.0.1</code>{" "}
                      {translate("page appears (\"connection refused\"),")}{" "}
                      <strong>{translate("copy the link")}</strong>{" "}
                      {translate("from the browser address bar.")}
                    </li>
                    <li>
                      {translate("Return to this tab — the system will automatically detect and connect, no input needed!")}
                    </li>
                  </ol>
                  <Button
                    onClick={async () => {
                      try {
                        setAutoDetecting(true);
                        const text = await navigator.clipboard?.readText();
                        if (text) {
                          const ok = await processOAuthCallback(text);
                          if (!ok) {
                            setError("Clipboard does not contain a valid callback URL/code. Make sure the link from the 127.0.0.1 tab was copied.");
                          }
                        } else {
                          setError("Clipboard is empty. Copy the link from the browser address bar first.");
                        }
                      } catch (err) {
                        setError("Clipboard permission blocked by the browser. Please paste the link below.");
                        setManualExpanded(true);
                      } finally {
                        setAutoDetecting(false);
                      }
                    }}
                    loading={autoDetecting}
                    className="min-h-11 w-full text-xs font-medium sm:text-sm"
                    icon="auto_awesome"
                  >
                    ⚡ Sambungkan Otomatis Sekarang
                  </Button>
                </div>

                {/* Collapsible Manual Input as Fallback */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setManualExpanded(prev => !prev)}
                    className="flex min-h-11 items-center gap-1.5 py-2 text-left text-xs text-[var(--t-muted)] hover:text-[var(--t-ink)] transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">{manualExpanded ? "expand_less" : "expand_more"}</span>
                    <span>Input manual link callback (opsional)</span>
                  </button>

                  {manualExpanded && (
                    <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={callbackUrl}
                        onChange={(e) => setCallbackUrl(e.target.value)}
                        placeholder="http://127.0.0.1:.../callback?code=..."
                        className="w-full font-mono text-xs sm:flex-1"
                      />
                      <Button
                        onClick={handleManualSubmit}
                        disabled={!callbackUrl.trim() || autoDetecting}
                        size="sm"
                        className="min-h-11 w-full sm:w-auto sm:min-h-0"
                      >
                        Hubungkan
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {authMode === "paste-token" && PASTE_TOKEN_PROVIDERS[provider] && (
              <div className="space-y-3">
                {ideStatus && !ideStatus.installed && (
                  <div className={`px-3 py-2 rounded-lg text-sm ${PASTE_TOKEN_PROVIDERS[provider].ideOptional ? "bg-blue-500/10 text-blue-700 dark:text-blue-300" : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300"}`}>
                    {PASTE_TOKEN_PROVIDERS[provider].ideName} IDE not detected.
                    {PASTE_TOKEN_PROVIDERS[provider].ideOptional
                      ? " You can still grab the token from DevTools."
                      : ` Install ${PASTE_TOKEN_PROVIDERS[provider].ideName} IDE to get the token, or use "Sign in with browser".`}
                  </div>
                )}
                <p className="text-sm text-[var(--t-muted)]">{PASTE_TOKEN_PROVIDERS[provider].instructions}</p>
                <Input
                  value={pasteToken}
                  onChange={(e) => setPasteToken(e.target.value)}
                  placeholder={PASTE_TOKEN_PROVIDERS[provider].placeholder}
                  className="font-mono text-xs"
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={handleManualSubmit} fullWidth disabled={!pasteToken}>Connect</Button>
                  <Button onClick={handleClose} variant="ghost" fullWidth>Cancel</Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Waiting + Manual Input combined (non-device-code, non-proxy) */}
        {(step === "waiting" || step === "input") && !isDeviceCode && !PROXY_OAUTH_PROVIDERS.has(provider) && (
          <>
            {/* Option A: Auto via popup */}
            <div className="flex items-center gap-2 px-3 py-2 border border-[var(--t-line)] rounded-lg bg-[var(--t-raised)]">
              <span className="material-symbols-outlined text-base text-[var(--t-accent)] animate-spin">
                progress_activity
              </span>
              <span className="text-sm">
                {isXaiProvider ? "Waiting for Grok Build OAuth…" : "Waiting for popup authorization…"}
              </span>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-2 sm:gap-3 my-1">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] sm:text-xs text-[var(--t-muted)] uppercase tracking-wider text-center">Or paste callback URL manually</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Option B: Manual paste */}
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">
                  Step 1: Open this {isXaiProvider ? "Grok Build OAuth URL" : "URL"} in your browser
                </p>
                <div className="flex gap-2">
                  <Input value={authData?.authUrl || ""} readOnly className="flex-1 font-mono text-xs" />
                  <Button variant="secondary" icon={copied === "auth_url" ? "check" : "content_copy"} onClick={() => copy(authData?.authUrl, "auth_url")} disabled={!authData?.authUrl}>
                    Copy
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">
                  Step 2: Paste the {provider === "xai" ? "callback URL or copied code" : isKimchiProvider ? "callback URL or copied token" : "callback URL"} here
                </p>
                <p className="text-xs text-[var(--t-muted)] mb-2">
                  {provider === "xai"
                    ? "If xAI shows a code instead of redirecting, paste that code here."
                    : isKimchiProvider
                      ? "After authorization, copy the full callback URL or token from your browser."
                    : "After authorization, copy the full URL from your browser."}
                </p>
                <Input
                  value={callbackUrl}
                  onChange={(e) => setCallbackUrl(e.target.value)}
                  placeholder={manualPlaceholder}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleManualSubmit} fullWidth disabled={!callbackUrl}>
                Connect
              </Button>
              <Button onClick={handleClose} variant="ghost" fullWidth>
                Cancel
              </Button>
            </div>
          </>
        )}

        {/* Device Code Flow - Waiting */}
        {step === "waiting" && isDeviceCode && deviceData && (
          <>
            <div className="text-center py-2 sm:py-4">
              <p className="text-xs sm:text-sm text-[var(--t-muted)] mb-3 sm:mb-4">
                Visit the login URL below and authorize:
              </p>
              <div className="bg-sidebar p-2.5 sm:p-4 rounded-lg mb-3 sm:mb-4">
                <p className="text-xs text-[var(--t-muted)] mb-1.5">Login URL</p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
                  <code className="min-w-0 flex-1 break-all text-xs sm:text-sm">{deviceLoginUrl}</code>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={copied === "login_url" ? "check" : "content_copy"}
                      onClick={() => copy(deviceLoginUrl, "login_url")}
                      disabled={!deviceLoginUrl}
                      className="min-h-9 min-w-9 sm:min-h-8 sm:min-w-8"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="open_in_new"
                      onClick={() => window.open(deviceLoginUrl, "_blank", "noopener,noreferrer")}
                      disabled={!deviceLoginUrl}
                      className="min-h-9 min-w-9 sm:min-h-8 sm:min-w-8"
                    >
                      <span className="hidden sm:inline">Open</span>
                    </Button>
                  </div>
                </div>
              </div>
              {deviceData.user_code && (
                <div className="bg-primary/10 p-2.5 sm:p-4 rounded-lg">
                  <p className="text-xs text-[var(--t-muted)] mb-1.5">Your Code</p>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <p className="text-xl sm:text-2xl font-mono font-bold text-[var(--t-accent)] break-all">{deviceData.user_code}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={copied === "user_code" ? "check" : "content_copy"}
                      onClick={() => copy(deviceData.user_code, "user_code")}
                      className="min-h-9 min-w-9 sm:min-h-8 sm:min-w-8 shrink-0"
                    />
                  </div>
                </div>
              )}
            </div>
            {polling && (
              <div className="flex items-center justify-center gap-2 text-sm text-[var(--t-muted)]">
                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                Waiting for authorization...
              </div>
            )}
          </>
        )}

        {/* Success Step */}
        {step === "success" && (
          <div className="text-center py-6">
            <div className="size-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl text-green-600">check_circle</span>
            </div>
            <h3 className="text-lg font-semibold mb-2">Connected Successfully!</h3>
            <p className="text-sm text-[var(--t-muted)] mb-4">
              Your {providerInfo.name} account has been connected.
            </p>
            <Button onClick={handleClose} fullWidth>
              Done
            </Button>
          </div>
        )}

        {/* Error Step */}
        {step === "error" && (
          <div className="text-center py-6">
            <div className="size-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl text-red-600">error</span>
            </div>
            <h3 className="text-lg font-semibold mb-2">{translate("Connection failed")}</h3>
            <p className="text-sm text-red-600 mb-4">{error}</p>
            <div className="flex gap-2">
              <Button onClick={startOAuthFlow} variant="secondary" fullWidth>
                {translate("Try again")}
              </Button>
              <Button onClick={handleClose} variant="ghost" fullWidth>
                {translate("Cancel")}
              </Button>
            </div>
          </div>
        )}
        </div>
      </SurfaceSkinContext.Provider>
    </AntaresModal>
  );
}

OAuthModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  provider: PropTypes.string,
  providerInfo: PropTypes.shape({ name: PropTypes.string }),
  onSuccess: PropTypes.func,
  onClose: PropTypes.func.isRequired,
  oauthMeta: PropTypes.object,
  idcConfig: PropTypes.shape({
    startUrl: PropTypes.string,
    region: PropTypes.string,
  }),
};
