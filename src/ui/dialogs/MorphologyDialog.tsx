import { useState, useEffect, useCallback, useRef } from "react";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import { selectionEngine } from "../../editor/selection/selectionEngine";
import {
  type ProcessOp,
  type ProcessParams,
  type MorphoComponentStats,
  MORPHO_OPS,
  MORPHO_BINARY_OPS,
  analyzeConnectedComponents,
  binaryFromLuminanceThreshold,
} from "../../editor/processing/processor";
import { specs } from "../../editor/processing/filterSpecs";
import type { MorphoTarget } from "../../editor/core/engine";
import { createCanvas, getContext2d } from "../../utils/canvas";
import { t } from "../../i18n";

interface MorphoPayload {
  op?: ProcessOp;
  target?: MorphoTarget;
}

const CONTINUOUS_OPS: ReadonlyArray<ProcessOp> = [
  "morphoErosion",
  "morphoDilation",
  "morphoOpening",
  "morphoClosing",
  "morphoGradient",
  "morphoTopHat",
  "morphoBlackHat",
];

function isContinuous(op: ProcessOp): boolean {
  return (CONTINUOUS_OPS as readonly ProcessOp[]).includes(op);
}

function isBinaryOnly(op: ProcessOp): boolean {
  return (MORPHO_BINARY_OPS as readonly ProcessOp[]).includes(op);
}

function defaultsFor(op: ProcessOp): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of specs[op]?.params ?? []) out[p.key] = p.def;
  return out;
}

function paramsFor(values: Record<string, number>, kernel: string): ProcessParams {
  const params: ProcessParams = {};
  if (values.shape !== undefined) params.shape = values.shape;
  if (values.size !== undefined) params.size = values.size;
  if (values.iterations !== undefined) params.iterations = values.iterations;
  if (values.borderMode !== undefined) params.borderMode = values.borderMode;
  if (values.borderValue !== undefined) params.borderValue = values.borderValue;
  if (values.inputMode !== undefined) params.inputMode = values.inputMode;
  if (values.threshold !== undefined) params.threshold = values.threshold;
  if (values.markerThreshold !== undefined) params.markerThreshold = values.markerThreshold;
  const trimmed = kernel.trim();
  if (trimmed.length > 0) params.customKernel = trimmed;
  return params;
}

function kernelValid(text: string): boolean {
  if (!text.trim()) return true;
  const rows = text.split(/[/;\n]/).map((r) => r.trim()).filter((r) => r.length > 0);
  if (rows.length === 0 || rows.length % 2 !== 1) return false;
  const cols = rows[0]!.split(/[\s,]+/).filter((x) => x.length > 0).length;
  if (cols % 2 !== 1) return false;
  for (const row of rows) {
    const cells = row.split(/[\s,]+/).filter((x) => x.length > 0);
    if (cells.length !== cols) return false;
    for (const c of cells) if (c !== "0" && c !== "1") return false;
  }
  return true;
}

function maskTargetAvailable(): boolean {
  const l = runtime.engine?.topEditableImageLayer();
  return !!l && !!l.mask && l.mask.enabled;
}

export function MorphologyDialog() {
  const dialog = useEditorStore((s) => s.dialog);
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const payload = dialog?.payload as MorphoPayload | undefined;

  const [op, setOp] = useState<ProcessOp>(payload?.op && MORPHO_OPS.includes(payload.op) ? payload.op : "morphoErosion");
  const [values, setValues] = useState<Record<string, number>>(() => defaultsFor(payload?.op ?? "morphoErosion"));
  const [kernel, setKernel] = useState("");
  const [target, setTarget] = useState<MorphoTarget>(() => {
    if (payload?.target && payload.target !== "layer") {
      if (payload.target === "mask" && maskTargetAvailable()) return "mask";
      if (payload.target === "selection" && selectionEngine.hasSelection) return "selection";
    }
    return "layer";
  });

  const [previewCanvas, setPreviewCanvas] = useState<HTMLCanvasElement | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<MorphoComponentStats | null>(null);
  const gen = useRef(0);
  const canvasHolderRef = useRef<HTMLDivElement>(null);

  const engine = runtime.engine;
  const hasMask = maskTargetAvailable();
  const hasSelection = selectionEngine.hasSelection;
  const isBinOp = isBinaryOnly(op);
  const isCont = isContinuous(op);
  const singleChannelTarget = target !== "layer";
  const showThreshold = isBinOp || (isCont && (values.inputMode ?? 0) === 1);
  const showIterations = isCont || op === "morphoThinning" || op === "morphoThickening";

  const generatePreview = useCallback(async (opNow: ProcessOp, v: Record<string, number>, g: string, targetNow: MorphoTarget) => {
    if (!engine) return;
    const ver = ++gen.current;
    setPreviewing(true);
    setError(null);
    setStats(null);
    try {
      const canvas = await engine.morphoPreview(opNow, paramsFor(v, g), targetNow);
      if (ver !== gen.current) return;
      setPreviewCanvas(canvas);
      if (opNow === "morphoComponents") {
        const ctx = getContext2d(canvas);
        const w = canvas.width;
        const h = canvas.height;
        const data = ctx.getImageData(0, 0, w, h).data;
        setStats(analyzeConnectedComponents(binaryFromLuminanceThreshold(data, w, h, 128), w, h));
      }
    } catch (err) {
      if (ver !== gen.current) return;
      setError((err as Error).message);
    } finally {
      if (ver === gen.current) setPreviewing(false);
    }
  }, [engine]);

  useEffect(() => {
    setValues(defaultsFor(op));
    gen.current++;
    setPreviewCanvas(null);
    setError(null);
    setStats(null);
    return () => { gen.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op]);

  useEffect(() => {
    const timer = setTimeout(() => void generatePreview(op, values, kernel, target), 120);
    return () => clearTimeout(timer);
  }, [op, values, kernel, target, generatePreview]);

  useEffect(() => {
    const holder = canvasHolderRef.current;
    if (!holder) return;
    holder.replaceChildren();
    if (previewCanvas) {
      const canvas = createCanvas(previewCanvas.width, previewCanvas.height);
      getContext2d(canvas).drawImage(previewCanvas, 0, 0);
      canvas.style.maxWidth = "100%";
      canvas.style.maxHeight = "100%";
      canvas.style.objectFit = "contain";
      holder.appendChild(canvas);
    } else {
      const spin = document.createElement("div");
      spin.className = "vs-spinner";
      holder.appendChild(spin);
    }
  }, [previewCanvas, previewing]);

  useEffect(() => {
    return () => { engine?.cancelFilterPreviews(); };
  }, [engine]);

  const reset = () => {
    gen.current++;
    setValues(defaultsFor(op));
    setKernel("");
    setError(null);
  };

  const cancel = () => {
    engine?.cancelFilterPreviews();
    closeDialog();
  };

  const handleApply = async () => {
    if (!engine || applying) return;
    if (target === "mask" && !hasMask) { setError(t("morphoNoMaskTarget")); return; }
    if (target === "selection" && !hasSelection) { setError(t("morphoNoSelectionTarget")); return; }
    if (!kernelValid(kernel)) { setError(t("morphoCustomKernelHint")); return; }
    setApplying(true);
    setError(null);
    try {
      const historyName = `${t("morphoProcessing")} — ${t(op)}`;
      await engine.morphoApply(op, paramsFor(values, kernel), target, historyName);
      if (op === "morphoComponents") {
        const fullStats = await engine.morphoComponentStats(target);
        if (fullStats) useEditorStore.setState({ status: `${t("morphoCount")}: ${fullStats.count}` });
      }
      cancel();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const setVal = (key: string, val: number) => setValues((v) => ({ ...v, [key]: val }));

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div className="vs-modal vs-dialog-filter vs-dialog-morpho">
        <div className="vs-modal-header">
          <span>{t("morphoProcessing")}</span>
          <button className="vs-btn" style={{ padding: "2px 8px", fontSize: 14 }} onClick={cancel}>×</button>
        </div>
        <div className="vs-modal-body">
          <div className="controls">
            <div className="slider-row">
              <label>{t("morphoOperation")}</label>
              <select className="vs-select" value={op} onChange={(e) => setOp(e.target.value as ProcessOp)}>
                {MORPHO_OPS.map((m) => (
                  <option key={m} value={m}>{t(m)}</option>
                ))}
              </select>
            </div>
            <div className="slider-row">
              <label>{t("morphoTarget")}</label>
              <div className="morpho-targets">
                <button
                  type="button"
                  className={`vs-btn ${target === "layer" ? "primary" : ""}`}
                  onClick={() => setTarget("layer")}
                >
                  {t("morphoTargetLayer")}
                </button>
                <button
                  type="button"
                  className={`vs-btn ${target === "mask" ? "primary" : ""}`}
                  disabled={!hasMask}
                  title={hasMask ? undefined : t("morphoNoMaskTarget")}
                  onClick={() => setTarget("mask")}
                >
                  {t("morphoTargetMask")}
                </button>
                <button
                  type="button"
                  className={`vs-btn ${target === "selection" ? "primary" : ""}`}
                  disabled={!hasSelection}
                  title={hasSelection ? undefined : t("morphoNoSelectionTarget")}
                  onClick={() => setTarget("selection")}
                >
                  {t("morphoTargetSelection")}
                </button>
              </div>
            </div>
            {singleChannelTarget && <div className="filter-desc">{t("morphoMaskGrayNote")}</div>}
            {isCont && (
              <div className="slider-row">
                <label>{t("morphoInputMode")}</label>
                <select
                  className="vs-select"
                  value={values.inputMode ?? 0}
                  onChange={(e) => setVal("inputMode", +e.target.value)}
                >
                  <option value={0}>{t("morphoModeGrayscale")}</option>
                  <option value={1}>{t("morphoModeBinary")}</option>
                  <option value={2}>{t("morphoModePerChannel")}</option>
                </select>
              </div>
            )}
            {showThreshold && !singleChannelTarget && (
              <div className="slider-row">
                <label>{t("morphoThreshold")}</label>
                <input type="range" min={0} max={255} step={1} value={values.threshold ?? 128}
                  onChange={(e) => setVal("threshold", +e.target.value)} />
                <span className="value">{values.threshold ?? 128}</span>
              </div>
            )}
            {(op === "morphoReconstruction") && !singleChannelTarget && (
              <div className="slider-row">
                <label>{t("morphoMarkerThreshold")}</label>
                <input type="range" min={0} max={255} step={1} value={values.markerThreshold ?? 128}
                  onChange={(e) => setVal("markerThreshold", +e.target.value)} />
                <span className="value">{values.markerThreshold ?? 128}</span>
              </div>
            )}
            {(isCont || isBinOp || op === "morphoReconstruction") && (
              <div className="slider-row">
                <label>{t("morphoShapeLabel")}</label>
                <select className="vs-select" value={values.shape ?? 0} onChange={(e) => setVal("shape", +e.target.value)}>
                  <option value={0}>{t("morphoShapeRect")}</option>
                  <option value={1}>{t("morphoShapeEllipse")}</option>
                  <option value={2}>{t("morphoShapeCross")}</option>
                </select>
              </div>
            )}
            {(isCont || isBinOp || op === "morphoReconstruction") && (
              <div className="slider-row">
                <label>{t("morphoSize")}</label>
                <select className="vs-select" value={values.size ?? 3} onChange={(e) => setVal("size", +e.target.value)}>
                  <option value={1}>1</option>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                  <option value={7}>7</option>
                  <option value={9}>9</option>
                </select>
                <span className="value">px</span>
              </div>
            )}
            {(isCont || isBinOp) && (
              <div className="slider-row">
                <label>{t("morphoCustomKernel")}</label>
                <textarea
                  className="vs-textarea morpho-kernel-input"
                  rows={2}
                  placeholder="0 1 0&#10;1 1 1&#10;0 1 0"
                  value={kernel}
                  onChange={(e) => setKernel(e.target.value)}
                />
              </div>
            )}
            {showIterations && (
              <div className="slider-row">
                <label>{t("morphoIterations")}</label>
                <input type="range" min={1} max={12} step={1} value={values.iterations ?? 1}
                  onChange={(e) => setVal("iterations", +e.target.value)} />
                <span className="value">{values.iterations ?? 1}</span>
              </div>
            )}
            {(isCont || op === "morphoBoundary") && (
              <div className="slider-row">
                <label>{t("morphoBorderMode")}</label>
                <select className="vs-select" value={values.borderMode ?? 0} onChange={(e) => setVal("borderMode", +e.target.value)}>
                  <option value={0}>{t("morphoBorderReplicate")}</option>
                  <option value={1}>{t("morphoBorderConstant")}</option>
                  <option value={2}>{t("morphoBorderReflect")}</option>
                </select>
              </div>
            )}
            {isCont && (values.borderMode ?? 0) === 1 && (
              <div className="slider-row">
                <label>{t("morphoBorderValue")}</label>
                <input type="range" min={0} max={255} step={1} value={values.borderValue ?? 0}
                  onChange={(e) => setVal("borderValue", +e.target.value)} />
                <span className="value">{values.borderValue ?? 0}</span>
              </div>
            )}
            {kernel.trim().length > 0 && !kernelValid(kernel) && (
              <div className="filter-error">{t("morphoCustomKernelHint")}</div>
            )}
            {isBinOp && <div className="filter-desc">{t("morphoNoteBinary")}</div>}
            {(op === "morphoSkeleton" || op === "morphoReconstruction") && <div className="filter-desc">{t("morphoNoteConverge")}</div>}
            {specs[op]?.desc && <div className="filter-desc">{specs[op].desc}</div>}
          </div>
          <div className="preview-area">
            <div ref={canvasHolderRef} className="morpho-preview-holder" />
            {previewing && <div className="vs-spinner" style={{ position: "absolute", top: 4, right: 4 }} />}
          </div>
          {op === "morphoComponents" && stats && (
            <div className="morpho-stats">
              <div><strong>{t("morphoCount")}:</strong> {stats.count}</div>
              {stats.count > 0 && stats.components.slice(0, 12).map((c) => (
                <div key={c.id} className="morpho-stats-row">
                  #{c.id} — {t("morphoStatsBBox")} {c.width}×{c.height} @ ({c.x},{c.y}) — {c.area} px
                </div>
              ))}
              {stats.count > 12 && <div>…</div>}
            </div>
          )}
          {error && <div className="filter-error">{error}</div>}
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn" onClick={reset} disabled={applying}>{t("reset")}</button>
          <button className="vs-btn" onClick={cancel} disabled={applying}>{t("cancel")}</button>
          <button className="vs-btn primary" onClick={handleApply} disabled={applying || previewing}>
            {applying ? "Processing…" : t("apply")}
          </button>
        </div>
      </div>
    </div>
  );
}