// Login page stats are public and identical for every visitor. Start both
// requests as soon as the bundle loads (in parallel with the auth check) so
// the live feed and top-models card already have data when they mount.

const LOGS_URL = "/api/usage/logs?limit=30";
const TOP_URL = "/api/usage/top-models?limit=10";

let logsPromise = null;
let topPromise = null;

async function getJson(url) {
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function prefetchLoginStats() {
  if (typeof window === "undefined") return;
  if (!logsPromise) logsPromise = getJson(LOGS_URL).catch(() => []);
  if (!topPromise) topPromise = getJson(TOP_URL).catch(() => null);
}

export function loadLoginLogs() {
  logsPromise = getJson(LOGS_URL).catch(() => []);
  return logsPromise;
}

export function loadLoginTopModels() {
  topPromise = getJson(TOP_URL).catch(() => null);
  return topPromise;
}

export function getLoginLogs() {
  return logsPromise;
}

export function getLoginTopModels() {
  return topPromise;
}
