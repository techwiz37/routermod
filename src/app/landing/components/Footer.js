"use client";

import Link from "next/link";
import { APP_CONFIG } from "@/shared/constants/config";

const GITHUB_URL = "https://github.com/techwiz37";

export default function Footer() {
  return (
    <footer className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)] shadow-[2px_2px_0px_var(--color-border)] pt-12 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-16 mb-10">
          {/* Brand */}
          <div className="col-span-1 lg:col-span-1">
            <div className="flex items-center gap-2 mb-5">
              <div
                className="size-5 rounded border-2 border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-primary)] shadow-[1px_1px_0px_var(--color-border)]"
              >
                <span className="material-symbols-outlined text-[14px]">hub</span>
              </div>
              <span className="font-mono font-bold text-[var(--color-text-main)] tracking-tight text-sm">
                RouterMod
              </span>
            </div>
            <p className="text-[var(--color-text-muted)] text-xs sm:text-sm leading-relaxed max-w-xs mb-5 font-light">
              AI gateway &amp; routing hub — satu pintu untuk semua provider AI.
            </p>
            <div className="flex items-center gap-3">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="size-9 rounded border-2 border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-surface-2)] transition-all shadow-[1px_1px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[2px_2.5px_0px_var(--color-border)]"
                aria-label="GitHub"
              >
                <span className="material-symbols-outlined text-[15px]">code</span>
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-mono font-bold text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-5">
              Product
            </h4>
            <ul className="flex flex-col gap-3">
              <li>
                <Link href="#features" className="text-[var(--color-text-muted)] text-sm hover:text-[var(--color-text-main)] transition-colors font-light">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="text-[var(--color-text-muted)] text-sm hover:text-[var(--color-text-main)] transition-colors font-light">
                  Dashboard
                </Link>
              </li>
              <li>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-text-muted)] text-sm hover:text-[var(--color-text-main)] transition-colors font-light"
                >
                  Changelog
                </a>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-mono font-bold text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-5">
              Resources
            </h4>
            <ul className="flex flex-col gap-3">
              <li>
                <a
                  href="#"
                  className="text-[var(--color-text-muted)] text-sm hover:text-[var(--color-text-main)] transition-colors font-light"
                >
                  Documentation
                </a>
              </li>
              <li>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-text-muted)] text-sm hover:text-[var(--color-text-main)] transition-colors font-light"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-mono font-bold text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-5">
              Company
            </h4>
            <ul className="flex flex-col gap-3">
              <li>
                <Link href="#" className="text-[var(--color-text-muted)] text-sm hover:text-[var(--color-text-main)] transition-colors font-light">
                  About
                </Link>
              </li>
              <li>
                <Link href="#" className="text-[var(--color-text-muted)] text-sm hover:text-[var(--color-text-main)] transition-colors font-light">
                  Contact
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-[var(--color-border)]/60 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-[var(--color-text-muted)] text-xs font-mono">
            © {new Date().getFullYear()} {APP_CONFIG.name} &middot; v{APP_CONFIG.version}
          </p>
          <div className="flex flex-col md:flex-row gap-2 md:gap-5 text-[var(--color-text-muted)] text-xs font-mono">
            <Link href="#" className="hover:text-[var(--color-text-main)] transition-colors">
              Privacy Policy
            </Link>
            <Link href="#" className="hover:text-[var(--color-text-main)] transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

