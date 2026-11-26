"use client";

import { create } from "zustand";
import { modelTestKey } from "@/shared/utils/modelTestIdentity";

let inflight = null;
let loaded = false;
let listening = false;
let reloadPending = false;

export const useModelTestStore = create(() => ({ results: {}, loadError: false }));

export function rememberModelTest(model, kind, result) {
  if (!result?.ok || !Number.isFinite(result.latencyMs)) return;
  const saved = result.savedResult || {
    model: result.testedModel || model, kind, latencyMs: Math.round(result.latencyMs), testedAt: new Date().toISOString(),
  };
  useModelTestStore.setState((state) => ({ results: {
    ...state.results,
    [modelTestKey(model, kind)]: saved,
    [modelTestKey(saved.model, kind)]: saved,
  } }));
}

export function loadModelTestResults(force = false) {
  if (!listening && typeof window !== "undefined") {
    window.addEventListener("customModelChanged", () => loadModelTestResults(true));
    listening = true;
  }
  if (inflight) {
    if (force) reloadPending = true;
    return inflight;
  }
  if (loaded && !force) return Promise.resolve();
  const before = useModelTestStore.getState().results;
  inflight = fetch("/api/models/test", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Failed to load model test results");
      const data = await response.json();
      useModelTestStore.setState((state) => {
        const results = { ...(data.results || {}) };
        for (const [key, value] of Object.entries(state.results)) {
          if (before[key] !== value && (!results[key] || value.testedAt > results[key].testedAt)) results[key] = value;
        }
        for (const key of Object.keys(before)) {
          if (!state.results[key]) delete results[key];
        }
        return { results, loadError: false };
      });
      loaded = true;
    })
    .catch(() => useModelTestStore.setState({ loadError: true }))
    .finally(() => {
      inflight = null;
      if (reloadPending) {
        reloadPending = false;
        return loadModelTestResults(true);
      }
    });
  return inflight;
}

export function forgetModelTest(model, kind = "llm") {
  useModelTestStore.setState((state) => {
    const results = { ...state.results };
    const key = modelTestKey(model, kind);
    const saved = results[key];
    for (const [entry, value] of Object.entries(results)) {
      if (entry === key || (saved && value.model === saved.model && value.kind === saved.kind)) delete results[entry];
    }
    return { results };
  });
}
