import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import { computeHistogram, histogramPeak } from "../../editor/histogram/histogramEngine";
import { adjustmentLayerPreview } from "./adjustmentLayerPreview";

const CANVAS_W = 300;
const CANVAS_H = 256;
type Pt = [number, number];

const defaultCurve: Pt[] = [[0, 0], [255, 255]];

function norm(x: number): number { return Math.max(0, Math.min(255, x)); }

export function CurvesDialog() {
  const dialog = useEditorStore((s) => s.dialog);
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const existingLayerId = (dialog?.payload?.layerId as string) ?? null;
  const engine = runtime.engine;

  const [points, setPoints] = useState<Pt[]>(() => {
    if (existingLayerId) {
      const doc = useEditorStore.getState().doc;
      const l = doc?.getLayer(existingLayerId);
      if (l?.type === "adjustment" && Array.isArray(l.params?.curves) && l.params!.curves!.length >= 2) {
        return (l.params!.curves! as number[][]).map((p) => [norm(p[0]), norm(p[1])] as Pt);
      }
    }
    return defaultCurve.map((p) => [...p] as Pt);
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ index: number } | null>(null);

  const draw = useCallback((pts: Pt[]) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d")!;
    const w = cvs.width;
    const h = cvs.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#14171c";
    ctx.fillRect(0, 0, w, h);
    const composite = runtime.engine?.getComposite();
    if (composite) {
      const hist = computeHistogram(composite);
      const drawCh = (data: Uint32Array, color: string) => {
        const peak = histogramPeak(data) || 1;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let i = 0; i < 256; i++) {
          ctx.lineTo((i / 255) * w, h - (data[i]! / peak) * h * 0.85);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      };
      drawCh(hist.luma, "rgba(200,200,200,0.35)");
      drawCh(hist.red, "rgba(255,90,90,0.18)");
      drawCh(hist.green, "rgba(90,200,90,0.15)");
      drawCh(hist.blue, "rgba(90,130,255,0.15)");
    }
    ctx.strokeStyle = "#2d333d";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, h);
    for (let i = 0.25; i < 1; i += 0.25) {
      ctx.moveTo((i * 255 / 255) * w, 0);
      ctx.lineTo((i * 255 / 255) * w, h);
      ctx.moveTo(0, (i * 255 / 255) * h);
      ctx.lineTo(w, (i * 255 / 255) * h);
    }
    ctx.stroke();
    const sorted = [...pts].sort((a, b) => a[0] - b[0]);
    ctx.strokeStyle = "#4a9eff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    sorted.forEach((p, i) => {
      const x = (p[0] / 255) * w;
      const y = h - (p[1] / 255) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#2b6fd4";
    ctx.lineWidth = 1.5;
    for (const p of sorted) {
      const x = (p[0] / 255) * w;
      const y = h - (p[1] / 255) * h;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    draw(points);
    const t = setTimeout(() => {
      const c = adjustmentLayerPreview("curves", { curves: points });
      if (c) setPreviewUrl(c.toDataURL());
    }, 90);
    return () => clearTimeout(t);
  }, [points, draw]);

  const ptAt = (clientX: number, clientY: number): Pt => {
    const cvs = canvasRef.current!;
    const rect = cvs.getBoundingClientRect();
    const x = norm(Math.round(((clientX - rect.left) / rect.width) * 255));
    const y = norm(Math.round(255 - ((clientY - rect.top) / rect.height) * 255));
    return [x, y];
  };

  const hitPoint = (p: Pt, tolPx = 10): number => {
    const cvs = canvasRef.current!;
    const rect = cvs.getBoundingClientRect();
    let best = -1;
    let bestD = (tolPx / rect.width) * 1;
    for (let i = 0; i < points.length; i++) {
      const dx = (points[i]![0] / 255) * rect.width - (p[0] / 255) * rect.width;
      const dy = (points[i]![1] / 255) * rect.height - (p[1] / 255) * rect.height;
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = ptAt(e.clientX, e.clientY);
    const idx = hitPoint(pt);
    if (idx >= 0) {
      dragRef.current = { index: idx };
    } else {
      const sorted = [...points].sort((a, b) => a[0] - b[0]);
      const insert: Pt[] = [pt];
      const merged = [...sorted, ...insert].sort((a, b) => a[0] - b[0]);
      const dedup = merged.reduce<Pt[]>((acc, p) => {
        if (acc.length === 0 || acc[acc.length - 1]![0] < p[0]) acc.push(p);
        return acc;
      }, []);
      dragRef.current = { index: dedup.findIndex((p) => p[0] === pt[0]) };
      setPoints(dedup);
    }
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const pt = ptAt(e.clientX, e.clientY);
    setPoints((prev) => prev.map((p, i) => {
      if (i !== drag.index) return p;
      const minX = i === 0 ? 0 : prev[i - 1] ? prev[i - 1]![0] + 1 : 0;
      const maxX = i === prev.length - 1 ? 255 : prev[i + 1] ? prev[i + 1]![0] - 1 : 255;
      return [Math.max(minX, Math.min(maxX, pt[0])), pt[1]];
    }));
  };

  const onPointerUp = () => { dragRef.current = null; };

  const onDblClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = ptAt(e.clientX, e.clientY);
    setPoints((prev) => {
      if (prev.length <= 2) return prev;
      const idx = prev.findIndex((p) => p[0] === pt[0] && p[1] === pt[1]);
      if (idx < 0) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  };

  const applyCurve = useCallback((pts: Pt[]) => {
    const sorted = [...pts].sort((a, b) => a[0] - b[0]);
    if (!engine) return;
    if (existingLayerId) {
      engine.updateAdjustmentParams(existingLayerId, { curves: sorted });
    } else {
      engine.addAdjustmentLayer("curves", { curves: sorted });
    }
  }, [engine, existingLayerId]);

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal vs-dialog-filter">
        <div className="vs-modal-header">
          <span>Curves</span>
          <button className="vs-btn" style={{ padding: "2px 8px", fontSize: 14 }} onClick={closeDialog}>×</button>
        </div>
        <div className="vs-modal-body">
          <div className="preview-area">
            {previewUrl ? <img src={previewUrl} alt="Preview" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <div className="vs-spinner" />}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>
            Drag points to reshape the curve. Click the line to add a point. Double-click a point to remove it.
          </div>
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            style={{ width: "100%", borderRadius: 4, cursor: "crosshair", touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={onDblClick}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-dim)" }}><span>0</span><span>255</span></div>
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn" onClick={() => setPoints(defaultCurve.map((p) => [...p] as Pt))}>Reset</button>
          <button className="vs-btn" onClick={closeDialog}>Cancel</button>
          <button className="vs-btn primary" onClick={() => { applyCurve(points); closeDialog(); }}>
            {existingLayerId ? "Update" : "Add Layer"}
          </button>
        </div>
      </div>
    </div>
  );
}