import { getAutomateConfig } from "@/lib/db/repos/automateRepo";

/**
 * Kiro farming runtime options, stored in automateConfig.data (JSON column).
 * These are applied as environment variables that kiroSuspensionHook passes
 * to the child `node krg.js` process — the script/args themselves stay the
 * same (ROOT/REG/krg.js, 3 accounts per batch).
 *
 *   kiroFarmProxy  true  -> KRG_PROXY=auto  (proxies.txt -> WARP -> direct)
 *                  false -> KRG_PROXY=off   (direct connection)
 *   kiroFarmHuman  true  -> KRG_HUMAN=1     (human-like typing + random delay)
 *                  false -> KRG_HUMAN=0     (fast native-setter path)
 */

export const DEFAULT_KIRO_FARM = Object.freeze({
  kiroFarmProxy: true,
  kiroFarmHuman: true,
});

export function applyKiroFarmEnv(config = {}) {
  const proxy = config.kiroFarmProxy !== false;
  const human = config.kiroFarmHuman !== false;

  process.env.KRG_PROXY = proxy ? "auto" : "off";
  process.env.KRG_HUMAN = human ? "1" : "0";

  return {
    kiroFarmProxy: proxy,
    kiroFarmHuman: human,
    env: { KRG_PROXY: process.env.KRG_PROXY, KRG_HUMAN: process.env.KRG_HUMAN },
  };
}

export async function initKiroFarmEnv() {
  try {
    const config = await getAutomateConfig();
    return applyKiroFarmEnv(config);
  } catch {
    // DB may not be ready on the very first boot — krg.js defaults are safe.
    return applyKiroFarmEnv(DEFAULT_KIRO_FARM);
  }
}
