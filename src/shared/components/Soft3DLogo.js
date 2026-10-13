"use client";

import PropTypes from "prop-types";

export default function Soft3DLogo({ className = "size-9" }) {
  return (
    <div className={`relative flex items-center justify-center shrink-0 group ${className}`}>
      <svg
        viewBox="0 0 120 120"
        className="w-full h-full drop-shadow-[2.5px_3px_0px_rgba(24,28,36,0.85)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:drop-shadow-[3px_4px_0px_rgba(24,28,36,0.9)]"
      >
        <defs>
          <linearGradient id="logo-r-red" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--color-brand-500)" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>

        <rect x="8" y="8" width="104" height="104" rx="22" fill="#181c24" stroke="var(--color-border)" strokeWidth="4" />
        <rect x="12" y="12" width="96" height="96" rx="18" fill="#ffffff" className="dark:fill-[#1b1f2b]" />

        <path d="M12 36L36 12H12v24z" fill="url(#logo-r-red)" />
        <circle cx="94" cy="26" r="4.5" fill="var(--color-success)" stroke="var(--color-border)" strokeWidth="2" />

        <rect x="34" y="30" width="16" height="60" rx="4" fill="#181c24" className="dark:fill-white" />
        <path d="M48 30h23c10.5 0 18.5 7 18.5 18s-8 18-18.5 18H48V30z" fill="#181c24" className="dark:fill-white" />
        <path d="M50 41.5h20c4.5 0 8 3 8 6.5s-3.5 6.5-8 6.5H50v-13z" fill="#ffffff" className="dark:fill-[#1b1f2b]" />

        <path d="M60 62L83 90H65L48 68h14z" fill="url(#logo-r-red)" stroke="var(--color-border)" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="88" cy="88" r="4.5" fill="var(--color-info)" stroke="var(--color-border)" strokeWidth="2" />
      </svg>
    </div>
  );
}

Soft3DLogo.propTypes = {
  className: PropTypes.string,
};
