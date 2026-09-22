import { useState, useEffect, useCallback } from "react";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import { Adjustments } from "../../editor/processing/processor";

const defaults: Required<Adjustments> = { brightness: 0, contrast: 0, gamma: 1, saturation: 0, exposure: 0, hue: 0, temperature: 0 };

const sliders: { key: keyof Adjustments; label: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
  { key: "brightness", label: "Brightness", min: -100, max: 100, step: 1, fmt: (v) => `${v > 0 ? "+" : ""}${v}` },
  { key: "contrast", label: "Contrast", min: -100, max: 100, step: 1, fmt: (v) => `${v > 0 ? "+" : ""}${v}` },
  { key: "gamma", label: "Gamma", min: 0.1, max: 5, step: 0.05, fmt: (v) => v.toFixed(2) },
  { key: "saturation", label: "Saturation", min: -100, max: 100, step: 1, fmt: (v) => `${v > 0 ? "+" : ""}${v}` },
  { key: "exposure", label: "Exposure", min: -5, max: 5, step: 0.1, fmt: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} EV` },
  { key: "hue", label: "Hue", min: -180, max: 180, step: 1, fmt: (v) => `${v > 0 ? "+" : ""}${v}°` },
  { key: "temperature", label: "Temperature", min: -100, max: 100, step: 1, fmt: (v) => `${v > 0 ? "+" : ""}${v}` },
];

export function AdjustmentsDialog() {
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const [values, setValues] = useState<Required<Adjustments>>({ ...defaults });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const engine = runtime.engine;

  const generatePreview = useCallback(async (v: Required<Adjustments>) => {
    if (!engine) return;
    setPreviewing(true);
    try {
      const preview = await engine.adjustmentsPreview(v);
      setPreviewUrl(preview.toDataURL());
    } finally {
      setPreviewing(false);
    }
  }, [engine]);

  useEffect(() => {
    const t = setTimeout(() => generatePreview(values), 120);
    return () => clearTimeout(t);
  }, [values, generatePreview]);

  const handleApply = async () => {
    if (!engine) return;
    await engine.adjustmentsApply(values);
    closeDialog();
  };

  const reset = () => setValues({ ...defaults });

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal vs-dialog-filter">
        <div className="vs-modal-header">
          <span>Adjustments</span>
          <button className="vs-btn" style={{ padding: "2px 8px", fontSize: 14 }} onClick={closeDialog}>×</button>
        </div>
        <div className="vs-modal-body">
          <div className="preview-area">
            {previewUrl ? <img src={previewUrl} alt="Preview" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <div className="vs-spinner" />}
          </div>
          <div className="controls">
            {sliders.map((s) => (
              <div className="slider-row" key={s.key}>
                <label>{s.label}</label>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={values[s.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [s.key]: +e.target.value }))}
                />
                <span className="value">{s.fmt(values[s.key])}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn" onClick={reset}>Reset</button>
          <button className="vs-btn" onClick={closeDialog}>Cancel</button>
          <button className="vs-btn primary" onClick={handleApply} disabled={previewing}>
            {previewing ? "Processing…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}