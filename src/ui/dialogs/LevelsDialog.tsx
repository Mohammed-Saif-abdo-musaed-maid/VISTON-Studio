import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import { computeHistogram, histogramPeak } from "../../editor/histogram/histogramEngine";
import { adjustmentLayerPreview } from "./adjustmentLayerPreview";

interface LevelsParams { black: number; mid: number; white: number; }

const defaults: LevelsParams = { black: 0, mid: 1, white: 255 };

function drawHistogram(ctx: CanvasRenderingContext2D, w: number, h: number, source?: HTMLCanvasElement): void {
  const composite = source ?? runtime.engine?.getComposite();
  if (!composite) return;
  const hist = computeHistogram(composite);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#1a1d23";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#333a44";
  ctx.lineWidth = 1;
  for (const x of [0.25, 0.5, 0.75]) {
    ctx.beginPath();
    ctx.moveTo(w * x, 0);
    ctx.lineTo(w * x, h);
    ctx.stroke();
  }
  const draw = (data: Uint32Array, color: string) => {
    const peak = histogramPeak(data) || 1;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < 256; i++) {
      ctx.lineTo((i / 255) * w, h - (data[i]! / peak) * h * 0.9);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  draw(hist.luma, "rgba(230,230,230,0.5)");
  draw(hist.red, "rgba(255,90,90,0.25)");
  draw(hist.green, "rgba(90,200,90,0.2)");
  draw(hist.blue, "rgba(90,130,255,0.2)");
}

export function LevelsDialog() {
  const dialog = useEditorStore((s) => s.dialog);
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const existingLayerId = (dialog?.payload?.layerId as string) ?? null;
  const engine = runtime.engine;

  const [values, setValues] = useState<LevelsParams>(() => {
    if (existingLayerId) {
      const doc = useEditorStore.getState().doc;
      const l = doc?.getLayer(existingLayerId);
      if (l?.type === "adjustment") {
        const p = l.params?.levels;
        if (p) return { black: p.black ?? 0, mid: p.mid ?? 1, white: p.white ?? 255 };
      }
    }
    return { ...defaults };
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const histRef = useRef<HTMLCanvasElement>(null);

  const params = useMemo<LevelsParams>(() => ({ black: clamp0(values.black), mid: clampMid(values.mid), white: clamp255(values.white) }), [values]);

  useEffect(() => {
    const t = setTimeout(() => {
      const c = adjustmentLayerPreview("levels", { levels: params });
      if (!c) return;
      setPreviewUrl(c.toDataURL());
      const cvs = histRef.current;
      if (cvs) {
        const ctx = cvs.getContext("2d")!;
        drawHistogram(ctx, cvs.width, cvs.height, c);
      }
    }, 90);
    return () => clearTimeout(t);
  }, [params]);

  const commit = (p: LevelsParams) => {
    if (!engine) return;
    if (existingLayerId) {
      engine.updateAdjustmentParams(existingLayerId, { levels: p });
    } else {
      engine.addAdjustmentLayer("levels", { levels: p });
    }
  };

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal vs-dialog-filter">
        <div className="vs-modal-header">
          <span>Levels</span>
          <button className="vs-btn" style={{ padding: "2px 8px", fontSize: 14 }} onClick={closeDialog}>×</button>
        </div>
        <div className="vs-modal-body">
          <div className="preview-area">
            {previewUrl ? <img src={previewUrl} alt="Preview" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <div className="vs-spinner" />}
          </div>
          <canvas ref={histRef} width={300} height={120} style={{ width: "100%", background: "#14171c", borderRadius: 4 }} />
          <div className="controls">
            <div className="slider-row">
              <label>Black</label>
              <input type="range" min={0} max={255} step={1} value={params.black}
                onChange={(e) => setValues((v) => ({ ...v, black: Math.min(+e.target.value, v.white - 1) }))} />
              <span className="value">{Math.round(params.black)}</span>
            </div>
            <div className="slider-row">
              <label>Mid</label>
              <input type="range" min={1} max={9.9} step={0.01} value={Math.round(params.mid * 100) / 100}
                onChange={(e) => setValues((v) => ({ ...v, mid: +e.target.value }))} />
              <span className="value">{params.mid.toFixed(2)}</span>
            </div>
            <div className="slider-row">
              <label>White</label>
              <input type="range" min={0} max={255} step={1} value={params.white}
                onChange={(e) => setValues((v) => ({ ...v, white: Math.max(+e.target.value, v.black + 1) }))} />
              <span className="value">{Math.round(params.white)}</span>
            </div>
          </div>
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn" onClick={() => setValues({ ...defaults })}>Reset</button>
          <button className="vs-btn" onClick={closeDialog}>Cancel</button>
          <button className="vs-btn primary" onClick={() => { commit(params); closeDialog(); }}>
            {existingLayerId ? "Update" : "Add Layer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function clamp0(v: number): number { return Math.max(0, Math.min(254, v)); }
function clamp255(v: number): number { return Math.min(255, Math.max(1, v)); }
function clampMid(v: number): number { return Math.min(9.9, Math.max(0.1, v)); }