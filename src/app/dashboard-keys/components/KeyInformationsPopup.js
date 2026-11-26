"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AntaresButton from "@/shared/components/AntaresButton";
import AntaresModal from "@/shared/components/AntaresModal";
import { onLocaleChange, translate } from "@/i18n/runtime";

const ACK_EVENT = "routermod:informations-read";

/**
 * One-time information popup for an API-key session.
 *
 * It is mounted by KeyDashboardLayout so every key page checks for unread
 * notices after sign-in. The acknowledgement is stored server-side per key, so
 * a later login (or another device) sees no popup until an admin publishes a
 * new notice.
 */
export default function KeyInformationsPopup() {
  const pathname = usePathname();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, setLocaleVersion] = useState(0);

  useEffect(() => onLocaleChange(() => setLocaleVersion((value) => value + 1)), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/public/informations", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        const unread = (data.items || []).filter((item) => !item.read);
        setItems(unread);
        if (unread.length > 0) setOpen(true);
      } catch {
        // A notice must never break the dashboard; the info page still lists it.
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const acknowledge = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await fetch("/api/public/informations/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: items.map((item) => item.id) }),
        cache: "no-store",
      });
    } catch {
      // Closing is still better than trapping the owner if the write fails.
    } finally {
      window.dispatchEvent(new CustomEvent(ACK_EVENT));
      setOpen(false);
      setSaving(false);
    }
  }, [items, saving]);

  // The Informations page shows the same notices inline, so a modal on top of
  // it would duplicate the content and ask for a second acknowledgement.
  if (pathname === "/dashboard-keys/informations") return null;
  if (!open || items.length === 0) return null;

  return (
    <AntaresModal
      isOpen={open}
      onClose={acknowledge}
      title={translate("New information")}
      subtitle={translate("{count} unread announcement(s) for this key").replace("{count}", String(items.length))}
      size="lg"
      footer={
        <AntaresButton icon="done_all" onClick={acknowledge} loading={saving}>
          {translate("I have read")}
        </AntaresButton>
      }
    >
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-[12px] border border-[var(--t-line-soft)] bg-[var(--t-raised)] p-3.5">
            <h3 className="text-sm font-semibold text-[var(--t-ink)]">{item.title}</h3>
            <p className="mt-1.5 whitespace-pre-line break-words text-[12.5px] leading-relaxed text-[var(--t-muted)]">{item.body}</p>
            <p className="mt-2 font-mono text-[10.5px] text-[var(--t-dim)]">
              {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
            </p>
          </li>
        ))}
      </ul>
    </AntaresModal>
  );
}

export { ACK_EVENT as INFORMATION_READ_EVENT };
