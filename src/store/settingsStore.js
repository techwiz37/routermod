"use client";

import { create } from "zustand";
import { CLIENT_STORE_TTL_MS } from "@/shared/constants/config";

let inFlightSettingsPromise = null;

const useSettingsStore = create((set, get) => ({
  settings: null,
  loading: false,
  error: null,
  lastFetched: 0,

  invalidate: () => set({ lastFetched: 0 }),

  fetchSettings: async ({ force = false } = {}) => {
    const { lastFetched, settings } = get();
    if (!force && settings && Date.now() - lastFetched < CLIENT_STORE_TTL_MS) return settings;
    if (inFlightSettingsPromise) return inFlightSettingsPromise;

    set({ loading: true, error: null });
    inFlightSettingsPromise = (async () => {
      try {
        const res = await fetch("/api/settings", {
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });
        const data = await res.json();
        if (res.ok) {
          set({ settings: data, loading: false, lastFetched: Date.now() });
          return data;
        }
        set({ error: data.error, loading: false });
      } catch (e) {
        set({ error: "Failed to fetch settings", loading: false });
      } finally {
        inFlightSettingsPromise = null;
      }
      return null;
    })();
    return inFlightSettingsPromise;
  },

  patchSettings: async (patch) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      if (!res.ok) return null;
      const updated = await res.json();
      set({ settings: { ...get().settings, ...updated }, lastFetched: Date.now() });
      return updated;
    } catch {
      return null;
    }
  },
}));

export default useSettingsStore;
