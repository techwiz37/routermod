// Refresh a provider connection's credentials and persist the result.
//
// Lives in shared/services (not under src/app) so runtime-loaded schedulers —
// quotaAutoPing, backgroundTokenRefresh — can import it without pulling in a
// Next.js route handler. The /api/usage/[connectionId] route re-exports it
// for backwards compatibility.

import { getProviderConnectionById, updateProviderConnection } from "@/lib/localDb";
import { isUnrecoverableRefreshError } from "open-sse/services/tokenRefresh.js";
import { getExecutor } from "open-sse/executors/index.js";

export async function refreshAndUpdateCredentials(connection, force = false, proxyOptions = null) {
  const latest = connection.id ? await getProviderConnectionById(connection.id) : null;
  if (latest) connection = latest;

  const executor = getExecutor(connection.provider);

  const credentials = {
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken,
    idToken: connection.idToken,
    expiresAt: connection.expiresAt || connection.tokenExpiresAt,
    lastRefreshAt: connection.lastRefreshAt,
    connectionId: connection.id,
    providerSpecificData: connection.providerSpecificData,
    copilotToken: connection.providerSpecificData?.copilotToken,
    copilotTokenExpiresAt: connection.providerSpecificData?.copilotTokenExpiresAt,
  };

  const needsRefresh = force || executor.needsRefresh(credentials);

  if (!needsRefresh) {
    return { connection, refreshed: false };
  }

  const refreshResult = await executor.refreshCredentials(credentials, console, proxyOptions);

  if (refreshResult && isUnrecoverableRefreshError(refreshResult)) {
    throw new Error("Refresh token invalid or reused. Please re-authorize the connection.");
  }

  if (!refreshResult) {
    if (connection.accessToken) {
      return { connection, refreshed: false };
    }
    throw new Error("Failed to refresh credentials. Please re-authorize the connection.");
  }

  const now = new Date().toISOString();
  const updateData = {
    updatedAt: now,
  };

  if (refreshResult.accessToken) {
    updateData.accessToken = refreshResult.accessToken;
  }

  if (refreshResult.refreshToken) {
    updateData.refreshToken = refreshResult.refreshToken;
  }

  if (refreshResult.idToken) {
    updateData.idToken = refreshResult.idToken;
  }

  if (refreshResult.lastRefreshAt) {
    updateData.lastRefreshAt = refreshResult.lastRefreshAt;
  }

  if (refreshResult.expiresIn) {
    updateData.expiresAt = new Date(Date.now() + refreshResult.expiresIn * 1000).toISOString();
    updateData.expiresIn = refreshResult.expiresIn;
  } else if (refreshResult.expiresAt) {
    updateData.expiresAt = refreshResult.expiresAt;
  }

  const providerSpecificUpdates = {
    ...(refreshResult.providerSpecificData || {}),
    ...(refreshResult.copilotToken ? { copilotToken: refreshResult.copilotToken } : {}),
    ...(refreshResult.copilotTokenExpiresAt ? { copilotTokenExpiresAt: refreshResult.copilotTokenExpiresAt } : {}),
  };
  if (Object.keys(providerSpecificUpdates).length > 0) {
    updateData.providerSpecificData = {
      ...(connection.providerSpecificData || {}),
      ...providerSpecificUpdates,
    };
  }

  await updateProviderConnection(connection.id, updateData);

  const updatedConnection = {
    ...connection,
    ...updateData,
    providerSpecificData: updateData.providerSpecificData || connection.providerSpecificData,
  };

  return {
    connection: updatedConnection,
    refreshed: true,
  };
}
