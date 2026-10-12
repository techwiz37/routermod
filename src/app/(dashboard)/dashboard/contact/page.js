"use client";

import { Card } from "@/shared/components";

const CONTACTS = [
  {
    platform: "Telegram",
    handle: "@techwiz37",
    url: "https://t.me/techwiz37",
    icon: "send",
    color: "#229ED9",
    desc: "Paling cepat dibalas",
  },
  {
    platform: "Instagram",
    handle: "@techwiz37",
    url: "https://instagram.com/techwiz37",
    icon: "photo_camera",
    color: "#E1306C",
    desc: "Update & behind the scenes",
  },
  {
    platform: "GitHub",
    handle: "@techwiz37",
    url: "https://github.com/techwiz37",
    icon: "code",
    color: "#6e40c9",
    desc: "Source code & issues",
  },
  {
    platform: "Email",
    handle: "techwiz.id@gmail.com",
    url: "mailto:techwiz.id@gmail.com",
    icon: "mail",
    color: "#ff1a53",
    desc: "Untuk urusan serius",
  },
];

export default function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-0">
      <div className="flex flex-col gap-6">

        {/* Header card */}
        <Card>
          <div className="flex items-center gap-4">
            <div className="size-12 rounded-lg border-2 border-border bg-[#ff1a53]/10 shadow-[2px_2px_0_var(--color-border)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px] text-[#ff1a53]">contact_support</span>
            </div>
            <div>
              <h1 className="font-mono font-bold text-lg uppercase tracking-wider text-text-main leading-tight">
                Contact Developer
              </h1>
              <p className="text-sm text-text-muted mt-0.5">
                Reach out for bugs, ideas, or just say hi.
              </p>
            </div>
          </div>
        </Card>

        {/* Contact grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CONTACTS.map((c) => (
            <a
              key={c.platform}
              href={c.url}
              target={c.url.startsWith("mailto") ? undefined : "_blank"}
              rel="noreferrer"
              className="group block"
            >
              <Card className="h-full flex items-center gap-4 p-4 border-2 border-border shadow-[3px_3px_0px_var(--color-border)] group-hover:-translate-y-0.5 group-hover:shadow-[4px_5px_0px_var(--color-border)] active:translate-y-0 transition-all cursor-pointer">
                <div
                  className="size-11 rounded-xl border-2 border-border flex items-center justify-center shrink-0 shadow-[2px_2px_0_var(--color-border)]"
                  style={{ background: `${c.color}18` }}
                >
                  <span
                    className="material-symbols-outlined text-[22px]"
                    style={{ color: c.color }}
                  >
                    {c.icon}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-text-muted font-mono uppercase tracking-wider leading-none mb-1">
                    {c.platform}
                  </p>
                  <p className="text-sm font-bold text-text-main font-mono truncate">
                    {c.handle}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">{c.desc}</p>
                </div>
                <span className="material-symbols-outlined text-[16px] text-text-muted group-hover:text-primary transition-colors shrink-0">
                  open_in_new
                </span>
              </Card>
            </a>
          ))}
        </div>

        {/* Footer note */}
        <p className="text-xs text-text-muted text-center pb-2">
          RouterMod — made with ❤️ by techwiz37
        </p>

      </div>
    </div>
  );
}
