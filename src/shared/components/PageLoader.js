"use client";

import Soft3DLogo from "./Soft3DLogo";
import StarField from "./StarField";

/**
 * Full-screen loading state that matches the global PagePreloader: star-field
 * backdrop, soft 3D logo, three pulsing dots and a mono caption.
 *
 * Use this for any page-level "still fetching" state so every route shows the
 * same preloader instead of a bare "Loading..." string.
 */
export default function PageLoader({ message = "Memuat...", className = "" }) {
  return (
    <div className={`an-scope an-shell flex items-center justify-center min-h-screen ${className}`}>
      <div className="an-shell-bg" aria-hidden>
        <StarField />
      </div>
      <div className="lf-loading-wrap">
        <Soft3DLogo className="size-10" />
        <div className="lf-loading-dots">
          <span /><span /><span />
        </div>
        <p className="lf-loading-text">{message}</p>
      </div>
    </div>
  );
}
