import { useCallback, useEffect, useReducer, useState } from "react";
import { PanelShell } from "./PanelShell";
import { useEditorStore } from "../../state/store";
import { selectionEngine } from "../../editor/selection/selectionEngine";
import { aiService } from "../../ai/services/AIService";
import { AI_TASK_LABELS, AI_PROVIDER_LABELS } from "../../ai/services/AIService";
import { AIError } from "../../ai/core/AIError";
import { aiSelectionFromEditor, applyAiSelectionToEditor } from "../../ai/image/maskConversion";
import { insertAiResultAsLayer } from "../../ai/history/AIHistoryAdapter";
import { buildOperationPrompt } from "../../ai/prompts/PromptManager";
import { currentDocImage, paramsForOp, SELECTION_SENSITIVE } from "../../ai/commands/aiCommands";
import type { AIOperation, AIParams, AIResult, AIJob } from "../../ai/types";
import { AI_OPERATIONS } from "../../ai/types";
import { t } from "../../i18n";

interface QuickActionSpec {
  op: AIOperation;
  labelKey: string;
  requireSelection: boolean;
}

const QUICK_ACTIONS: QuickActionSpec[] = [
  { op: "removeBackground", labelKey: "aiRemoveBackground", requireSelection: false },
  { op: "selectSubject", labelKey: "aiSelectSubject", requireSelection: false },
  { op: "upscale", labelKey: "aiUpscale", requireSelection: false },
  { op: "generativeFill", labelKey: "aiGenerativeFill", requireSelection: true },
  { op: "denoise", labelKey: "aiDenoise", requireSelection: false },
  { op: "sharpen", labelKey: "aiSharpen", requireSelection: false },
  { op: "colorize", labelKey: "aiColorize", requireSelection: false },
  { op: "enhance", labelKey: "aiEnhance", requireSelection: false },
  { op: "generateImage", labelKey: "aiGenerate", requireSelection: false },
  { op: "describe", labelKey: "aiDescribe", requireSelection: false },
];

function formatStructured(stored: Record<string, unknown>): string {
  try {
    return JSON.stringify(stored, null, 1).replace(/"([^"]+)":/g, "$1:");
  } catch {
    return String(stored);
  }
}

export function AIPanel() {
  const aiJobs = useEditorStore((s) => s.aiJobs);
  const aiLastResult = useEditorStore((s) => s.aiLastResult);
  const hasDoc = useEditorStore((s) => !!s.doc);
  const [prompt, setPrompt] = useState("");
  const [op, setOp] = useState<AIOperation>("generativeFill");
  const [error, setError] = useState<string | null>(null);
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => selectionEngine.subscribe(() => force()), []);

  const providerAvailable = aiService.providerAvailable();
  const activeProviderId = aiService.activeProviderId();
  const capabilities = aiService.availableCapabilities();
  const isMock = activeProviderId === "mock" && providerAvailable;
  const busy = aiJobs.some((j) => j.status === "queued" || j.status === "running");
  const selectionActive = hasDoc && selectionEngine.hasSelection;

  const handleResult = (result: AIResult, applySelection: boolean, autoInsert: boolean): void => {
    if (applySelection && result.selection) applyAiSelectionToEditor(result.selection);
    if (autoInsert && result.canvas) {
      const report = insertAiResultAsLayer(result);
      useEditorStore.getState().setStatus(report.ok ? "AI result added as a layer." : `AI: ${report.reason ?? "insert failed"}`);
    }
  };

  const runOp = useCallback(
    async (operation: AIOperation, params: AIParams, applySelection: boolean, autoInsert: boolean) => {
      setError(null);
      const state = useEditorStore.getState();
      if (!state.doc) {
        setError(t("aiFriendlyUnavailable"));
        state.setStatus("AI: no document open");
        return;
      }
      const img = currentDocImage();
      if (!img) {
        setError("No image available to process.");
        state.setStatus("AI: no image available");
        return;
      }
      const selection = selectionEngine.hasSelection ? aiSelectionFromEditor() : null;
      try {
        const result = await aiService.run({
          operation,
          image: img,
          selection,
          params,
        });
        handleResult(result, applySelection, autoInsert);
        state.setStatus(`AI: ${AI_TASK_LABELS[operation] ?? operation} — ${shortDescribe(result)}`);
      } catch (err) {
        const msg = AIError.userSafe(err);
        setError(msg);
        state.setStatus(`AI: ${msg}`);
      }
    },
    []
  );

  const runLocal = useCallback(async () => {
    setError(null);
    const img = currentDocImage();
    if (!img) return;
    try {
      const result = await aiService.analyzeLocal(img);
      handleResult(result, false, false);
      useEditorStore.getState().setStatus(simpleLocalSummary(result));
    } catch (err) {
      setError(AIError.userSafe(err));
    }
  }, []);

  const runSelected = () => {
    const params = paramsForOp(op, buildOperationPrompt(op, { prompt: prompt.trim() || null }));
    void runOp(op, params, op === "selectSubject", !SELECTION_SENSITIVE.includes(op));
  };

  return (
    <PanelShell
      id="ai"
      title={t("aiPanel")}
      right={<span className={`vs-ai-dot ${providerAvailable ? "on" : "off"}`} title={aiService.providerReason()} />}
    >
      <div className="vs-ai">
        {isMock && <div className="vs-ai-mock-badge">{t("aiMockBadge")}</div>}

        <div className="vs-ai-status">
          <span className="vs-ai-status-label">{t("aiProvider")}:</span>
          <strong>{AI_PROVIDER_LABELS[activeProviderId] ?? activeProviderId}</strong>
          <span className={`vs-ai-status-pill ${providerAvailable ? "ok" : "bad"}`}>
            {providerAvailable ? t("aiAvailable") : t("aiUnavailable")}
          </span>
          <button className="vs-btn sm" onClick={() => useEditorStore.getState().openDialog({ name: "preferences" })}>
            {t("aiConfigure")}
          </button>
        </div>

        {!providerAvailable && <div className="vs-ai-unavailable">{t("aiFriendlyUnavailable")}</div>}

        <div className="vs-ai-run">
          <select
            className="vs-input"
            value={op}
            onChange={(e) => setOp(e.target.value as AIOperation)}
            disabled={!providerAvailable}
          >
            {AI_OPERATIONS.map((o) => (
              <option key={o} value={o} disabled={!capabilities.includes(o)}>
                {AI_TASK_LABELS[o] ?? o}
                {!capabilities.includes(o) ? " —" : ""}
              </option>
            ))}
          </select>

          <input
            className="vs-input"
            type="text"
            placeholder={t("aiPrompt")}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={!providerAvailable}
          />

          <button
            className="vs-btn primary"
            onClick={() => void runSelected()}
            disabled={!providerAvailable || !hasDoc || busy}
          >
            {busy ? t("aiBusy") : t("aiRun")}
          </button>
        </div>

        <div className="vs-ai-section-title">{t("aiQuickActions")}</div>
        <div className="vs-ai-quick">
          {QUICK_ACTIONS.map((qa) => {
            const supported = capabilities.includes(qa.op);
            const needsSel = qa.requireSelection && !selectionActive;
            return (
              <button
                key={qa.op}
                className="vs-btn vs-ai-quick-btn"
                disabled={!supported || !hasDoc || busy || needsSel}
                title={needsSel ? t("aiNoSelection") : undefined}
                onClick={() => {
                  void runOp(
                    qa.op,
                    paramsForOp(qa.op, qa.op === "generateImage" ? prompt : ""),
                    qa.op === "selectSubject",
                    !SELECTION_SENSITIVE.includes(qa.op)
                  );
                }}
              >
                {t(qa.labelKey)}
              </button>
            );
          })}
        </div>

        <button className="vs-btn" disabled={!hasDoc || busy} onClick={() => void runLocal()}>
          {t("aiAnalyzeLocal")}
        </button>

        {selectionActive && <div className="vs-ai-sel-badge">{t("aiSelectionActive")}</div>}

        {error && <div className="vs-ai-error">{error}</div>}

        {aiLastResult && (
          <div className="vs-ai-result">
            <div className="vs-ai-section-title">
              {t("aiAnalysisResult")} · {aiLastResult.origin}
            </div>
            {aiLastResult.canvas && (
              <div className="vs-ai-result-canvas">
                <canvas width={aiLastResult.canvas.width} height={aiLastResult.canvas.height}
                  ref={(c) => { if (c && aiLastResult.canvas) { c.width = aiLastResult.canvas.width; c.height = aiLastResult.canvas.height; const ctx = c.getContext("2d"); ctx?.drawImage(aiLastResult.canvas, 0, 0); } }} />
              </div>
            )}
            {aiLastResult.text && <div className="vs-ai-result-text">{aiLastResult.text}</div>}
            {aiLastResult.structured && (
              <pre className="vs-ai-result-json">{formatStructured(aiLastResult.structured)}</pre>
            )}
          </div>
        )}

        <div className="vs-ai-section-title">
          {t("aiJobs")}
          {aiJobs.filter((j) => j.status === "queued" || j.status === "running").length > 0 && (
            <button className="vs-btn sm" onClick={() => aiService.cancelAll()}>{t("aiCancelAll")}</button>
          )}
        </div>

        <div className="vs-ai-jobs">
          {aiJobs.length === 0 ? (
            <span className="vs-ai-empty">{t("aiNoJobs")}</span>
          ) : (
            aiJobs.map((job) => <JobRow key={job.id} job={job} />)
          )}
        </div>
      </div>
    </PanelShell>
  );
}

function JobRow({ job }: { job: AIJob }) {
  const state = useEditorStore.getState();
  const running = job.status === "running" || job.status === "queued";
  return (
    <div className={`vs-ai-job ${job.status}`}>
      <div className="vs-ai-job-head">
        <span className="vs-ai-job-label">{job.label}</span>
        <span className={`vs-ai-job-status ${job.status}`}>{job.status}</span>
      </div>
      {job.status === "running" && (
        <div className="vs-ai-progress"><div className="vs-ai-progress-fill" style={{ width: `${Math.max(3, job.progress)}%` }} /></div>
      )}
      {job.status === "failed" && job.error && <div className="vs-ai-job-error">{job.error}</div>}
      <div className="vs-ai-job-actions">
        {running && (
          <button className="vs-btn sm" onClick={() => aiService.cancelJob(job.id)}>{t("aiCancel")}</button>
        )}
        {job.status === "completed" && job.result && (
          <CompletedActions job={job} setStatus={(m: string) => { state.setStatus(m); state.setAiResult(job.result); }} />
        )}
        {!running && (
          <button className="vs-btn sm" onClick={() => state.setAiJobState(state.aiJobs.filter((j) => j.id !== job.id))}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function CompletedActions({ job, setStatus }: { job: AIJob; setStatus: (m: string) => void }) {
  const result = job.result;
  if (!result) return null;
  return (
    <>
      {result.canvas && (
        <button className="vs-btn sm primary" onClick={() => {
          const report = insertAiResultAsLayer(result);
          setStatus(report.ok ? "AI result added as a layer." : `AI: ${report.reason ?? "insert failed"}`);
        }}>
          {t("aiInsertLayer")}
        </button>
      )}
      {result.selection && (
        <button className="vs-btn sm" onClick={() => { applyAiSelectionToEditor(result.selection); setStatus("AI selection applied."); }}>
          {t("aiApplySelection")}
        </button>
      )}
      {result.text && (
        <button className="vs-btn sm" onClick={() => { void navigator.clipboard?.writeText(result.text ?? ""); setStatus("AI text copied."); }}>
          {t("aiCopyText")}
        </button>
      )}
    </>
  );
}

function shortDescribe(result: AIResult): string {
  if (result.canvas) return `${result.canvas.width}×${result.canvas.height} image`;
  if (result.text) return `${result.text.slice(0, 64)}…`;
  if (result.selection) return "selection produced";
  return "done";
}

function simpleLocalSummary(result: AIResult): string {
  const s = result.structured as { note?: string } | null;
  return `AI: local analysis — ${s && "note" in s ? "pixel statistics computed" : "done"}`;
}