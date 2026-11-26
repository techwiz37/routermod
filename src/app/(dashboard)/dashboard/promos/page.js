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

function compact(value, locale) {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function formatDateTime(value, locale) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(locale === "id" ? "id-ID" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalInput(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultExpiryInput() {
  return toLocalInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
}

const EMPTY_FORM = () => ({ code: "", tokens: "", expiresAt: defaultExpiryInput(), isActive: true });

export default function PromosPage() {
  const [promos, setPromos] = useState([]);
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
      const response = await fetch("/api/promos", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || translate("Could not load promos."));
      setPromos(data.promos || []);
    } catch (error) {
      setLoadError(error.message || translate("Could not load promos."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM());
    setFormError("");
    setEditorOpen(true);
  }

  function openEdit(promo) {
    setEditing(promo);
    setForm({
      code: promo.code,
      tokens: String(promo.tokens),
      expiresAt: toLocalInput(promo.expiresAt),
      isActive: promo.isActive,
    });
    setFormError("");
    setEditorOpen(true);
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setFormError("");
    const code = form.code.trim().toUpperCase();
    const tokens = Math.floor(Number(form.tokens));
    if (!code) { setFormError(translate("Promo code is required.")); return; }
    if (!Number.isFinite(tokens) || tokens <= 0) { setFormError(translate("Token amount must be greater than zero.")); return; }
    const expiry = new Date(form.expiresAt);
    if (!form.expiresAt || Number.isNaN(expiry.getTime())) { setFormError(translate("Choose a valid expiry date.")); return; }

    setSaving(true);
    try {
      const response = await fetch(editing ? `/api/promos/${editing.id}` : "/api/promos", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          tokens,
          expiresAt: expiry.toISOString(),
          isActive: form.isActive,
        }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || translate("Could not save the promo."));
      setEditorOpen(false);
      setNotice({ variant: "info", text: translate(editing ? "Promo updated." : "Promo created.") });
      await load();
    } catch (error) {
      setFormError(error.message || translate("Could not save the promo."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(promo) {
    if (togglingId) return;
    setTogglingId(promo.id);
    try {
      const response = await fetch(`/api/promos/${promo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !promo.isActive }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || translate("Could not update the promo."));
      setPromos((previous) => previous.map((row) => (row.id === promo.id ? data.promo : row)));
    } catch (error) {
      setNotice({ variant: "danger", text: error.message || translate("Could not update the promo.") });
    } finally {
      setTogglingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/promos/${deleteTarget.id}`, { method: "DELETE", cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || translate("Could not delete the promo."));
      }
      setDeleteTarget(null);
      setNotice({ variant: "info", text: translate("Promo deleted.") });
      await load();
    } catch (error) {
      setDeleteTarget(null);
      setNotice({ variant: "danger", text: error.message || translate("Could not delete the promo.") });
    } finally {
      setDeleting(false);
    }
  }

  const now = Date.now();
  const activeCount = promos.filter((promo) => promo.isActive && Date.parse(promo.expiresAt) > now).length;
  const totalClaims = promos.reduce((sum, promo) => sum + (Number(promo.claimedCount) || 0), 0);

  return (
    <div className="an-scope an-shell promos-page flex min-w-0 flex-col gap-4 sm:gap-6">
      <div className="an-shell-bg" aria-hidden>
        <StarField />
      </div>

      <header className="skills-hero">
        <div className="min-w-0 flex-1">
          <p className="an-eyebrow">
            <span className="an-num">12</span>
            <span className="an-rule" />
            <span>{translate("RouterMod · Key Owners")}</span>
          </p>
          <h1 className="an-h1 text-[clamp(1.6rem,4.6vw,2.3rem)]">{translate("Promo codes")}</h1>
          <p className="an-hint max-w-[70ch]">
            {translate("Create promo codes that grant bonus tokens to key owners. Each key can claim a code once, and the code stops working after its expiry.")}
          </p>
        </div>
        <AntaresButton icon="add" onClick={openCreate} className="w-full sm:w-auto">{translate("Add promo")}</AntaresButton>
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
        icon="redeem"
        title={translate("Promo list")}
        subtitle={translate("{active} active · {claims} claims").replace("{active}", String(activeCount)).replace("{claims}", String(totalClaims))}
      >
        {loading ? (
          <p className="an-hint">{translate("Loading…")}</p>
        ) : loadError ? (
          <div className="flex flex-col items-start gap-3">
            <p className="an-hint text-[var(--t-danger)]">{loadError}</p>
            <AntaresButton variant="ghost" icon="refresh" onClick={load}>{translate("Retry")}</AntaresButton>
          </div>
        ) : promos.length === 0 ? (
          <div className="flex flex-col items-start gap-3 py-4">
            <p className="an-hint">{translate("No promo codes yet. Create one to give key owners bonus tokens.")}</p>
            <AntaresButton variant="ghost" icon="add" onClick={openCreate}>{translate("Add promo")}</AntaresButton>
          </div>
        ) : (
          <ul className="flex flex-col">
            {promos.map((promo) => {
              const expired = Date.parse(promo.expiresAt) <= now;
              return (
                <li key={promo.id} className="flex flex-col gap-2 border-b border-[var(--t-line-soft)] py-3.5 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="min-w-0 break-all rounded-[7px] border border-[var(--t-line)] bg-[var(--t-raised)] px-2 py-0.5 font-mono text-[12px] font-semibold text-[var(--t-ink)]">{promo.code}</code>
                      <span className="rounded-full border border-[var(--t-line)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--t-muted)]">
                        {compact(promo.tokens, locale)} {translate("tokens")}
                      </span>
                      <span
                        className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                        style={{
                          borderColor: promo.isActive && !expired ? "var(--t-ok)" : "var(--t-line)",
                          color: promo.isActive && !expired ? "var(--t-ok)" : "var(--t-muted)",
                        }}
                      >
                        {expired ? translate("Expired") : promo.isActive ? translate("Active") : translate("Inactive")}
                      </span>
                    </div>
                    <p className="mt-1.5 font-mono text-[10.5px] text-[var(--t-dim)]">
                      {translate("Expires")} {formatDateTime(promo.expiresAt, locale)}
                      {" · "}
                      {translate("{count} claimed").replace("{count}", String(promo.claimedCount || 0))}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <AntaresSwitch
                      on={promo.isActive}
                      disabled={togglingId === promo.id}
                      onChange={() => toggleActive(promo)}
                      ariaLabel={translate(promo.isActive ? "Deactivate" : "Activate")}
                    />
                    <button type="button" onClick={() => openEdit(promo)} className="an-btn an-ghost h-8 px-2.5 text-[12px] gap-1" title={translate("Edit")}>
                      <span className="material-symbols-outlined text-[15px]">edit</span>
                      {translate("Edit")}
                    </button>
                    <button type="button" onClick={() => setDeleteTarget(promo)} className="an-btn an-ghost h-8 px-2.5 text-[12px] gap-1 text-[var(--t-danger)]" title={translate("Delete")}>
                      <span className="material-symbols-outlined text-[15px]">delete</span>
                      {translate("Delete")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </AntaresPanel>

      <AntaresPanel icon="help" title={translate("How promos work")} subtitle={translate("Share the code with key owners. They claim it from the Topup Token page.")}>
        <ol className="topup-steps">
          <li><span>1</span><p>{translate("Create a code, set how many tokens it grants, and choose an expiry date.")}</p></li>
          <li><span>2</span><p>{translate("A key owner enters the code on the Topup Token page.")}</p></li>
          <li><span>3</span><p>{translate("The tokens are added to their topup balance and stay valid until the promo expiry, or longer if they already have a later topup expiry.")}</p></li>
        </ol>
      </AntaresPanel>

      <AntaresModal
        isOpen={editorOpen}
        onClose={() => { if (!saving) setEditorOpen(false); }}
        title={editing ? translate("Edit promo") : translate("Add promo")}
        subtitle={translate("Each key can claim the code once while it is active.")}
        size="lg"
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            <AntaresButton variant="ghost" onClick={() => setEditorOpen(false)} disabled={saving} className="w-full sm:w-auto">{translate("Cancel")}</AntaresButton>
            <AntaresButton onClick={save} loading={saving} icon="redeem" className="w-full sm:w-auto">{editing ? translate("Save changes") : translate("Create promo")}</AntaresButton>
          </div>
        }
      >
        <form onSubmit={save} className="flex flex-col gap-3.5">
          <Input
            variant="antares"
            id="promo-code"
            label={translate("Promo code")}
            value={form.code}
            maxLength={32}
            onChange={(event) => setForm((previous) => ({ ...previous, code: event.target.value.toUpperCase() }))}
            placeholder={translate("Example: LAUNCH1M")}
            inputClassName="font-mono uppercase tracking-wide"
            required
          />
          <Input
            variant="antares"
            id="promo-tokens"
            label={translate("Token amount")}
            type="number"
            min={1}
            step={1}
            value={form.tokens}
            onChange={(event) => setForm((previous) => ({ ...previous, tokens: event.target.value }))}
            placeholder="1000000"
            hint={translate("For example 1000000 = 1M tokens.")}
            required
          />
          <Input
            variant="antares"
            id="promo-expiry"
            label={translate("Expires at")}
            type="datetime-local"
            value={form.expiresAt}
            onChange={(event) => setForm((previous) => ({ ...previous, expiresAt: event.target.value }))}
            hint={translate("The code cannot be claimed after this time, and the granted tokens expire with it.")}
            required
          />
          <label className="flex items-center gap-2.5 text-sm text-[var(--t-ink)]">
            <AntaresSwitch on={form.isActive} onChange={(value) => setForm((previous) => ({ ...previous, isActive: value }))} ariaLabel={translate("Active")} />
            {translate("Active and claimable by key owners")}
          </label>
          {formError && <p className="text-[12.5px] text-[var(--t-danger)]" role="alert">{formError}</p>}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </AntaresModal>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
        onConfirm={confirmDelete}
        title={translate("Delete promo")}
        message={translate("Delete “{code}”? Its claim history is removed too.").replace("{code}", deleteTarget?.code || "")}
        confirmText={translate("Delete")}
        cancelText={translate("Cancel")}
        loading={deleting}
      />
    </div>
  );
}
