"use client";

import { useCallback, useEffect, useState } from "react";
import PropTypes from "prop-types";
import AntaresPanel from "./AntaresPanel";
import AntaresSelect from "./AntaresSelect";
import AntaresSwitch from "./AntaresSwitch";
import { translate } from "@/i18n/runtime";

const NONE = "__none__";

/**
 * One-click RouterMod proxy for ANY provider (custom or built-in). When on,
 * providerStrategies[providerId] is set, and connectionProxy.js applies it to
 * every request, account/refresh traffic and model catalogue fetch for that
 * provider — the same path OpenCode Free already uses.
 */
export default function RouterModProxyCard({ providerId }) {
  const [pools, setPools] = useState([]);
  const [warp, setWarp] = useState({ available: false, connected: false });
  const [poolId, setPoolId] = useState(NONE);
  const [strategy, setStrategy] = useState("none");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState("");

  const load = useCallback(async () => {
    const [poolRes, warpRes, settingsRes] = await Promise.all([
      fetch("/api/proxy-pools?isActive=true&view=options", { cache: "no-store" }).then((r) => r.ok ? r.json() : { proxyPools: [] }),
      fetch("/api/proxy-pools/warp", { cache: "no-store" }).then((r) => r.ok ? r.json() : {}).catch(() => ({})),
      fetch("/api/settings", { cache: "no-store" }).then((r) => r.ok ? r.json() : {}),
    ]);
    setPools(poolRes.proxyPools || []);
    setWarp(warpRes || {});
    const override = (settingsRes.providerStrategies || {})[providerId] || {};
    setPoolId(override.proxyPoolId || NONE);
    setStrategy(override.rotateStrategy || "none");
  }, [providerId]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (nextPool, nextStrategy) => {
    setPoolId(nextPool);
    setStrategy(nextStrategy);
    setSaving(true);
    try {
      const res = await fetch("/api/providers/strategy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          proxyPoolId: nextPool,
          rotateStrategy: nextStrategy,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFlash("Saved");
      setTimeout(() => setFlash(""), 1500);
    } catch { /* keep the current selection */ }
    finally { setSaving(false); }
  }, [providerId]);

  const enabled = poolId !== NONE;
  const routerModPool = pools.find((p) => /RouterMod WARP/i.test(p.name || ""));

  return (
    <AntaresPanel
      icon="lan"
      title={translate("RouterMod Proxy")}
      subtitle={translate("Route every request, connection and model fetch for this provider through the RouterMod proxy.")}
      headClassName="an-panel-head-stack an-routerproxy-head"
      action={
        <div className="flex items-center gap-2">
          {warp.connected && <span className="an-chip ok"><span className="material-symbols-outlined">bolt</span>WARP</span>}
          {saving && <span className="an-chip accent">{translate("Saving...")}</span>}
          {!saving && flash && <span className="an-chip ok">{flash}</span>}
          <AntaresSwitch
            on={enabled}
            disabled={saving || (!enabled && !pools.length)}
            onChange={(next) => save(next ? (routerModPool?.id || pools[0]?.id || NONE) : NONE, strategy)}
            ariaLabel={translate("Toggle RouterMod Proxy")}
            title={enabled ? translate("Disable RouterMod Proxy") : translate("Enable RouterMod Proxy")}
          />
        </div>
      }
    >
      {enabled ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--t-dim)]">
                {translate("Proxy pool")}
              </label>
              <AntaresSelect
                value={poolId}
                onChange={(e) => { setPoolId(e.target.value); save(e.target.value, strategy); }}
                ariaLabel={translate("Proxy pool")}
                portal
                placement="top"
                maxVisible={5}
                buttonClassName="h-[42px] font-mono"
                options={[
                  { value: NONE, label: translate("None") },
                  ...pools.map((p) => ({ value: p.id, label: p.name || p.proxyUrl })),
                ]}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--t-dim)]">
                {translate("Rotation")}
              </label>
              <AntaresSelect
                value={strategy}
                onChange={(e) => { setStrategy(e.target.value); save(poolId, e.target.value); }}
                ariaLabel={translate("Rotation")}
                portal
                placement="top"
                maxVisible={5}
                buttonClassName="h-[42px] font-mono"
                options={[
                  { value: "none", label: translate("Single pool") },
                  { value: "round-robin", label: translate("Round-robin (by exit IP)") },
                  { value: "random", label: translate("Random") },
                ]}
                disabled={pools.length < 2}
              />
            </div>
          </div>
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--t-muted)]">
            <span className="material-symbols-outlined shrink-0 text-[13px]">info</span>
            {translate("A 429 or rate-limit response automatically hops the WARP exit IP and retries the request.")}
          </p>
        </div>
      ) : (
        <p className="flex items-start gap-2 text-xs text-[var(--t-muted)]">
          <span className="material-symbols-outlined shrink-0 text-[15px]">info</span>
          {pools.length
            ? translate("Enable the switch to route this provider through a proxy pool.")
            : translate("No active proxy pools found. Create one in the Proxy Pools page first.")}
        </p>
      )}
    </AntaresPanel>
  );
}

RouterModProxyCard.propTypes = { providerId: PropTypes.string.isRequired };
