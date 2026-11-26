"use client";

import { useEffect, useId, useRef, useState } from "react";
import { translate } from "@/i18n/runtime";
import { testModel } from "@/shared/utils/testModel";
import { forgetModelTest } from "@/store/modelTestStore";
import { isClientPolicyFailure } from "@/shared/utils/modelTestFailure";

export default function TestAllModelsButton({ models = [], providerAlias, kind = "llm", onModelsDeleted }) {
  const running = useRef(false);
  const stopped = useRef(false);
  const mounted = useRef(true);
  const [progress, setProgress] = useState(null);
  const dialog = useRef(null);
  const logEnd = useRef(null);
  const followLog = useRef(true);
  const titleId = useId();
  const deleting = useRef(false);
  const [deleteState, setDeleteState] = useState({ active: false, deleted: [], errors: [] });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (dialog.current?.open && followLog.current) logEnd.current?.scrollIntoView({ block: "nearest" });
  }, [progress?.logs.length, deleteState]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stopped.current = true; };
  }, []);

  const run = async () => {
    if (running.current || deleting.current) return;
    const ids = [...new Set(models.map((model) => typeof model === "string" ? model : model.id).filter(Boolean))];
    if (!ids.length) return;
    running.current = true;
    stopped.current = false;
    setDeleteState({ active: false, deleted: [], errors: [] });
    setConfirmDelete(false);
    const next = { total: ids.length, completed: 0, success: 0, failed: 0, unsaved: 0, errors: [], logs: [], active: true, stopping: false };
    setProgress({ ...next });
    try {
      for (const id of ids) {
        if (stopped.current) break;
        const startedAt = Date.now();
        next.logs = [...next.logs, { id, time: new Date().toISOString(), level: "RUN", message: translate("Sending model probe") }];
        setProgress({ ...next, current: id });
        let result;
        try {
          result = await testModel(`${providerAlias}/${id}`, kind);
        } catch {
          result = { ok: false, error: translate("Network error") };
        }
        next.completed++;
        if (result.ok) {
          next.success++;
          if (result.persistenceError) next.unsaved++;
        } else {
          next.failed++;
          next.errors = [...next.errors, { id, error: result.error || translate("Model not reachable"), clientPolicyBlocked: isClientPolicyFailure(result) }];
        }
        next.logs = [...next.logs, {
          id, time: new Date().toISOString(), level: result.ok ? "PASS" : "ERROR",
          duration: Number.isFinite(result.latencyMs) ? Math.round(result.latencyMs) : Date.now() - startedAt,
          message: result.ok ? translate("Model responded successfully") : result.error || translate("Model not reachable"),
        }];
        if (mounted.current) setProgress({ ...next, stopping: stopped.current });
      }
    } finally {
      if (next.completed === next.total && !stopped.current) {
        try {
          const response = await fetch("/api/models/test/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerAlias, kind, total: next.total, completed: next.completed, success: next.success, failed: next.failed }),
          });
          if (!response.ok) throw new Error("Failed to save batch");
          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("routermod:providers-changed"));
            try { localStorage.setItem("routermod:providers-changed", String(Date.now())); } catch {}
          }
        } catch {
          next.batchSaveError = true;
        }
      }
      running.current = false;
      if (mounted.current) setProgress({ ...next, active: false, stopped: stopped.current });
    }
  };

  const deleteErrors = async () => {
    if (running.current || deleting.current) return;
    deleting.current = true;
    setConfirmDelete(false);
    const deleted = [...deleteState.deleted];
    const errors = [];
    setDeleteState({ active: true, deleted: [...deleted], errors: [] });
    try {
      for (const { id } of progress.errors.filter((entry) => !entry.clientPolicyBlocked)) {
        if (deleted.includes(id)) continue;
        try {
          const params = new URLSearchParams({ providerAlias, id, type: kind });
          const response = await fetch(`/api/models/custom?${params}`, { method: "DELETE" });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `HTTP ${response.status}`);
          }
          deleted.push(id);
          forgetModelTest(`${providerAlias}/${id}`, kind);
        } catch (error) {
          errors.push({ id, error: error.message || translate("Failed to delete model") });
        }
        if (mounted.current) setDeleteState({ active: true, deleted: [...deleted], errors: [...errors] });
      }
    } finally {
      // Refresh once after the batch, including partial success, so built-in
      // tombstones and custom rows both disappear from the provider list.
      if (deleted.length) {
        window.dispatchEvent(new CustomEvent("customModelChanged"));
        try { await onModelsDeleted?.(); } catch {
          errors.push({ id: providerAlias, error: translate("Failed to refresh models. Reload the page.") });
        }
      }
      deleting.current = false;
      if (mounted.current) setDeleteState({ active: false, deleted, errors });
    }
  };

  const remainingErrors = progress?.errors.filter(({ id, clientPolicyBlocked }) => !clientPolicyBlocked && !deleteState.deleted.includes(id)) || [];

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <button type="button" onClick={run} disabled={!models.length || progress?.active || deleteState.active}
        aria-busy={progress?.active || false}
        className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded border border-border bg-surface px-4 py-2 text-xs font-bold text-text-main transition-colors hover:bg-surface-2 active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40">
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">science</span>
        {translate("Test All Models")}
      </button>
      {progress && <>
        <p role="status" aria-live="polite" className="break-words text-xs text-text-main">
          {translate(progress.active ? "Testing models" : progress.stopped ? "Testing stopped" : "Testing complete")}: {progress.completed}/{progress.total}
          {" · "}{translate("Successful")}: {progress.success}{" · "}{translate("Failed")}: {progress.failed}
          {progress.active && progress.current && <span className="mt-1 block break-all">{progress.current}</span>}
        </p>
        {progress.active && <button type="button" disabled={progress.stopping} onClick={() => {
          stopped.current = true;
          setProgress((value) => ({ ...value, stopping: true }));
        }} className="min-h-11 cursor-pointer rounded border border-border px-3 text-xs text-text-main hover:bg-surface-2 active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40">
          {translate(progress.stopping ? "Stopping after current test..." : "Stop after current test")}
        </button>}
        {progress.unsaved > 0 && <p role="alert" className="text-xs text-text-main">{translate("Test result could not be saved")}: {progress.unsaved}</p>}
        {progress.batchSaveError && <p role="alert" className="text-xs text-text-main">{translate("The provider test timestamp could not be saved. Run Test All Models again to retry.")}</p>}
        {progress.errors.length > 0 && <button type="button" aria-haspopup="dialog" onClick={() => {
          followLog.current = true;
          dialog.current?.showModal();
          logEnd.current?.scrollIntoView({ block: "nearest" });
        }} className="flex min-h-11 cursor-pointer items-center gap-2 rounded border border-border px-3 text-left text-xs text-text-main hover:bg-surface-2 active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2">
          <span aria-hidden="true" className="material-symbols-outlined text-base">terminal</span>
          {translate("Failed tests")} ({progress.failed})
        </button>}
      </>}
      <dialog ref={dialog} aria-labelledby={titleId} onClose={() => setConfirmDelete(false)}
        className="m-auto w-[calc(100%_-_2rem)] max-w-3xl overflow-hidden rounded-lg border border-border bg-surface p-0 text-text-main shadow-xl backdrop:bg-black/70">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold">{translate("Model test logs")}</h2>
            <p className="break-all font-mono text-xs text-text-muted">{providerAlias} / {kind} · {progress?.completed || 0}/{progress?.total || 0}</p>
          </div>
          <button type="button" autoFocus aria-label={translate("Close")} onClick={() => dialog.current?.close()}
            className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-surface-2 active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2">
            <span aria-hidden="true" className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
        <div role="region" aria-label={translate("Model test logs")} tabIndex={0}
          onScroll={(event) => { const el = event.currentTarget; followLog.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
          className="h-[45dvh] min-h-40 max-h-96 overflow-y-auto overscroll-contain bg-[#0b0f14] p-4 font-mono text-xs leading-6 text-[#e2e8f0] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white">
          {progress?.logs.map((entry, index) => <div key={index} className="mb-2 break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
            <span className="text-[#a8b3c4]">[{entry.time}] </span>
            <span className={entry.level === "ERROR" ? "text-[#fda4af]" : entry.level === "PASS" ? "text-[#86efac]" : "text-[#93c5fd]"}>[{entry.level}] </span>
            <span>{providerAlias}/{entry.id}</span>
            {entry.duration !== undefined && <span className="text-[#a8b3c4]"> ({entry.duration} ms)</span>}
            <span className="block pl-2">{entry.message}</span>
          </div>)}
          {deleteState.deleted.map((id) => <div key={id} className="break-all text-[#86efac]">[DELETED] {providerAlias}/{id}</div>)}
          {deleteState.errors.map(({ id, error }) => <div key={id} className="break-words text-[#fda4af] [overflow-wrap:anywhere]">[DELETE ERROR] {providerAlias}/{id}: {error}</div>)}
          <div ref={logEnd} />
        </div>
        <div className="flex flex-col gap-2 border-t border-border p-4">
          <p role="status" className="text-xs text-text-main">{translate("Successful")}: {progress?.success || 0} · {translate("Failed")}: {progress?.failed || 0} · {translate("Deleted")}: {deleteState.deleted.length}</p>
          {progress?.errors.some((entry) => entry.clientPolicyBlocked) && <p className="text-xs text-text-main">{translate("Models blocked by the provider's client policy remain saved and are excluded from bulk deletion.")}</p>}
          {confirmDelete && <p className="text-xs text-text-main">{translate("Delete all models that failed this test? This cannot be undone.")} ({remainingErrors.length})</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {confirmDelete && <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-11 cursor-pointer rounded border border-border px-4 text-xs hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2">{translate("Cancel")}</button>}
            <button type="button" disabled={progress?.active || deleteState.active || !remainingErrors.length}
              onClick={() => confirmDelete ? deleteErrors() : setConfirmDelete(true)}
              className="min-h-11 cursor-pointer rounded border border-red-500/50 bg-red-500/10 px-4 text-xs font-semibold text-text-main hover:bg-red-500/20 active:bg-red-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40">
              {translate(deleteState.active ? "Deleting..." : confirmDelete ? "Confirm delete failed models" : "Delete Models Error")}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
