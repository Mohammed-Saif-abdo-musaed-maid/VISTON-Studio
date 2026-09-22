import { useState, useEffect, useCallback, useRef } from "react";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import { ProcessOp, ProcessParams } from "../../editor/processing/processor";
import { specs } from "../../editor/processing/filterSpecs";
import { t } from "../../i18n";

function defaultsFor(op: ProcessOp, initial?: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of specs[op]?.params ?? []) out[p.key] = p.def;
  if (initial) Object.assign(out, initial);
  return out;
}

function paramsFor(op: ProcessOp, values: Record<string, number>): ProcessParams {
  if (op === "adjustments") return { values: { brightness: values.brightness ?? 0, contrast: values.contrast ?? 0, gamma: values.gamma ?? 1, saturation: values.saturation ?? 0, exposure: values.exposure ?? 0, hue: values.hue ?? 0, temperature: values.temperature ?? 0 } };
  const params: ProcessParams = {};
  if (values.radius !== undefined) params.radius = values.radius;
  if (values.amount !== undefined) params.amount = values.amount;
  if (values.threshold !== undefined) params.threshold = values.threshold;
  if (values.strength !== undefined) params.strength = values.strength;
  if (values.angle !== undefined) params.angle = values.angle;
  if (values.blur !== undefined) params.blur = values.blur;
  if (values.edgeStrength !== undefined) params.edgeStrength = values.edgeStrength;
  if (values.noiseProtection !== undefined) params.noiseProtection = values.noiseProtection;
  if (values.noiseReduction !== undefined) params.noiseReduction = values.noiseReduction;
  if (values.shadowFade !== undefined) params.shadowFade = values.shadowFade;
  if (values.highlightFade !== undefined) params.highlightFade = values.highlightFade;
  if (values.fineDetail !== undefined) params.fineDetail = values.fineDetail;
  if (values.mediumDetail !== undefined) params.mediumDetail = values.mediumDetail;
  if (values.largeDetail !== undefined) params.largeDetail = values.largeDetail;
  if (values.texturePreservation !== undefined) params.texturePreservation = values.texturePreservation;
  if (values.fineTexture !== undefined) params.fineTexture = values.fineTexture;
  if (values.mediumTexture !== undefined) params.mediumTexture = values.mediumTexture;
  if (values.detail !== undefined) params.detail = values.detail;
  if (values.lowThreshold !== undefined) params.lowThreshold = values.lowThreshold;
  if (values.highThreshold !== undefined) params.highThreshold = values.highThreshold;
  if (values.noiseType !== undefined) params.noiseType = values.noiseType;
  if (values.mean !== undefined) params.mean = values.mean;
  if (values.variance !== undefined) params.variance = values.variance;
  if (values.saltProb !== undefined) params.saltProb = values.saltProb;
  if (values.pepperProb !== undefined) params.pepperProb = values.pepperProb;
  if (values.seed !== undefined) params.seed = values.seed;
  if (values.kernel !== undefined) params.kernel = values.kernel;
  if (values.q !== undefined) params.q = values.q;
  if (values.trim !== undefined) params.trim = values.trim;
  if (values.noiseVarianceMode !== undefined) params.noiseVarianceMode = values.noiseVarianceMode;
  if (values.noiseVariance !== undefined) params.noiseVariance = values.noiseVariance;
  return params;
}

export function FilterDialog() {
  const dialog = useEditorStore((s) => s.dialog);
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const payload = dialog?.payload as { op?: ProcessOp; label?: string; values?: Record<string, number> } | undefined;
  const op = payload?.op ?? "brightness";
  const spec = specs[op] ?? specs.brightness!;

  const [values, setValues] = useState<Record<string, number>>(() => defaultsFor(op, payload?.values));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0);

  const engine = runtime.engine;

  const generatePreview = useCallback(async (opNow: ProcessOp, v: Record<string, number>) => {
    if (!engine) return;
    const ver = ++gen.current;
    setPreviewing(true);
    setError(null);
    try {
      const preview = await engine.filterPreview(opNow, paramsFor(opNow, v));
      if (ver !== gen.current) return;
      setPreviewUrl(preview.toDataURL());
    } catch (err) {
      if (ver !== gen.current) return; // superseded preview — ignore
      setError((err as Error).message);
    } finally {
      if (ver === gen.current) setPreviewing(false);
    }
  }, [engine]);

  useEffect(() => {
    setValues(defaultsFor(op, payload?.values));
    gen.current++;
    setPreviewUrl(null);
    return () => { gen.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op, payload?.values]);

  useEffect(() => {
    const t3 = setTimeout(() => generatePreview(op, values), 120);
    return () => clearTimeout(t3);
  }, [values, op, generatePreview]);

  useEffect(() => {
    return () => { engine?.cancelFilterPreviews(); };
  }, [engine]);

  const reset = () => { setValues(defaultsFor(op, payload?.values)); };

  const cancel = () => { engine?.cancelFilterPreviews(); closeDialog(); };

  const handleApply = async () => {
    if (!engine || applying) return;
    setApplying(true);
    setError(null);
    try {
      const historyName = t(spec.label);
      await engine.filterApply(op, paramsFor(op, values), historyName);
      cancel();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div className="vs-modal vs-dialog-filter">
        <div className="vs-modal-header">
          <span>{t(spec.label)}</span>
          <button className="vs-btn" style={{ padding: "2px 8px", fontSize: 14 }} onClick={cancel}>×</button>
        </div>
        <div className="vs-modal-body">
          <div className="preview-area">
            {previewUrl ? <img src={previewUrl} alt="Preview" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <div className="vs-spinner" />}
          </div>
          <div className="controls">
            {spec.desc && <div className="filter-desc">{spec.desc}</div>}
            {spec.params.map((p) => (
              <div className="slider-row" key={p.key}>
                <label>{t(p.label)}</label>
                {p.options ? (
                  <select
                    className="vs-select"
                    value={values[p.key] ?? p.def}
                    onChange={(e) => setValues((v) => ({ ...v, [p.key]: +e.target.value }))}
                  >
                    {p.options.map((o) => (
                      <option key={o.value} value={o.value}>{t(o.label)}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="range"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={values[p.key] ?? p.def}
                    onChange={(e) => setValues((v) => ({ ...v, [p.key]: +e.target.value }))}
                  />
                )}
                <span className="value">{(values[p.key] ?? p.def).toLocaleString()}{p.unit}</span>
              </div>
            ))}
            {spec.params.length === 0 && previewing && <div className="vs-spinner" style={{ margin: "8px auto" }} />}
          </div>
          {error && <div className="filter-error">{error}</div>}
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn" onClick={reset} disabled={applying}>Reset</button>
          <button className="vs-btn" onClick={cancel} disabled={applying}>Cancel</button>
          <button className="vs-btn primary" onClick={handleApply} disabled={applying || previewing}>
            {applying ? "Processing…" : t("apply")}
          </button>
        </div>
      </div>
    </div>
  );
}