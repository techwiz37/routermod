"use client";

import { useCallback, useEffect, useState } from "react";
import AntaresButton from "@/shared/components/AntaresButton";
import AntaresModal from "@/shared/components/AntaresModal";
import AntaresNotice from "@/shared/components/AntaresNotice";
import AntaresPanel from "@/shared/components/AntaresPanel";
import AntaresSwitch from "@/shared/components/AntaresSwitch";
import Input from "@/shared/components/Input";
import StarField from "@/shared/components/StarField";
import { ConfirmModal } from "@/shared/components/Modal";
import { getCurrentLocale, onLocaleChange, translate } from "@/i18n/runtime";

const EMPTY_FORM = { title: "", body: "", isActive: true };

function formatDate(value, locale) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function InformationsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [locale, setLocale] = useState(getCurrentLocale());

  useEffect(() => onLocaleChange(() => setLocale(getCurrentLocale())), []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/informations", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || translate("Could not load informations."));
      setItems(data.informations || []);
    } catch (error) {
      setLoadError(error.message || translate("Could not load informations."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setEditorOpen(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({ title: item.title, body: item.body, isActive: item.isActive });
    setFormError("");
    setEditorOpen(true);
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setFormError("");
    if (!form.title.trim()) { setFormError(translate("Title is required.")); return; }
    if (!form.body.trim()) { setFormError(translate("Message is required.")); return; }
    setSaving(true);
    try {
      const response = await fetch(editing ? `/api/informations/${editing.id}` : "/api/informations", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          body: form.body.trim(),
          isActive: form.isActive,
        }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || translate("Could not save the information."));
      setEditorOpen(false);
      setNotice({ variant: "info", text: translate(editing ? "Information updated." : "Information published.") });
      await load();
    } catch (error) {
      setFormError(error.message || translate("Could not save the information."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item) {
    if (togglingId) return;
    setTogglingId(item.id);
    try {
      const response = await fetch(`/api/informations/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || translate("Could not update the information."));
      setItems((previous) => previous.map((row) => (row.id === item.id ? data.information : row)));
    } catch (error) {
      setNotice({ variant: "danger", text: error.message || translate("Could not update the information.") });
    } finally {
      setTogglingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/informations/${deleteTarget.id}`, { method: "DELETE", cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || translate("Could not delete the information."));
      }
      setDeleteTarget(null);
      setNotice({ variant: "info", text: translate("Information deleted.") });
      await load();
    } catch (error) {
      setDeleteTarget(null);
      setNotice({ variant: "danger", text: error.message || translate("Could not delete the information.") });
    } finally {
      setDeleting(false);
    }
  }

  const activeCount = items.filter((item) => item.isActive).length;

  return (
    <div className="an-scope an-shell informations-page flex min-w-0 flex-col gap-4 sm:gap-6">
      <div className="an-shell-bg" aria-hidden>
        <StarField />
      </div>

      <header className="skills-hero">
        <div className="min-w-0 flex-1">
          <p className="an-eyebrow">
            <span className="an-num">10</span>
            <span className="an-rule" />
            <span>{translate("RouterMod · Key Owners")}</span>
          </p>
          <h1 className="an-h1 text-[clamp(1.6rem,4.6vw,2.3rem)]">{translate("Informations")}</h1>
          <p className="an-hint max-w-[70ch]">
            {translate("Publish announcements for API-key owners. A notice appears as a one-time popup until each key marks it as read.")}
          </p>
        </div>
        <AntaresButton icon="add" onClick={openCreate} className="w-full sm:w-auto">{translate("Add information")}</AntaresButton>
      </header>

      {notice && (
        <AntaresNotice
          variant={notice.variant}
          icon={notice.variant === "danger" ? "error" : "check_circle"}
          action={<button type="button" className="an-btn an-ghost h-8 px-3 text-[12px]" onClick={() => setNotice(null)}>{translate("Dismiss")}</button>}
        >
          {notice.text}
        </AntaresNotice>
      )}

      <AntaresPanel
        icon="campaign"
        title={translate("Published informations")}
        subtitle={translate("{active} active · {total} total").replace("{active}", String(activeCount)).replace("{total}", String(items.length))}
      >
        {loading ? (
          <p className="an-hint">{translate("Loading…")}</p>
        ) : loadError ? (
          <div className="flex flex-col items-start gap-3">
            <p className="an-hint text-[var(--t-danger)]">{loadError}</p>
            <AntaresButton variant="ghost" icon="refresh" onClick={load}>{translate("Retry")}</AntaresButton>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-start gap-3 py-4">
            <p className="an-hint">{translate("No informations yet. Publish the first announcement for key owners.")}</p>
            <AntaresButton variant="ghost" icon="add" onClick={openCreate}>{translate("Add information")}</AntaresButton>
          </div>
        ) : (
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 border-b border-[var(--t-line-soft)] py-3.5 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium text-[var(--t-ink)]">{item.title}</h3>
                    <span
                      className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                      style={{
                        borderColor: item.isActive ? "var(--t-ok)" : "var(--t-line)",
                        color: item.isActive ? "var(--t-ok)" : "var(--t-muted)",
                      }}
                    >
                      {item.isActive ? translate("Active") : translate("Inactive")}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 whitespace-pre-line break-words text-[12.5px] leading-relaxed text-[var(--t-muted)]">{item.body}</p>
                  <p className="mt-1.5 font-mono text-[10.5px] text-[var(--t-dim)]">
                    {translate("Published")} {formatDate(item.createdAt, locale)}
                    {item.updatedAt && item.updatedAt !== item.createdAt ? ` · ${translate("Updated")} ${formatDate(item.updatedAt, locale)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <AntaresSwitch
                    on={item.isActive}
                    disabled={togglingId === item.id}
                    onChange={() => toggleActive(item)}
                    ariaLabel={translate(item.isActive ? "Deactivate" : "Activate")}
                  />
                  <button type="button" onClick={() => openEdit(item)} className="an-btn an-ghost h-8 px-2.5 text-[12px] gap-1" title={translate("Edit")}>
                    <span className="material-symbols-outlined text-[15px]">edit</span>
                    {translate("Edit")}
                  </button>
                  <button type="button" onClick={() => setDeleteTarget(item)} className="an-btn an-ghost h-8 px-2.5 text-[12px] gap-1 text-[var(--t-danger)]" title={translate("Delete")}>
                    <span className="material-symbols-outlined text-[15px]">delete</span>
                    {translate("Delete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AntaresPanel>

      <AntaresModal
        isOpen={editorOpen}
        onClose={() => { if (!saving) setEditorOpen(false); }}
        title={editing ? translate("Edit information") : translate("Add information")}
        subtitle={translate("Key owners see active notices once, as a popup after signing in.")}
        size="lg"
        footer={
          <>
            <AntaresButton variant="ghost" onClick={() => setEditorOpen(false)} disabled={saving}>{translate("Cancel")}</AntaresButton>
            <AntaresButton onClick={save} loading={saving} icon="send">{editing ? translate("Save changes") : translate("Publish")}</AntaresButton>
          </>
        }
      >
        <form onSubmit={save} className="flex flex-col gap-3.5">
          <Input
            variant="antares"
            id="information-title"
            label={translate("Title")}
            value={form.title}
            maxLength={160}
            onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))}
            placeholder={translate("Example: Scheduled maintenance tonight")}
            required
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="information-body" className="text-sm font-medium text-[var(--t-ink)]">
              {translate("Message")}<span className="ml-1 text-[var(--t-danger)]">*</span>
            </label>
            <textarea
              id="information-body"
              value={form.body}
              onChange={(event) => setForm((previous) => ({ ...previous, body: event.target.value }))}
              rows={7}
              maxLength={20000}
              placeholder={translate("Write the announcement key owners need to see.")}
              className="w-full resize-y rounded-[10px] border border-[var(--t-line)] bg-[var(--t-field)] px-3.5 py-2.5 text-[16px] sm:text-sm text-[var(--t-ink)] placeholder:text-[var(--t-dim)] focus:border-[var(--t-accent)] focus:shadow-[var(--t-focus)] focus:outline-none"
            />
            <p className="text-[11px] text-[var(--t-dim)]">{form.body.length} / 20000</p>
          </div>
          <label className="flex items-center gap-2.5 text-sm text-[var(--t-ink)]">
            <AntaresSwitch on={form.isActive} onChange={(value) => setForm((previous) => ({ ...previous, isActive: value }))} ariaLabel={translate("Active")} />
            {translate("Active and visible to key owners")}
          </label>
          {formError && <p className="text-[12.5px] text-[var(--t-danger)]" role="alert">{formError}</p>}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </AntaresModal>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
        onConfirm={confirmDelete}
        title={translate("Delete information")}
        message={translate("Delete “{title}”? Read state for this notice is removed too.").replace("{title}", deleteTarget?.title || "")}
        confirmText={translate("Delete")}
        cancelText={translate("Cancel")}
        loading={deleting}
      />
    </div>
  );
}
