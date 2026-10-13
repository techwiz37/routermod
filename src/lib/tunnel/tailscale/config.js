export const HEALTH_CHECK = {
  intervalMs: 2000,
  timeoutMs: 180000,
  enableTimeoutMs: 20000, // Enable flow waits short; watchdog re-verifies afterwards
  fetchTimeoutMs: 8000,
  dnsTimeoutMs: 3000,
};
