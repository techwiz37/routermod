"use client";

import PropTypes from "prop-types";

/**
 * Info alert explaining how "Auto-detect Models" works — collapsed by default
 * and only shown when the user taps the info button.
 */
export default function AutoDetectHelp({ onClose }) {
  return (
    <div className="an-notice info mb-3">
      <span className="an-notice-ico" aria-hidden>
        <span className="material-symbols-outlined">tips_and_updates</span>
      </span>

      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[13px] font-medium text-[var(--t-ink)]">
          Auto-detect Models
        </p>
        <p className="text-[12px] leading-relaxed text-[var(--t-muted)]">
          Click the auto-detect button to scan every model this provider exposes —
          no more typing model IDs one by one.
        </p>
        <ol className="ml-4 mt-1.5 list-decimal space-y-0.5 text-[12px] leading-relaxed text-[var(--t-muted)]">
          <li>Saved connection — uses your stored API key or OAuth token.</li>
          <li>
            The /models endpoint — works without a key when the provider allows
            anonymous access.
          </li>
          <li>RouterMod&apos;s built-in catalog — offline fallback.</li>
        </ol>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--t-muted)]">
          The All / Free / Paid filter decides what gets imported and which models
          the list below shows. Models without pricing info stay visible under All
          only.
        </p>
      </div>

      <button
        type="button"
        onClick={onClose}
        title="Hide this tip"
        aria-label="Hide this tip"
        className="an-conn-btn"
      >
        <span className="material-symbols-outlined">close</span>
      </button>
    </div>
  );
}

AutoDetectHelp.propTypes = {
  onClose: PropTypes.func.isRequired,
};
