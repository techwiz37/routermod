"use client";

import { useId, useState, useRef, useEffect } from "react";
import { getCurrentLocale, translate, translateServerMessage } from "@/i18n/runtime";
import { testModel } from "@/shared/utils/testModel";
import { notifyModelTestSuccess } from "@/shared/utils/modelTestNotification";
import { useModelTestStore, loadModelTestResults, forgetModelTest } from "@/store/modelTestStore";
import { modelTestKey } from "@/shared/utils/modelTestIdentity";
import { isClientPolicyFailure } from "@/shared/utils/modelTestFailure";

export default function ModelTestButton({ model, resultModel = model, kind = "llm", onRemove, onResult, disabled = false, hideControl = false }) {
  const saved = useModelTestStore((state) => state.results[modelTestKey(resultModel, kind)]);
  const loadError = useModelTestStore((state) => state.loadError);
  useEffect(() => { loadModelTestResults(); }, []);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const dialog = useRef(null);
  const titleId = useId();
  const clientPolicyBlocked = isClientPolicyFailure(result);

  useEffect(() => {
    if (result && !result.ok && onRemove && !dialog.current?.open) dialog.current?.showModal();
  }, [result, onRemove]);

  const run = async () => {
    if (testing) return;
    setTesting(true);
    setResult(null);
    setRemoveError("");
    try {
      const next = await testModel(model, kind);
      setResult(next);
      if (next.ok) notifyModelTestSuccess(model, next.latencyMs);
      onResult?.(next);
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await onRemove();
      forgetModelTest(resultModel, kind);
      dialog.current?.close();
    } catch (error) {
      setRemoveError(translateServerMessage(error.message) || translate("Failed to delete model"));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      {saved && <span role="status" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-text-main"
        title={`${translate("Last successful test")}: ${new Date(saved.testedAt).toLocaleString(getCurrentLocale())}`}>
        <span aria-hidden="true" className="material-symbols-outlined text-[14px]">check_circle</span>
        {new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 0 }).format(saved.latencyMs)} ms
      </span>}
      {loadError && !saved && <span className="text-xs text-text-muted" title={translate("Failed to load model test results")}>?</span>}
      {!hideControl && <button type="button" onClick={run} disabled={disabled || testing}
        aria-label={`${translate(testing ? "Testing..." : "Test model")} ${model}`} aria-busy={testing}
        title={translate("Send a short prompt and wait up to 60 seconds for an answer.")}
        className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded px-2 text-text-muted hover:bg-sidebar hover:text-primary active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
        <span aria-hidden="true" className={`material-symbols-outlined text-[18px]${testing ? " animate-spin motion-reduce:animate-none" : ""}`}>
          {testing ? "progress_activity" : "science"}
        </span>
      </button>}
      {result && !result.ok && <span role="status" className="max-w-48 break-words text-xs text-text-main">
        {translate(clientPolicyBlocked ? "Upstream client restriction" : "Model not connected")}
      </span>}
      {result?.persistenceError && <span role="alert" className="text-xs text-text-main">{translate("Test result could not be saved")}</span>}
      <dialog ref={dialog} aria-labelledby={titleId} onClose={() => setResult(null)} onCancel={(event) => { if (removing) event.preventDefault(); }}
        className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-lg border border-border bg-surface p-5 text-text-main shadow-xl backdrop:bg-black/60">
        <h2 id={titleId} className="text-base font-semibold">{translate(clientPolicyBlocked ? "Upstream client restriction" : "Model not connected")}</h2>
        <p className="mt-3 break-all text-sm font-medium">{model}</p>
        <p className="mt-2 break-words text-sm">{translateServerMessage(result?.error)}</p>
        <p className="mt-3 text-sm">{translate(clientPolicyBlocked
          ? "The model remains saved. This provider rejects dashboard tests and only accepts supported coding clients. Use a permitted coding client or contact the provider about router access."
          : "Do you want to remove this model?")}</p>
        {removeError && <p role="alert" className="mt-3 text-sm">{removeError}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button type="button" autoFocus disabled={removing} onClick={() => dialog.current?.close()}
            className="min-h-11 min-w-16 cursor-pointer rounded border border-border px-4 hover:bg-sidebar active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50">{translate(clientPolicyBlocked ? "Close" : "No")}</button>
          {!clientPolicyBlocked && <button type="button" disabled={removing} onClick={remove}
            className="min-h-11 min-w-16 cursor-pointer rounded border border-border px-4 font-semibold hover:bg-sidebar active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50">{removing ? translate("Removing...") : translate("Yes")}</button>}
        </div>
      </dialog>
    </>
  );
}
