"use client";

import { useEffect, useState } from "react";
import { onLocaleChange, translate } from "@/i18n/runtime";

const CONTACTS = [
  { label: "GitHub", href: "https://github.com/techwiz37/routermod", icon: "code" },
  { label: "Telegram", href: "https://t.me/techwizdisc", icon: "send" },
  { label: "Discord", href: "https://discord.gg/routermod", icon: "chat" },
];

const FEATURES = [
  { icon: "shield_lock", title: "Encrypted", desc: "End-to-end security" },
  { icon: "bolt", title: "Failover", desc: "Automatic switching" },
  { icon: "storage", title: "Self-hosted", desc: "Your data, your server" },
];

export default function AntaresFooter({ className = "" }) {
  const [, setLocaleVersion] = useState(0);
  useEffect(() => onLocaleChange(() => setLocaleVersion((value) => value + 1)), []);

  return (
    <footer
      className={`an-scope an-footer w-full border-t border-[var(--color-border)] bg-[var(--color-bg)] ${className}`}
    >
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center border border-[var(--color-primary)]/30">
                <span className="material-symbols-outlined text-[var(--color-primary)] text-sm">router</span>
              </div>
              <div>
                <p className="font-bold text-sm text-[var(--color-text-main)] font-mono">RouterMod</p>
                <p className="text-[10px] text-[var(--color-text-muted)] font-mono">AI GATEWAY</p>
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
               {translate("Private AI gateway for Claude, OpenAI, Gemini, DeepSeek, Grok, and Ollama.")}
            </p>
          </div>

          <div>
             <p className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-3">{translate("Features")}</p>
            <div className="space-y-2">
              {FEATURES.map((f) => (
                <div key={f.title} className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[var(--color-primary)] text-sm">{f.icon}</span>
                  <div>
                    <p className="text-xs font-medium text-[var(--color-text-main)]">{translate(f.title)}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">{translate(f.desc)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
             <p className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-3">{translate("Connect")}</p>
            <div className="flex flex-wrap gap-2">
              {CONTACTS.map((c) => (
                <a
                  key={c.label}
                  href={c.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:border-[var(--color-primary)]/50 transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">{c.icon}</span>
                  {c.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--color-border)] pt-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-[var(--color-text-muted)] font-mono">
             {translate("RouterMod by")} <span className="text-[var(--color-primary)]">Techwiz</span>
          </p>
          <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-muted)] font-mono">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] inline-block animate-pulse" />
               {translate("All systems operational")}
            </span>
            <span>·</span>
            <span>v2.0.0</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
