"use client";

import { Card } from "@/shared/components";

const CONTACTS = [
  {
    label: "Telegram",
    handle: "@techwiz37",
    url: "https://t.me/techwiz37",
    icon: "send",
    color: "#229ED9",
    bg: "bg-[#229ED9]/10",
  },
  {
    label: "Instagram",
    handle: "@techwiz37",
    url: "https://instagram.com/techwiz37",
    icon: "photo_camera",
    color: "#E1306C",
    bg: "bg-[#E1306C]/10",
  },
  {
    label: "GitHub",
    handle: "@techwiz37",
    url: "https://github.com/techwiz37",
    icon: "code",
    color: "#6e40c9",
    bg: "bg-purple-500/10",
  },
  {
    label: "Email",
    handle: "techwiz.id@gmail.com",
    url: "mailto:techwiz.id@gmail.com",
    icon: "mail",
    color: "#ff1a53",
    bg: "bg-[#ff1a53]/10",
  },
];

export default function ContactPage() {
  return (
    <div className="max-w-lg mx-auto py-8 px-4 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-mono font-bold uppercase tracking-wider text-text-main">
          Contact Developer
        </h1>
        <p className="text-sm text-text-muted">
          Ada bug, saran, atau mau kolaborasi? Hubungi langsung.
        </p>
      </div>

      {/* Contact cards */}
      <div className="flex flex-col gap-3">
        {CONTACTS.map((c) => (
          <a
            key={c.label}
            href={c.url}
            target={c.url.startsWith("mailto") ? undefined : "_blank"}
            rel="noreferrer"
            className="group block"
          >
            <Card className="flex items-center gap-4 p-4 border-2 border-border shadow-[3px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_var(--color-border)] active:translate-y-0 transition-all cursor-pointer">
              <div
                className={`size-11 rounded-xl border-2 border-border flex items-center justify-center shrink-0 ${c.bg} shadow-[2px_2px_0px_var(--color-border)]`}
              >
                <span
                  className="material-symbols-outlined text-[22px]"
                  style={{ color: c.color }}
                >
                  {c.icon}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-muted font-mono uppercase tracking-wider">{c.label}</p>
                <p className="text-sm font-bold text-text-main font-mono truncate">{c.handle}</p>
              </div>
              <span className="material-symbols-outlined text-[18px] text-text-muted group-hover:text-primary transition-colors">
                open_in_new
              </span>
            </Card>
          </a>
        ))}
      </div>

      <p className="text-xs text-text-muted text-center pt-2">
        RouterMod — dibuat dengan ❤️ oleh techwiz37
      </p>
    </div>
  );
}
