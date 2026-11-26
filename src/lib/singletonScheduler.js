/**
 * Process-wide scheduler guard.
 *
 * custom-server.js imports scheduler source modules directly, while the Next.js
 * bundle imports its own copy through the @/ alias. Each copy used to have its
 * own module-local `started` flag, so the same interval was started twice in
 * one process (duplicate token refreshes, duplicate health checks, log spam).
 * globalThis + Symbol.for is shared by every bundle copy in the process.
 */
export function claimScheduler(key) {
  const symbol = Symbol.for(`routermod.scheduler.${key}`);
  if (globalThis[symbol]) return false;
  globalThis[symbol] = true;
  return true;
}

export function releaseScheduler(key) {
  const symbol = Symbol.for(`routermod.scheduler.${key}`);
  delete globalThis[symbol];
}
