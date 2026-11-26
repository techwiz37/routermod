"use client";

import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import AntaresSwitch from "@/shared/components/AntaresSwitch";
import { translate } from "@/i18n/runtime";

/**
 * Isolated so typing in the sticky field never re-renders the parent's
 * connection list (hundreds of rows) — the lag users saw on large providers.
 */
export default function RoundRobinControl({ providerId, initialStrategy, initialSticky }) {
  const [enabled, setEnabled] = useState(initialStrategy === "round-robin");
  const [sticky, setSticky] = useState(
    initialSticky != null && initialSticky !== "" ? String(initialSticky) : "1"
  );

  useEffect(() => {
    setEnabled(initialStrategy === "round-robin");
    if (initialSticky != null && initialSticky !== "") setSticky(String(initialSticky));
  }, [initialStrategy, initialSticky]);

  const persist = async (patch) => {
    try {
      const res = await fetch("/api/providers/strategy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, ...patch }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      console.log("Error saving provider strategy:", error);
    }
  };

  const handleToggle = (next) => {
    setEnabled(next);
    if (next) persist({ strategy: "round-robin", stickyRoundRobinLimit: Number(sticky) || 1 });
    else persist({ strategy: null });
  };

  const handleSticky = (value) => {
    setSticky(value);
    const n = Number(value);
    // Ignore empty/invalid intermediate values while the field is being edited.
    if (Number.isInteger(n) && n > 0) {
      persist({ strategy: "round-robin", stickyRoundRobinLimit: n });
    }
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-2 border-t border-[var(--t-line-soft)] pt-2.5 sm:ml-auto sm:w-auto sm:border-t-0 sm:pt-0">
      <AntaresSwitch
        on={enabled}
        onChange={handleToggle}
        label={translate("Round Robin")}
        ariaLabel={translate("Round Robin")}
      />
      {enabled && (
        <>
          <span className="h-3 w-px bg-[var(--t-line)]" />
          <span className="text-[11px] text-[var(--t-muted)]">{translate("Sticky:")}</span>
          <input
            type="number"
            min={1}
            value={sticky}
            onChange={(e) => handleSticky(e.target.value)}
            placeholder="1"
            className="h-6 w-12 rounded-[6px] border border-[var(--t-line)] bg-[var(--t-raised)] px-1.5 text-center font-mono text-[11px] text-[var(--t-ink)] focus:border-[var(--t-accent)] focus:outline-none"
          />
        </>
      )}
    </div>
  );
}

RoundRobinControl.propTypes = {
  providerId: PropTypes.string.isRequired,
  initialStrategy: PropTypes.string,
  initialSticky: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};
