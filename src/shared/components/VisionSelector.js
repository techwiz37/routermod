"use client";

import { translate } from "@/i18n/runtime";

// Map a caps object to the tri-state vision value.
//   caps.vision === true  -> "yes"
//   caps.vision === false -> "no"
//   otherwise             -> "auto" (catalog default, no override stored)
export function visionFromCaps(caps) {
  if (caps?.vision === true) return "yes";
  if (caps?.vision === false) return "no";
  return "auto";
}

// Tri-state vision selector: "Auto" keeps the catalog default (no caps override
// stored), "Vision"/"No Vision" force the flag on/off explicitly. Fills its
// container and uses container queries, so it fits narrow model cards and
// popovers as well as wide forms.
export default function VisionSelector({ value, onChange, hint, className = "" }) {
  const options = [
    { value: "auto", icon: "auto_awesome", label: translate("Auto") },
    { value: "yes", icon: "visibility", label: translate("Vision") },
    { value: "no", icon: "visibility_off", label: translate("No Vision") },
  ];
  return (
    <div className={`@container flex w-full min-w-0 flex-col gap-1.5 ${className}`}>
      <div className="flex flex-col gap-1 @[360px]:flex-row @[360px]:items-center @[360px]:gap-3">
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-text-muted">
          <span className="material-symbols-outlined" style={{ fontSize: 14, lineHeight: 1 }} aria-hidden>
            visibility
          </span>
          {translate("Vision")}
        </span>
        <div
          role="radiogroup"
          aria-label={translate("Vision")}
          className="grid w-full min-w-0 grid-cols-3 gap-0.5 rounded-md border border-border bg-bg p-0.5 @[360px]:max-w-[300px]"
        >
          {options.map((opt) => {
            const active = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange(opt.value)}
                title={opt.label}
                className={`flex min-w-0 items-center justify-center gap-1 rounded px-1.5 py-1 text-[11px] font-semibold transition-colors ${
                  active
                    ? "bg-primary text-white shadow-sm"
                    : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                }`}
              >
                <span
                  className="material-symbols-outlined hidden shrink-0 @[240px]:inline"
                  style={{ fontSize: 13, lineHeight: 1 }}
                  aria-hidden
                >
                  {opt.icon}
                </span>
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      {hint && <p className="text-[10px] leading-snug text-text-muted/70">{hint}</p>}
    </div>
  );
}
