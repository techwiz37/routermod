"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { THEME_CONFIG } from "@/shared/constants/config";

const useThemeStore = create(
  persist(
    (set) => ({
      theme: "dark",

      // RouterMod is dark-only (matches the login page). These setters stay
      // for API compatibility but always resolve to the dark theme.
      setTheme: () => {
        set({ theme: "dark" });
        applyTheme();
      },

      toggleTheme: () => {
        set({ theme: "dark" });
        applyTheme();
      },

      initTheme: () => {
        set({ theme: "dark" });
        applyTheme();
      },
    }),
    {
      name: THEME_CONFIG.storageKey,
      // Ignore any previously persisted (light/system) value from older
      // builds — RouterMod is dark-only now.
      merge: (persisted, current) => ({ ...current, ...persisted, theme: "dark" }),
    }
  )
);

function applyTheme() {
  if (typeof window === "undefined") return;

  // RouterMod ships a single dark "Antares" theme that matches the login page.
  // Light mode is intentionally not supported, so we always force dark.
  const root = document.documentElement;
  root.classList.add("dark");
  root.style.colorScheme = "dark";
}

export default useThemeStore;

