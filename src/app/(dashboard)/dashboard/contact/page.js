"use client";

import { Card } from "@/shared/components";

const CONTACTS = [
  {
    platform: "Telegram",
    handle: "@techwiz37",
    url: "https://t.me/techwiz37",
    icon: "send",
    color: "#229ED9",
    desc: "Quickest to respond",
  },
  {
    platform: "Instagram",
    handle: "@techwiz37",
    url: "https://instagram.com/techwiz37",
    icon: "photo_camera",
    color: "#E1306C",
    desc: "Updates & behind the scenes",
  },
  {
    platform: "GitHub",
    handle: "@techwiz37",
    url: "https://github.com/techwiz37",
    icon: "code",
    color: "#6e40c9",
    desc: "Code, issues & contributions",
  },
  {
    platform: "Email",
    handle: "techwiz.id@gmail.com",
    url: "mailto:techwiz.id@gmail.com",
    icon: "mail",
    color: "#ff1a53",
    desc: "For detailed discussions",
  },
];

export default function ContactPage() {
  return (
    <div className="flex flex-col gap-5">

      {}
      <Card>
        <div className="flex items-center gap-4">
          <div
            className="size-12 rounded-xl border-2 border-border flex items-center justify-center shrink-0 shadow-[2px_2px_0_var(--color-border)]"
            style={{ background: "#ff1a5318" }}
          >
            <span className="material-symbols-outlined text-[24px]" style={{ color: "#ff1a53" }}>
              contact_support
            </span>
          </div>
          <div>
            <h1 className="font-mono font-bold text-base sm:text-lg uppercase tracking-wider text-text-main leading-tight">
              Contact Developer
            </h1>
            <p className="text-sm text-text-muted mt-0.5">
              Got a bug or idea? Feel free to reach out.
            </p>
          </div>
        </div>
      </Card>

      {}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {CONTACTS.map((c) => (
          <a
            key={c.platform}
            href={c.url}
            target={c.url.startsWith("mailto") ? undefined : "_blank"}
            rel="noreferrer"
            className="group block"
          >
            <Card className="h-full flex flex-col gap-3 p-4 border-2 border-border shadow-[3px_3px_0px_var(--color-border)] group-hover:-translate-y-0.5 group-hover:shadow-[4px_5px_0px_var(--color-border)] active:translate-y-0 transition-all cursor-pointer select-none">
              <div className="flex items-start justify-between">
                <div
                  className="size-10 rounded-xl border-2 border-border flex items-center justify-center shadow-[2px_2px_0_var(--color-border)]"
                  style={{ background: `${c.color}18` }}
                >
                  <span className="material-symbols-outlined text-[20px]" style={{ color: c.color }}>
                    {c.icon}
                  </span>
                </div>
                <span className="material-symbols-outlined text-[15px] text-text-muted group-hover:text-primary transition-colors mt-0.5">
                  arrow_outward
                </span>
              </div>
              <div>
                <p className="text-[10px] text-text-muted font-mono uppercase tracking-widest mb-1">{c.platform}</p>
                <p className="text-sm font-bold text-text-main truncate">{c.handle}</p>
                <p className="text-xs text-text-muted mt-1">{c.desc}</p>
              </div>
            </Card>
          </a>
        ))}
      </div>

      <p className="text-xs text-text-muted text-center">
        RouterMod — made with ❤️ by <span className="font-mono font-bold">techwiz37</span>
      </p>

    </div>
  );
}
