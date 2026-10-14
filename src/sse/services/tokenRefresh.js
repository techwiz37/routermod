import * as log from "../utils/logger.js";
import { getProviderConnectionById, updateProviderConnection } from "../../lib/localDb.js";
import {
  getProjectIdForConnection,
  invalidateProjectId,
  removeConnection,
} from "open-sse/services/projectId.js";
import {
  TOKEN_EXPIRY_BUFFER_MS as BUFFER_MS,
  refreshAccessToken as _refreshAccessToken,
  refreshClaudeOAuthToken as _refreshClaudeOAuthToken,
  refreshGoogleToken as _refreshGoogleToken,
  refreshCodexToken as _refreshCodexToken,
  refreshIflowToken as _refreshIflowToken,
  refreshGitHubToken as _refreshGitHubToken,
  refreshCopilotToken as _refreshCopilotToken,
  getAccessToken as _getAccessToken,
  refreshTokenByProvider as _refreshTokenByProvider,
  formatProviderCredentials as _formatProviderCredentials,
  getAllAccessTokens as _getAllAccessTokens,
  refreshKiroToken as _refreshKiroToken,
  getRefreshLeadMs as _getRefreshLeadMs,
  isUnrecoverableRefreshError,
} from "open-sse/services/tokenRefresh.js";
import {
  refreshProviderCredentials as _refreshProviderCredentials,
  shouldRefreshCredentials as _shouldRefreshCredentials,
} from "open-sse/services/oauthCredentialManager.js";

export const TOKEN_EXPIRY_BUFFER_MS = BUFFER_MS;

// Marker prefix written to connections whose refresh token was permanently
// rejected upstream (invalid_grant, account deleted, ...). auth.js preserves
// this lastError so a later generic "[401]: HTTP 401" doesn't overwrite it.
export const REFRESH_REJECTED_PREFIX = "Refresh token ditolak";


export const refreshAccessToken = (provider, refreshToken, credentials) =>
  _refreshAccessToken(provider, refreshToken, credentials, log);

export const refreshClaudeOAuthToken = (refreshToken) =>
  _refreshClaudeOAuthToken(refreshToken, log);

export const refreshGoogleToken = (refreshToken, clientId, clientSecret) =>
  _refreshGoogleToken(refreshToken, clientId, clientSecret, log);

export const refreshCodexToken = (refreshToken) =>
  _refreshCodexToken(refreshToken, log);

export const refreshIflowToken = (refreshToken) =>
  _refreshIflowToken(refreshToken, log);

export const refreshGitHubToken = (refreshToken) =>
  _refreshGitHubToken(refreshToken, log);

export const refreshCopilotToken = (githubAccessToken) =>
  _refreshCopilotToken(githubAccessToken, log);

export const refreshKiroToken = (refreshToken, providerSpecificData) =>
  _refreshKiroToken(refreshToken, providerSpecificData, log);

export const getAccessToken = (provider, credentials) =>
  _getAccessToken(provider, credentials, log);

export const refreshTokenByProvider = (provider, credentials) =>
  _refreshTokenByProvider(provider, credentials, log);

export const formatProviderCredentials = (provider, credentials) =>
  _formatProviderCredentials(provider, credentials, log);

export const getAllAccessTokens = (userInfo) =>
  _getAllAccessTokens(userInfo, log);

export const shouldRefreshCredentials = (provider, credentials) =>
  _shouldRefreshCredentials(provider, credentials);


export function releaseConnection(connectionId) {
  if (!connectionId) return;
  removeConnection(connectionId);
  log.debug("TOKEN_REFRESH", "Released connection resources", { connectionId });
}


function toExpiresAt(expiresIn) {
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function normalizeExpiresAt(expiresAt) {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function needsProjectId(provider) {
  return provider === "antigravity" || provider === "gemini-cli";
}

function _refreshProjectId(provider, connectionId, accessToken) {
  if (!needsProjectId(provider) || !connectionId || !accessToken) return;

  invalidateProjectId(connectionId);

  if (process.env.EAGER_PROJECT_ID_REFRESH === "true") {
    getProjectIdForConnection(connectionId, accessToken, provider)
      .then((projectId) => {
        if (!projectId) return;
        updateProviderCredentials(connectionId, { projectId }).catch((err) => {
          log.debug("TOKEN_REFRESH", "Failed to persist refreshed projectId", {
            connectionId,
            error: err?.message ?? err,
          });
        });
      })
      .catch((err) => {
        log.debug("TOKEN_REFRESH", "Failed to fetch projectId after token refresh", {
          connectionId,
          error: err?.message ?? err,
        });
      });
  }
}


export async function updateProviderCredentials(connectionId, newCredentials) {
  try {
    const updates = {};

    if (newCredentials.accessToken)         updates.accessToken  = newCredentials.accessToken;
    if (newCredentials.refreshToken)        updates.refreshToken = newCredentials.refreshToken;
    if (newCredentials.idToken)             updates.idToken = newCredentials.idToken;
    if (newCredentials.lastRefreshAt)       updates.lastRefreshAt = newCredentials.lastRefreshAt;
    if (newCredentials.expiresAt)           updates.expiresAt = newCredentials.expiresAt;
    if (newCredentials.expiresIn) {
      updates.expiresAt = toExpiresAt(newCredentials.expiresIn);
      updates.expiresIn = newCredentials.expiresIn;
    } else if (newCredentials.expiresAt) {
      const expiresAt = normalizeExpiresAt(newCredentials.expiresAt);
      if (expiresAt) {
        updates.expiresAt = expiresAt;
        updates.expiresIn = Math.max(1, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      }
    }
    if (newCredentials.providerSpecificData) {
      updates.providerSpecificData = {
        ...(newCredentials.existingProviderSpecificData || {}),
        ...newCredentials.providerSpecificData,
      };
    }
    if (newCredentials.copilotToken || newCredentials.copilotTokenExpiresAt) {
      updates.providerSpecificData = {
        ...(updates.providerSpecificData || newCredentials.existingProviderSpecificData || {}),
        ...(newCredentials.copilotToken ? { copilotToken: newCredentials.copilotToken } : {}),
        ...(newCredentials.copilotTokenExpiresAt ? { copilotTokenExpiresAt: newCredentials.copilotTokenExpiresAt } : {}),
      };
    }
    if (newCredentials.projectId)            updates.projectId = newCredentials.projectId;

    const result = await updateProviderConnection(connectionId, updates);
    log.info("TOKEN_REFRESH", "Credentials updated in localDb", {
      connectionId,
      success: !!result
    });
    return !!result;
  } catch (error) {
    log.error("TOKEN_REFRESH", "Error updating credentials in localDb", {
      connectionId,
      error: error.message,
    });
    return false;
  }
}


// Antigravity cookie-session fallback: when the OAuth refresh token is dead
// (invalid_grant) but a persisted browser cookie jar is still alive, mint a
// fresh access token from the session and persist it so the account keeps
// working even though the OAuth grant was deleted upstream.
async function tryAntigravitySessionRecovery(provider, creds) {
  const pid = String(provider || "").toLowerCase();
  if (pid !== "antigravity" && pid !== "ag") return null;
  if (!creds?.connectionId) return null;
  try {
    const mod = await import("../../bot/session_recovery.js");
    const recovery = mod.default || mod;
    const recoverAntigravityAccessToken =
      recovery.recoverAntigravityAccessToken || mod.recoverAntigravityAccessToken;
    if (!recoverAntigravityAccessToken) return null;
    const recovered = await recoverAntigravityAccessToken({
      connectionId: creds.connectionId,
      email: creds.email || creds.displayName,
      log,
    });
    if (!recovered?.accessToken) return null;
    return {
      accessToken: recovered.accessToken,
      expiresIn: recovered.expiresIn || 3600,
      refreshToken: creds.refreshToken,
      projectId: creds.projectId,
    };
  } catch (err) {
    log?.debug?.("AG_SESSION", `Session recovery error: ${err?.message ?? err}`);
    return null;
  }
}

export async function checkAndRefreshToken(provider, credentials, options = {}) {
  let creds = { ...credentials };
  if (!creds.connectionId && creds.id) {
    creds.connectionId = creds.id;
  }

  if (creds.connectionId) {
    const latest = await getProviderConnectionById(creds.connectionId).catch(() => null);
    const latestRefreshMs = Date.parse(latest?.lastRefreshAt || "");
    const credsRefreshMs = Date.parse(creds.lastRefreshAt || "");
    const dbIsNewer = Number.isFinite(latestRefreshMs)
      && (!Number.isFinite(credsRefreshMs) || latestRefreshMs > credsRefreshMs);
    if (dbIsNewer && latest.refreshToken && latest.refreshToken !== creds.refreshToken) {
      creds = {
        ...creds,
        refreshToken: latest.refreshToken,
        accessToken: latest.accessToken || creds.accessToken,
        expiresAt: latest.expiresAt || latest.tokenExpiresAt || creds.expiresAt,
        lastRefreshAt: latest.lastRefreshAt || creds.lastRefreshAt,
      };
    }
  }

  const force = options?.force === true;

  if (force || _shouldRefreshCredentials(provider, creds)) {
    const expiresAt = creds.expiresAt ? new Date(creds.expiresAt).getTime() : null;
    const remaining = expiresAt ? expiresAt - Date.now() : null;
    const refreshLead = _getRefreshLeadMs(provider);

    log.info("TOKEN_REFRESH", "Refreshing provider credentials proactively", {
      provider,
      expiresIn: remaining === null ? null : Math.round(remaining / 1000),
      refreshLeadMs: refreshLead,
      lastRefreshAt: creds.lastRefreshAt || null,
    });

    const newCreds = await _refreshProviderCredentials(provider, creds, log);

    if (isUnrecoverableRefreshError(newCreds)) {
      // Permanent rejection (invalid_grant / account deleted): persist a clear,
      // human-readable reason on the connection instead of failing silently,
      // so the dashboard doesn't just show a cryptic "HTTP 401".
      const reason = [newCreds.code, newCreds.description].filter(Boolean).join(": ") || newCreds.error;
      log.warn("TOKEN_REFRESH", "Refresh token permanently rejected", {
        connectionId: creds.connectionId,
        provider,
        reason,
      });
      if (creds.connectionId) {
        try {
          await updateProviderConnection(creds.connectionId, {
            testStatus: "error",
            lastError: `${REFRESH_REJECTED_PREFIX}: ${reason}`,
            lastErrorAt: new Date().toISOString(),
          });
        } catch (err) {
          log.debug("TOKEN_REFRESH", "Failed to persist refresh rejection", {
            connectionId: creds.connectionId,
            error: err?.message ?? String(err),
          });
        }
      }

      // Before giving up, try to recover a fresh access token from the
      // persisted browser cookie session. Google revoking the OAuth grant does
      // NOT invalidate the live web session, so this keeps the account usable.
      const sessionCreds = await tryAntigravitySessionRecovery(provider, creds);
      if (sessionCreds?.accessToken) {
        log.info("TOKEN_REFRESH", "Recovered Antigravity token from browser session", {
          connectionId: creds.connectionId,
        });
        await updateProviderCredentials(creds.connectionId, {
          accessToken: sessionCreds.accessToken,
          expiresIn: sessionCreds.expiresIn,
          refreshToken: sessionCreds.refreshToken,
        });
        if (creds.connectionId) {
          try {
            await updateProviderConnection(creds.connectionId, {
              testStatus: "active",
              lastError: null,
              errorCode: null,
              lastErrorAt: null,
              backoffLevel: 0,
            });
          } catch (_e) {}
        }
        creds = {
          ...creds,
          accessToken: sessionCreds.accessToken,
          expiresAt: toExpiresAt(sessionCreds.expiresIn),
        };
        _refreshProjectId(provider, creds.connectionId, creds.accessToken);
      }
    }

    if (newCreds?.accessToken || newCreds?.apiKey || newCreds?.copilotToken) {
      const mergedCreds = {
        ...newCreds,
        existingProviderSpecificData: creds.providerSpecificData,
      };

      await updateProviderCredentials(creds.connectionId, mergedCreds);

      creds = {
        ...creds,
        ...newCreds,
        expiresAt: newCreds.expiresIn
          ? toExpiresAt(newCreds.expiresIn)
          : normalizeExpiresAt(newCreds.expiresAt) || newCreds.expiresAt || creds.expiresAt,
        providerSpecificData: newCreds.providerSpecificData
          ? { ...creds.providerSpecificData, ...newCreds.providerSpecificData }
          : creds.providerSpecificData,
      };

      _refreshProjectId(provider, creds.connectionId, creds.accessToken);
    }
  }

  if (provider === "github") {
    const copilotToken = creds.providerSpecificData?.copilotToken;
    const copilotExpiresAt = creds.providerSpecificData?.copilotTokenExpiresAt
      ? creds.providerSpecificData.copilotTokenExpiresAt * 1000
      : 0;
    const now              = Date.now();
    const remaining        = copilotExpiresAt - now;

    if (!copilotToken || remaining < TOKEN_EXPIRY_BUFFER_MS) {
      log.info("TOKEN_REFRESH", "Copilot token expiring soon or missing, refreshing proactively", {
        provider,
        expiresIn: copilotToken ? Math.round(remaining / 1000) : "missing",
      });

      const copilotTokenResult = await refreshCopilotToken(creds.accessToken);
      if (copilotTokenResult) {
        const updatedSpecific = {
          ...creds.providerSpecificData,
          copilotToken:          copilotTokenResult.token,
          copilotTokenExpiresAt: copilotTokenResult.expiresAt,
        };

        await updateProviderCredentials(creds.connectionId, {
          providerSpecificData: updatedSpecific,
        });

        creds.providerSpecificData = updatedSpecific;
        creds.copilotToken = copilotTokenResult.token;
      }
    }
  }

  return creds;
}


export async function refreshGitHubAndCopilotTokens(credentials) {
  const newGitHubCreds = await refreshGitHubToken(credentials.refreshToken);
  if (!newGitHubCreds?.accessToken) return newGitHubCreds;

  const copilotToken = await refreshCopilotToken(newGitHubCreds.accessToken);
  if (!copilotToken) return newGitHubCreds;

  return {
    ...newGitHubCreds,
    providerSpecificData: {
      copilotToken:          copilotToken.token,
      copilotTokenExpiresAt: copilotToken.expiresAt,
    },
  };
}
