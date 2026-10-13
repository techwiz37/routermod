import { MUSE_CONFIG } from "../constants/oauth.js";


const MUSE_KEY_URL = "https://api.meta.ai/muse-code/key";
const API_VERSION = "1.0.0";

const muse = {
  config: MUSE_CONFIG,
  flowType: "device_code",
  requestDeviceCode: async (config) => {
    const response = await fetch(config.deviceCodeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "x-api-version": API_VERSION,
      },
      body: new URLSearchParams({ client_id: config.clientId }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Muse Code device code request failed: ${error}`);
    }

    return await response.json();
  },
  pollToken: async (config, deviceCode) => {
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "x-api-version": API_VERSION,
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceCode,
        client_id: config.clientId,
      }),
    });

    let data;
    try {
      data = await response.json();
    } catch {
      const text = await response.text();
      data = { error: "invalid_response", error_description: text };
    }

    const pending =
      data?.error === "authorization_pending" ||
      data?.error === "slow_down";
    return { ok: response.ok || pending, data };
  },
  postExchange: async (tokens) => {

    let response;
    for (let attempt = 0; ; attempt++) {
      response = await fetch(MUSE_KEY_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json",
          "x-api-version": API_VERSION,
        },
        body: JSON.stringify({ onboard: true }),
        redirect: "error",
      });
      const transient = response.status === 429 || response.status >= 500;
      if (!transient || attempt >= 2) break;
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    }

    const text = await response.text();
    if (!response.ok) {

      let msg = `${response.status} ${text.slice(0, 200)}`;
      try {
        const err = JSON.parse(text);
        if (err?.title || err?.detail) {
          msg = [err.title, err.detail].filter(Boolean).join(": ");
          if (err.action_url) msg += ` — ${err.action_url}`;
        }
      } catch {  }
      throw new Error(`Muse Code key mint failed: ${msg}`);
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("Muse Code key mint returned invalid JSON");
    }

    if (payload.is_subs_active === false) {
      throw new Error("Muse Code subscription is inactive — activate it on muse.ai first");
    }
    const actionUrl = payload.action_url || payload.require_payment_action_url;
    if (!payload.api_key && (payload.require_payment || actionUrl)) {
      throw new Error(`Muse Code subscription required${actionUrl ? `: ${actionUrl}` : ""}`);
    }
    if (!payload.api_key) {
      throw new Error("Muse Code key response is missing api_key");
    }

    return { key: payload };
  },
  mapTokens: (tokens, extra) => {
    const payload = extra?.key || {};

    return {
      accessToken: payload.api_key,
      refreshToken: null,
      expiresIn: null,
      email: payload.user_email?.trim().toLowerCase() || undefined,
      providerSpecificData: {
        authMethod: "device_code",

        oauthAccessToken: tokens.access_token,
        subscriptionTier: payload.subs_tier_name || null,
      },
    };
  },
};

export default muse;
