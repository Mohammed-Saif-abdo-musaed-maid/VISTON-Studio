import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import { TextLayer } from "../../editor/core/types";
import { drawTextLayer } from "../../editor/renderer/textRenderer";
import { createCanvas, getContext2d } from "../../utils/canvas";

const FONTS = ["Arial", "Helvetica", "Times New Roman", "Courier New", "Georgia", "Verdana"];
const PATH_CANVAS_W = 420;
const PATH_CANVAS_H = 180;

export function TextEditDialog() {
  const dialog = useEditorStore((s) => s.dialog);
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const payload = dialog?.payload as { layerId: string } | undefined;
  const doc = useEditorStore.getState().doc;
  const layer = payload?.layerId ? doc?.getLayer(payload.layerId) as TextLayer | undefined : undefined;

  const [text, setText] = useState(layer?.text ?? "Text");
  const [fontFamily, setFontFamily] = useState(layer?.fontFamily ?? "Arial");
  const [fontSize, setFontSize] = useState(layer?.fontSize ?? 48);
  const [fontWeight, setFontWeight] = useState(layer?.fontWeight ?? 400);
  const [fontStyle, setFontStyle] = useState<"normal" | "italic">(layer?.fontStyle ?? "normal");
  const [color, setColor] = useState(layer?.color ?? "#222222");
  const [align, setAlign] = useState(layer?.align ?? "center");
  const [direction, setDirection] = useState(layer?.direction ?? "ltr");
  const [letterSpacing, setLetterSpacing] = useState(layer?.letterSpacing ?? 0);
  const [lineHeight, setLineHeight] = useState(layer?.lineHeight ?? 1.4);
  const [autoFit, setAutoFit] = useState(layer?.autoFit ?? false);
  const [overflowHidden, setOverflowHidden] = useState(layer?.overflowHidden ?? true);
  const [pathPoints, setPathPoints] = useState<number[][]>(() => (layer?.textPath && layer.textPath.points.length >= 2 ? layer.textPath.points.map((p) => [p[0], p[1]]) : []));
  const [usePath, setUsePath] = useState(!!(layer?.textPath && layer.textPath.points.length >= 2));
  const pathCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  if (!layer) { return null; }

  const lw = Math.max(1, layer.transform.width);
  const lh = Math.max(1, layer.transform.height);
  const pathScale = Math.min(PATH_CANVAS_W / lw, PATH_CANVAS_H / lh);
  const pathOx = (PATH_CANVAS_W - lw * pathScale) / 2;
  const pathOy = (PATH_CANVAS_H - lh * pathScale) / 2;

  const drawPathCanvas = () => {
    const cvs = pathCanvasRef.current;
    if (!cvs) return;
    const ctx = getContext2d(cvs);
    ctx.clearRect(0, 0, PATH_CANVAS_W, PATH_CANVAS_H);
    ctx.fillStyle = "#14171c";
    ctx.fillRect(0, 0, PATH_CANVAS_W, PATH_CANVAS_H);
    ctx.strokeStyle = "#2a3140";
    ctx.lineWidth = 1;
    ctx.strokeRect(pathOx, pathOy, lw * pathScale, lh * pathScale);
    ctx.strokeStyle = "#e7974f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (pathPoints.length > 0) {
      ctx.moveTo(pathOx + pathPoints[0][0] * pathScale, pathOy + pathPoints[0][1] * pathScale);
      for (let i = 1; i < pathPoints.length; i++) {
        ctx.lineTo(pathOx + pathPoints[i][0] * pathScale, pathOy + pathPoints[i][1] * pathScale);
      }
      ctx.stroke();
    }
    ctx.fillStyle = "#7fc4ff";
    for (const p of pathPoints) {
      ctx.beginPath();
      ctx.arc(pathOx + p[0] * pathScale, pathOy + p[1] * pathScale, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (pathPoints.length === 0) {
      ctx.fillStyle = "#525a68";
      ctx.font = "11px sans-serif";
      ctx.fillText("Click to place path points for text-on-path", 12, 16);
    }
  };

  const drawPreview = () => {
    const cvs = previewCanvasRef.current;
    if (!cvs) return;
    const scale = Math.min(512 / lw, 512 / lh, 2);
    cvs.width = Math.max(1, Math.round(lw * scale));
    cvs.height = Math.max(1, Math.round(lh * scale));
    const ctx = getContext2d(cvs);
    ctx.fillStyle = "#171a20";
    ctx.fillRect(0, 0, cvs.width, cvs.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const previewLayer: TextLayer = {
      ...layer,
      text,
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
      color,
      align,
      direction,
      letterSpacing,
      lineHeight,
      autoFit,
      overflowHidden,
      textPath: pathPoints.length >= 2 ? { points: pathPoints } : null,
      opacity: 1,
      blendMode: "normal",
    };
    drawTextLayer(ctx, previewLayer);
  };

  const pathCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (PATH_CANVAS_W / rect.width);
    const y = (e.clientY - rect.top) * (PATH_CANVAS_H / rect.height);
    const lx = (x - pathOx) / pathScale;
    const ly = (y - pathOy) / pathScale;
    if (pathPoints.length > 0) {
      const last = pathPoints[pathPoints.length - 1];
      if (Math.hypot(lx - last[0], ly - last[1]) < 3) {
        setPathPoints((p) => p.slice(0, -1));
        return;
      }
    }
    setPathPoints((p) => [...p, [Math.round(lx), Math.round(ly)]]);
  };

  useEffect(() => {
    drawPathCanvas();
    drawPreview();
  });

  const handleApply = () => {
    runtime.engine?.commitTextEdit(layer.id, {
      text, fontFamily, fontSize, fontWeight, fontStyle, color, align, direction,
      letterSpacing, lineHeight, autoFit, overflowHidden,
      textPath: usePath && pathPoints.length >= 2 ? { points: pathPoints } : null,
    });
    closeDialog();
  };

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal" style={{ minWidth: 460 }}>
        <div className="vs-modal-header"><span>Edit Text</span></div>
        <div className="vs-modal-body">
          <div className="vs-field">
            <label>Text</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{ width: "100%", minHeight: 70, background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text)", padding: 8, fontSize: 12, fontFamily: "var(--font)", borderRadius: 3, resize: "vertical" }}
              dir={direction}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div className="vs-field" style={{ flex: 2 }}>
              <label>Font</label>
              <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
                {FONTS.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div className="vs-field" style={{ flex: 1 }}>
              <label>Size</label>
              <input type="number" min={8} max={300} value={fontSize} onChange={(e) => setFontSize(+e.target.value)} />
            </div>
            <div className="vs-field" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label>Style</label>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="vs-btn" onClick={() => setFontWeight(fontWeight >= 600 ? 400 : 700)} title="Bold" style={{ fontWeight: 700 }}>B</button>
                <button className="vs-btn" onClick={() => setFontStyle(fontStyle === "italic" ? "normal" : "italic")} title="Italic" style={{ fontStyle: "italic" }}>I</button>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div className="vs-field" style={{ flex: 1 }}>
              <label>Color</label>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
            <div className="vs-field" style={{ flex: 1 }}>
              <label>Align</label>
              <select value={align} onChange={(e) => setAlign(e.target.value as TextLayer["align"])}>
                <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option>
              </select>
            </div>
            <div className="vs-field" style={{ flex: 1 }}>
              <label>Direction</label>
              <select value={direction} onChange={(e) => setDirection(e.target.value as "ltr" | "rtl")}>
                <option value="ltr">LTR</option><option value="rtl">RTL</option>
              </select>
            </div>
            <div className="vs-field" style={{ flex: 1 }}>
              <label>Spacing</label>
              <input type="number" min={0} max={40} step={0.5} value={letterSpacing} onChange={(e) => setLetterSpacing(+e.target.value)} />
            </div>
            <div className="vs-field" style={{ flex: 1 }}>
              <label>Line H</label>
              <input type="number" min={0.8} max={3} step={0.05} value={lineHeight} onChange={(e) => setLineHeight(+e.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, margin: "6px 0" }}>
            <label className="vs-check"><input type="checkbox" checked={overflowHidden} onChange={(e) => setOverflowHidden(e.target.checked)} /> Clip overflow</label>
            <label className="vs-check"><input type="checkbox" checked={autoFit} onChange={(e) => setAutoFit(e.target.checked)} /> Auto fit to box</label>
            <label className="vs-check"><input type="checkbox" checked={usePath} onChange={(e) => { setUsePath(e.target.checked); if (!e.target.checked) setPathPoints([]); }} /> Text on path</label>
          </div>
          {usePath && (
            <div className="vs-field">
              <label>Path</label>
              <canvas ref={pathCanvasRef} width={PATH_CANVAS_W} height={PATH_CANVAS_H} onClick={pathCanvasClick} style={{ width: "100%", border: "1px solid var(--input-border)", borderRadius: 3, cursor: "crosshair", display: "block" }} />
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <button className="vs-btn" onClick={() => setPathPoints((p) => p.slice(0, -1))} title="Remove the last path point">Undo Point</button>
                <button className="vs-btn secondary" onClick={() => setPathPoints([])} title="Clear the path">Clear</button>
                <span style={{ color: "var(--text-muted)", fontSize: 11, alignSelf: "center" }}>Click to add points. Click the last point to remove it.</span>
              </div>
            </div>
          )}
          <div className="vs-field">
            <label>Preview</label>
            <canvas ref={previewCanvasRef} style={{ width: "100%", borderRadius: 3, border: "1px solid var(--input-border)" }} />
          </div>
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn" onClick={closeDialog}>Cancel</button>
          <button className="vs-btn primary" onClick={handleApply}>Apply</button>
        </div>
      </div>
    </div>
  );
}