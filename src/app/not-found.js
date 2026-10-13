"use client";

import { useRouter } from "next/navigation";
import Soft3DLogo from "@/shared/components/Soft3DLogo";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4">
      {/* Noise grid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.03] dark:opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg,var(--color-border) 0,var(--color-border) 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,var(--color-border) 0,var(--color-border) 1px,transparent 1px,transparent 40px)",
        }}
      />

      <div className="relative flex flex-col items-center gap-8 w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Soft3DLogo className="size-9" />
          <span
            className="text-sm font-bold tracking-[0.15em] uppercase text-text-muted"
            style={{ fontFamily: "var(--font-ui, sans-serif)" }}
          >
            RouterMod
          </span>
        </div>

        {/* Card */}
        <div
          className="w-full bg-surface border-2 border-border rounded-xl p-8 text-center"
          style={{ boxShadow: "4px 4px 0 var(--color-border)" }}
        >
          {/* 404 number */}
          <div className="relative mb-4 select-none">
            <span
              className="block text-[96px] font-black leading-none tracking-tighter text-border/8 dark:text-border/5 pointer-events-none"
              aria-hidden
            >
              404
            </span>
            <span
              className="absolute inset-0 flex items-center justify-center text-[96px] font-black leading-none tracking-tighter"
              style={{
                fontFamily: "var(--font-terminator, monospace)",
                color: "var(--color-primary)",
                textShadow: "3px 3px 0 var(--color-border)",
              }}
            >
              404
            </span>
          </div>

          {/* Title */}
          <h1
            className="text-xl font-bold text-text-main mb-2"
            style={{ fontFamily: "var(--font-ui, sans-serif)" }}
          >
            Page Not Found
          </h1>
          <p className="text-sm text-text-muted leading-relaxed mb-8">
            The path you're looking for doesn't exist or has been moved.
          </p>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.back()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg border-2 border-border bg-surface-2 text-text-main hover:bg-surface-3 transition-colors"
              style={{ boxShadow: "2px 2px 0 var(--color-border)" }}
            >
              <span className="material-symbols-outlined text-[17px]">arrow_back</span>
              Go Back
            </button>
            <a
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg border-2 border-border bg-primary text-white hover:bg-primary-hover transition-colors"
              style={{ boxShadow: "2px 2px 0 var(--color-border)" }}
            >
              <span className="material-symbols-outlined text-[17px]">home</span>
              Dashboard
            </a>
          </div>
        </div>

        {/* Footer hint */}
        <p className="text-xs text-text-subtle font-mono tracking-wide">
          routermod · 404
        </p>
      </div>
    </div>
  );
}
