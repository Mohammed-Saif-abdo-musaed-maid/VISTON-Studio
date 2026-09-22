import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import { PathPoint, ShapeLayer } from "../../editor/core/types";
import { getContext2d } from "../../utils/canvas";

const CANVAS_W = 460;
const CANVAS_H = 300;
const HANDLE_LEN = 24;

function clone(p: PathPoint): PathPoint {
  return { x: p.x, y: p.y, inX: p.inX ?? 0, inY: p.inY ?? 0, outX: p.outX ?? 0, outY: p.outY ?? 0, smooth: !!p.smooth };
}

export function PathEditDialog() {
  const dialog = useEditorStore((s) => s.dialog);
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const doc = useEditorStore.getState().doc;
  const payload = dialog?.payload as { layerId: string } | undefined;
  const layer = payload?.layerId ? doc?.getLayer(payload.layerId) as ShapeLayer | undefined : undefined;

  const [pts, setPts] = useState<PathPoint[]>(() => (layer?.pathData ?? []).map(clone));
  const [sel, setSel] = useState(-1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ index: number; kind: "anchor" | "in" | "out" } | null>(null);

  if (!layer) return null;

  const lw = Math.max(1, layer.transform.width);
  const lh = Math.max(1, layer.transform.height);
  const scale = Math.min(CANVAS_W / lw, CANVAS_H / lh);
  const ox = (CANVAS_W - lw * scale) / 2;
  const oy = (CANVAS_H - lh * scale) / 2;

  const toLocal = (clientX: number, clientY: number, canvas: HTMLCanvasElement): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    const x = (clientX - r.left) * (CANVAS_W / r.width);
    const y = (clientY - r.top) * (CANVAS_H / r.height);
    return { x: (x - ox) / scale, y: (y - oy) / scale };
  };

  const draw = () => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = getContext2d(cvs);
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = "#14171c";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    if (lw > 0 && lh > 0) {
      ctx.strokeStyle = "#2a3140";
      ctx.lineWidth = 1;
      ctx.strokeRect(ox, oy, lw * scale, lh * scale);
    }
    if (pts.length >= 2) {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = ox + p.x * scale;
        const y = oy + p.y * scale;
        if (i === 0) ctx.moveTo(x, y);
        else {
          const prev = pts[i - 1]!;
          const hasBez = (prev.outX !== 0 || prev.outY !== 0 || p.inX !== 0 || p.inY !== 0);
          if (hasBez) {
            const c1x = ox + (prev.x + prev.outX) * scale;
            const c1y = oy + (prev.y + prev.outY) * scale;
            const c2x = ox + (p.x + p.inX) * scale;
            const c2y = oy + (p.y + p.inY) * scale;
            ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.strokeStyle = "#e7974f";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    pts.forEach((p) => {
      const x = ox + p.x * scale;
      const y = oy + p.y * scale;
      if (p.inX !== 0 || p.inY !== 0) {
        ctx.strokeStyle = "#7fc4ff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + p.inX * scale, y + p.inY * scale);
        ctx.stroke();
      }
      if (p.outX !== 0 || p.outY !== 0) {
        ctx.strokeStyle = "#7fdc9a";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + p.outX * scale, y + p.outY * scale);
        ctx.stroke();
      }
    });
    pts.forEach((p) => {
      const x = ox + p.x * scale;
      const y = oy + p.y * scale;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#7fc4ff";
      ctx.fill();
      ctx.strokeStyle = "#0b0e12";
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    if (sel >= 0 && pts[sel]) {
      const p = pts[sel]!;
      ctx.strokeStyle = "#ffd479";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ox + p.x * scale, oy + p.y * scale, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (pts.length === 0) {
      ctx.fillStyle = "#525a68";
      ctx.font = "11px sans-serif";
      ctx.fillText("Click to add an anchor point", 12, 16);
    }
  };

  useEffect(() => { draw(); });

  const hit = (e: { clientX: number; clientY: number }, t: "anchor" | "in" | "out"): number => {
    const cvs = canvasRef.current;
    if (!cvs) return -1;
    const { x, y } = toLocal(e.clientX, e.clientY, cvs);
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i]!;
      if (Math.hypot(p.x - x, p.y - y) <= 8 / scale) return i;
    }
    return -1;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const { x, y } = toLocal(e.clientX, e.clientY, cvs);
    const i = hit(e, "anchor");
    if (i >= 0) {
      setSel(i);
      dragRef.current = { index: i, kind: "anchor" };
      return;
    }
    setPts((p) => [...p, { x: Math.round(x * 4) / 4, y: Math.round(y * 4) / 4, inX: 0, inY: 0, outX: 0, outY: 0, smooth: false }]);
    setSel(-1);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const cvs = canvasRef.current;
    if (!cvs) return;
    const { x, y } = toLocal(e.clientX, e.clientY, cvs);
    setPts((cur) => cur.map((p, i) => {
      if (i !== dragRef.current!.index) return p;
      if (dragRef.current!.kind === "anchor") return { ...p, x: Math.round(x * 4) / 4, y: Math.round(y * 4) / 4 };
      if (dragRef.current!.kind === "out") return { ...p, outX: Math.round((x - p.x) * 4) / 4, outY: Math.round((y - p.y) * 4) / 4 };
      return { ...p, inX: Math.round((x - p.x) * 4) / 4, inY: Math.round((y - p.y) * 4) / 4 };
    }));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.kind === "anchor") {
      const cvs = canvasRef.current;
      if (cvs) {
        const { x, y } = toLocal(e.clientX, e.clientY, cvs);
        setPts((cur) => cur.map((p, i) => (i === dragRef.current!.index ? { ...p, x: Math.round(x * 4) / 4, y: Math.round(y * 4) / 4 } : p)));
      }
    }
    dragRef.current = null;
  };

  const selected = sel >= 0 ? pts[sel] : null;

  const handleApply = () => {
    if (pts.length >= 2) {
      runtime.engine?.editPathLayer(layer.id, { pathData: pts.map(clone) });
    }
    closeDialog();
  };

  const handleDelete = () => {
    if (sel < 0) return;
    setPts((cur) => cur.filter((_, i) => i !== sel));
    setSel(-1);
  };

  const handleSmooth = () => {
    if (sel < 0) return;
    setPts((cur) => cur.map((p, i) => {
      if (i !== sel) return p;
      const np = { ...p, smooth: !p.smooth };
      if (np.smooth) {
        if (np.outX === 0 && np.outY === 0 && (np.inX !== 0 || np.inY !== 0)) { np.outX = -np.inX; np.outY = -np.inY; }
        if (np.inX === 0 && np.inY === 0 && (np.outX !== 0 || np.outY !== 0)) { np.inX = -np.outX; np.inY = -np.outY; }
      }
      return np;
    }));
  };

  const handleMakeHandleOut = () => {
    if (sel < 0) return;
    setPts((cur) => cur.map((p, i) => (i === sel ? { ...p, outX: HANDLE_LEN, outY: 0 } : p)));
  };

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal" style={{ minWidth: 500 }}>
        <div className="vs-modal-header"><span>Edit Path</span></div>
        <div className="vs-modal-body">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{ width: "100%", border: "1px solid var(--input-border)", borderRadius: 3, cursor: "crosshair", display: "block", touchAction: "none" }}
          />
          <div className="vs-field">
            <label>Selected anchor</label>
            {selected ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>#{sel} ({Math.round(selected.x)}, {Math.round(selected.y)})</span>
                <button className="vs-btn" onClick={handleSmooth} title="Convert between smooth (auto-mirrored handles) and corner">{selected.smooth ? "Corner" : "Smooth"}</button>
                <button className="vs-btn" onClick={handleMakeHandleOut} title="Add a short out-handle so the outgoing edge curves">+ Handle</button>
                <button className="vs-btn" onClick={handleDelete} disabled={pts.length <= 2} title="Delete this anchor">Delete</button>
              </div>
            ) : (
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                Click on the canvas to add an anchor, or click an existing anchor to select and drag it.
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <button className="vs-btn" onClick={() => setPts((cur) => cur.slice(0, -1))} title="Remove the last anchor">Undo Point</button>
            <button className="vs-btn secondary" onClick={() => { setPts([]); setSel(-1); }} title="Clear all anchors">Clear</button>
          </div>
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn" onClick={closeDialog}>Cancel</button>
          <button className="vs-btn primary" onClick={handleApply} disabled={pts.length < 2}>Apply</button>
        </div>
      </div>
    </div>
  );
}