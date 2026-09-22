import { useEffect, useRef, useCallback } from "react";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import { computeHistogram, histogramPeak } from "../../editor/histogram/histogramEngine";
import { PanelShell } from "./PanelShell";

function drawChannel(ctx: CanvasRenderingContext2D, data: Uint32Array, w: number, h: number, color: string): void {
  const peak = histogramPeak(data) || 1;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * w;
    const y = h - (data[i]! / peak) * h * 0.95;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function HistogramPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const version = useEditorStore((s) => s.historyIndex);
  const collapsed = useEditorStore((s) => s.panelCollapsed.histogram);

  const redraw = useCallback(() => {
    const doc = useEditorStore.getState().doc;
    const cvs = canvasRef.current;
    if (!doc || !cvs) return;
    if (useEditorStore.getState().panelCollapsed.histogram) return;
    const composite = runtime.engine?.getComposite();
    if (!composite) return;
    const hist = computeHistogram(composite);
    const ctx = cvs.getContext("2d")!;
    const w = cvs.width;
    const h = cvs.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#1a1d23";
    ctx.fillRect(0, 0, w, h);
    drawChannel(ctx, hist.red, w, h, "rgba(255,80,80,0.5)");
    drawChannel(ctx, hist.green, w, h, "rgba(80,200,80,0.4)");
    drawChannel(ctx, hist.blue, w, h, "rgba(80,120,255,0.4)");
    drawChannel(ctx, hist.luma, w, h, "rgba(220,220,220,0.6)");
  }, []);

  useEffect(() => {
    redraw();
  }, [version, collapsed, redraw]);

  return (
    <PanelShell id="histogram" title="Histogram">
      <canvas ref={canvasRef} width={248} height={100} className="vs-histogram-canvas" />
    </PanelShell>
  );
}