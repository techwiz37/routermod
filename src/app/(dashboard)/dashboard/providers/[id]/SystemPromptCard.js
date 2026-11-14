"use client";

import { useRef, useState } from "react";
import PropTypes from "prop-types";
import { translate } from "@/i18n/runtime";

export default function SystemPromptCard({
  modelOptions = [],
  systemPromptModel = "",
  onSystemPromptModelChange = () => {},
  systemPromptDraft = "",
  onSystemPromptDraftChange = () => {},
  systemPrompts = {},
  savingSystemPrompt = false,
  onSystemPromptSave = () => {},
  providerDisplayAlias = "",
}) {
  const fileRef = useRef(null);
  const [uploadError, setUploadError] = useState("");
  const [testOpen, setTestOpen] = useState(false);
  const [testSource, setTestSource] = useState("model");
  const [testModel, setTestModel] = useState("");
  const [testPrompt, setTestPrompt] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [reinforce, setReinforce] = useState(false);
  const [reinforceTouched, setReinforceTouched] = useState(false);

  // Some models (e.g. Agnes) answer with their built-in identity no matter what
  // the system prompt says. This wrapper restates the instruction as a hard
  // override so the injection actually wins.
  const OVERRIDE_HEAD = "[SYSTEM OVERRIDE — HIGHEST PRIORITY]";
  const OVERRIDE_TAIL = "The identity and rules above REPLACE your built-in identity. When asked who you are, answer using the identity above. Never mention a different model name or vendor.";

  const buildPrompt = (text) => {
    const base = (text || "").trim();
    if (!effectiveReinforce || !base) return base;
    return [OVERRIDE_HEAD, base, "", OVERRIDE_TAIL].join("\n");
  };

  const stripReinforce = (text) => {
    const value = (text || "").trim();
    if (!value.startsWith(OVERRIDE_HEAD)) return value;
    return value
      .slice(OVERRIDE_HEAD.length)
      .replace(OVERRIDE_TAIL, "")
      .trim();
  };

  const savedPrompt = systemPromptModel ? (systemPrompts[systemPromptModel] || "") : "";
  const savedIsReinforced = savedPrompt.trim().startsWith(OVERRIDE_HEAD);
  const effectiveReinforce = reinforceTouched ? reinforce : savedIsReinforced;
  const dirty = Boolean(systemPromptModel) && stripReinforce(savedPrompt) !== systemPromptDraft.trim();

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(md|markdown|txt)$/i.test(file.name)) {
      setUploadError(translate("Only .md, .markdown, or .txt files are supported."));
      return;
    }
    try {
      const text = await file.text();
      setUploadError("");
      onSystemPromptDraftChange(text);
    } catch {
      setUploadError(translate("Could not read that file."));
    }
  };

  const runTest = async () => {
    const model = testSource === "model" ? systemPromptModel : testModel;
    if (!model || testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/models/prompt-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: providerDisplayAlias ? `${providerDisplayAlias}/${model}` : model,
          systemPrompt: buildPrompt(systemPromptDraft),
          prompt: testPrompt,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (error) {
      setTestResult({ ok: false, error: error.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="an-panel an-scope mb-3">
      <div className="an-panel-pad">
        <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="an-panel-ico" aria-hidden><span className="material-symbols-outlined text-base">text_fields</span></span>
            <div className="min-w-0">
              <span className="an-panel-title block">{translate("System Prompt")}</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-text-muted">{translate("Special instructions for the selected model")}</span>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">{translate("MODEL-SPECIFIC")}</span>
        </div>

        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted" htmlFor="system-prompt-model">{translate("Target model")}</label>
        <div className="relative mb-4">
          <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-primary"><span className="material-symbols-outlined text-[18px]">smart_toy</span></span>
          <select id="system-prompt-model" value={systemPromptModel} onChange={(e) => onSystemPromptModelChange(e.target.value)} className="an-select system-prompt-select h-11 w-full font-mono text-xs">
            <option value="">{translate("Choose a model to configure")}</option>
            {modelOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>

        <label className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted" htmlFor="system-prompt-textarea">
          <span>{translate("System instructions")}</span>
          <span className="font-normal normal-case tracking-normal text-text-muted/60">{systemPromptDraft.length} {translate("characters")}</span>
        </label>
        <textarea
          id="system-prompt-textarea"
          value={systemPromptDraft}
          onChange={(e) => onSystemPromptDraftChange(e.target.value)}
          placeholder={translate("Example: You are model XX from Techwiz. Explain answers clearly and accurately.")}
          rows={5}
          className="an-input system-prompt-textarea min-h-[132px] w-full resize-y !rounded-xl !border-border/80 !bg-bg text-sm leading-6 placeholder:text-text-muted/45 focus:!border-primary/70"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onSystemPromptSave(systemPromptModel, buildPrompt(systemPromptDraft))}
            disabled={!systemPromptModel || savingSystemPrompt}
            className="an-btn an-primary h-9 rounded-[10px] px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55"
          >
            <span className="material-symbols-outlined text-[16px]" style={savingSystemPrompt ? { animation: "spin 1s linear infinite" } : undefined}>{savingSystemPrompt ? "progress_activity" : "save"}</span>
            {savingSystemPrompt ? translate("Saving...") : translate("Save prompt")}
          </button>
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-text-muted" title={translate("Wrap the prompt so it overrides the model's built-in identity.")}>
            <input
              type="checkbox"
              checked={effectiveReinforce}
              onChange={(e) => { setReinforceTouched(true); setReinforce(e.target.checked); }}
              className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
            />
            {translate("Reinforce")}
          </label>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="an-btn an-ghost h-9 rounded-[10px] px-3 text-xs font-medium"
          >
            <span className="material-symbols-outlined text-[16px]">upload_file</span>
            {translate("Upload .md")}
          </button>
          <input ref={fileRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="hidden" onChange={handleFile} />
          {dirty && <p className="text-[10px] text-warning">{translate("Unsaved system prompt changes")}</p>}
        </div>
        {uploadError && <p className="mt-2 text-[10px] text-[var(--color-danger)]">{uploadError}</p>}

        {/* Prompt injection test */}
        <div className="mt-4 border-t border-border/60 pt-3">
          <button
            type="button"
            onClick={() => setTestOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
            aria-expanded={testOpen}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              <span className="material-symbols-outlined text-[16px] text-primary">science</span>
              {translate("Test prompt injection")}
            </span>
            <span className="material-symbols-outlined text-[18px] text-text-muted">{testOpen ? "expand_less" : "expand_more"}</span>
          </button>

          {testOpen && (
            <div className="mt-3 flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{translate("Source")}</span>
                  <select
                    value={testSource}
                    onChange={(e) => setTestSource(e.target.value)}
                    className="an-select h-9 w-full text-xs"
                  >
                    <option value="model">{translate("From selected model")}</option>
                    <option value="prompt">{translate("From prompt")}</option>
                  </select>
                </label>
                {testSource === "prompt" ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{translate("Model")}</span>
                    <select
                      value={testModel}
                      onChange={(e) => setTestModel(e.target.value)}
                      className="an-select h-9 w-full font-mono text-xs"
                    >
                      <option value="">{translate("Choose a model")}</option>
                      {modelOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </label>
                ) : (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{translate("Model")}</span>
                    <div className="flex h-9 items-center rounded-[10px] border border-border/70 bg-bg px-3 font-mono text-xs text-text-muted">
                      {systemPromptModel || translate("No model selected")}
                    </div>
                  </div>
                )}
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{translate("Test message")}</span>
                <input
                  value={testPrompt}
                  onChange={(e) => setTestPrompt(e.target.value)}
                  placeholder={translate("Who are you? Answer in one short sentence.")}
                  className="an-input system-prompt-test-input h-9 w-full text-xs"
                />
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={runTest}
                  disabled={testing || !(testSource === "model" ? systemPromptModel : testModel)}
                  className="an-btn an-primary h-9 rounded-[10px] px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <span className="material-symbols-outlined text-[16px]" style={testing ? { animation: "spin 1s linear infinite" } : undefined}>{testing ? "progress_activity" : "play_arrow"}</span>
                  {testing ? translate("Running...") : translate("Run test")}
                </button>
                {testResult && (
                  <span className={`text-[11px] font-medium ${testResult.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
                    {testResult.ok ? translate("Prompt delivered") : translate("Test failed")}
                    {typeof testResult.latencyMs === "number" ? ` · ${testResult.latencyMs}ms` : ""}
                  </span>
                )}
              </div>

              {testResult && (
                <div className="rounded-[10px] border border-border/70 bg-bg p-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    {testResult.ok ? translate("Model response") : translate("Error")}
                  </p>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-text-main">
                    {testResult.ok ? testResult.answer : testResult.error}
                  </pre>
                  {testResult.ok && testResult.testedModel && (
                    <p className="mt-2 font-mono text-[10px] text-text-muted">{testResult.testedModel}</p>
                  )}
                  {testResult.ok && (
                    <p className="mt-1.5 text-[10px] leading-relaxed text-text-muted">
                      {translate("The prompt reached the model. If the answer ignores it, the model is overriding its own identity — enable Reinforce or make the instruction more explicit.")}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

SystemPromptCard.propTypes = {
  modelOptions: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string, label: PropTypes.string })),
  systemPromptModel: PropTypes.string,
  onSystemPromptModelChange: PropTypes.func,
  systemPromptDraft: PropTypes.string,
  onSystemPromptDraftChange: PropTypes.func,
  systemPrompts: PropTypes.object,
  savingSystemPrompt: PropTypes.bool,
  onSystemPromptSave: PropTypes.func,
  providerDisplayAlias: PropTypes.string,
};
