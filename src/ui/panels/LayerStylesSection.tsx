import { runtime } from "../../editor/core/runtime";
import {
  Layer,
  LayerStyle,
  LayerStyleKind,
  LayerStyles,
  LAYER_STYLE_KINDS,
  defaultLayerStyle,
  emptyLayerStyles,
  cloneLayerStyles,
} from "../../editor/core/types";

const STYLE_LABELS: Record<LayerStyleKind, string> = {
  dropShadow: "Drop Shadow",
  innerShadow: "Inner Shadow",
  outerGlow: "Outer Glow",
  innerGlow: "Inner Glow",
  stroke: "Stroke",
  colorOverlay: "Color Overlay",
  gradientOverlay: "Gradient Overlay",
  bevel: "Bevel & Emboss",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="vs-prop-row">
      <label>{label}</label>
      {children}
    </div>
  );
}

function Num({ value, onChange, min, max, step, width = 52 }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; width?: number }) {
  return <input type="number" min={min} max={max} step={step ?? 1} value={value} onChange={(e) => onChange(+e.target.value)} style={{ width }} />;
}

function Color({ value, onChange, title }: { value: string; onChange: (v: string) => void; title?: string }) {
  return <input type="color" value={value} onChange={(e) => onChange(e.target.value)} title={title} />;
}

function Opacity({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <>
      <input type="range" min={0} max={1} step={0.01} value={value} onChange={(e) => onChange(+e.target.value)} style={{ flex: 1 }} />
      <span style={{ width: 32, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{Math.round(value * 100)}%</span>
    </>
  );
}

export function LayerStylesSection({ layer }: { layer: Layer }) {
  const current: LayerStyles = layer.styles ?? emptyLayerStyles();

  const commit = (next: LayerStyles): void => {
    runtime.engine?.updateLayerMeta(layer.id, { styles: next } as Partial<Layer>);
    runtime.engine?.requestRender();
  };

  const addEffect = (kind: LayerStyleKind): void => {
    const next = (cloneLayerStyles(current) ?? emptyLayerStyles()) as Record<LayerStyleKind, LayerStyle | null>;
    next[kind] = defaultLayerStyle(kind);
    commit(next as LayerStyles);
  };

  const removeEffect = (kind: LayerStyleKind): void => {
    const next = (cloneLayerStyles(current) ?? emptyLayerStyles()) as Record<LayerStyleKind, LayerStyle | null>;
    next[kind] = null;
    commit(next as LayerStyles);
  };

  const setEffect = (kind: LayerStyleKind, patch: Record<string, unknown>): void => {
    const next = (cloneLayerStyles(current) ?? emptyLayerStyles()) as Record<LayerStyleKind, LayerStyle | null>;
    const cur = next[kind];
    if (!cur) return;
    next[kind] = { ...cur, ...patch } as LayerStyle;
    commit(next as LayerStyles);
  };

  const toggleEffect = (kind: LayerStyleKind, enabled: boolean): void => {
    setEffect(kind, { enabled });
  };

  const go = current.gradientOverlay;

  return (
    <div>
      <div style={{ borderTop: "1px solid var(--border)", margin: "6px 0", paddingTop: 6, fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>
        Layer Styles
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          {LAYER_STYLE_KINDS.map((kind) => (
            <button key={kind} className="vs-btn" style={current[kind]?.enabled ? { outline: "1px solid var(--accent)" } : undefined} title={current[kind] ? STYLE_LABELS[kind] : `Add ${STYLE_LABELS[kind]}`} onClick={() => (current[kind] ? toggleEffect(kind, !current[kind]!.enabled) : addEffect(kind))}>
              {STYLE_LABELS[kind]} {current[kind] ? (current[kind]!.enabled ? "✓" : "✓̶") : "+"}
            </button>
          ))}
        </div>
      </div>

      {current.dropShadow && (
        <div>
          <Row label="Drop Shadow">
            <label className="vs-check" style={{ fontSize: 11 }}><input type="checkbox" checked={current.dropShadow.enabled} onChange={(e) => toggleEffect("dropShadow", e.target.checked)} /> On</label>
            <button className="vs-btn" onClick={() => removeEffect("dropShadow")}>✕</button>
          </Row>
          {current.dropShadow.enabled && (
            <>
              <Row label="Offset"><Num value={current.dropShadow.offsetX} onChange={(v) => setEffect("dropShadow", { offsetX: v })} min={-256} max={256} /><Num value={current.dropShadow.offsetY} onChange={(v) => setEffect("dropShadow", { offsetY: v })} min={-256} max={256} /></Row>
              <Row label="Blur"><Num value={current.dropShadow.blur} onChange={(v) => setEffect("dropShadow", { blur: v })} min={0} max={256} /></Row>
              <Row label="Color"><Color value={current.dropShadow.color} onChange={(v) => setEffect("dropShadow", { color: v })} /></Row>
              <Row label="Opacity"><Opacity value={current.dropShadow.opacity} onChange={(v) => setEffect("dropShadow", { opacity: v })} /></Row>
            </>
          )}
        </div>
      )}

      {current.innerShadow && (
        <div>
          <Row label="Inner Shadow">
            <label className="vs-check" style={{ fontSize: 11 }}><input type="checkbox" checked={current.innerShadow.enabled} onChange={(e) => toggleEffect("innerShadow", e.target.checked)} /> On</label>
            <button className="vs-btn" onClick={() => removeEffect("innerShadow")}>✕</button>
          </Row>
          {current.innerShadow.enabled && (
            <>
              <Row label="Offset"><Num value={current.innerShadow.offsetX} onChange={(v) => setEffect("innerShadow", { offsetX: v })} min={-256} max={256} /><Num value={current.innerShadow.offsetY} onChange={(v) => setEffect("innerShadow", { offsetY: v })} min={-256} max={256} /></Row>
              <Row label="Blur"><Num value={current.innerShadow.blur} onChange={(v) => setEffect("innerShadow", { blur: v })} min={0} max={256} /></Row>
              <Row label="Color"><Color value={current.innerShadow.color} onChange={(v) => setEffect("innerShadow", { color: v })} /></Row>
              <Row label="Opacity"><Opacity value={current.innerShadow.opacity} onChange={(v) => setEffect("innerShadow", { opacity: v })} /></Row>
            </>
          )}
        </div>
      )}

      {current.outerGlow && (
        <div>
          <Row label="Outer Glow">
            <label className="vs-check" style={{ fontSize: 11 }}><input type="checkbox" checked={current.outerGlow.enabled} onChange={(e) => toggleEffect("outerGlow", e.target.checked)} /> On</label>
            <button className="vs-btn" onClick={() => removeEffect("outerGlow")}>✕</button>
          </Row>
          {current.outerGlow.enabled && (
            <>
              <Row label="Width"><Num value={current.outerGlow.blur} onChange={(v) => setEffect("outerGlow", { blur: v })} min={0} max={256} /><Num value={current.outerGlow.spread} onChange={(v) => setEffect("outerGlow", { spread: v })} min={0} max={256} /></Row>
              <Row label="Color"><Color value={current.outerGlow.color} onChange={(v) => setEffect("outerGlow", { color: v })} /></Row>
              <Row label="Opacity"><Opacity value={current.outerGlow.opacity} onChange={(v) => setEffect("outerGlow", { opacity: v })} /></Row>
            </>
          )}
        </div>
      )}

      {current.innerGlow && (
        <div>
          <Row label="Inner Glow">
            <label className="vs-check" style={{ fontSize: 11 }}><input type="checkbox" checked={current.innerGlow.enabled} onChange={(e) => toggleEffect("innerGlow", e.target.checked)} /> On</label>
            <button className="vs-btn" onClick={() => removeEffect("innerGlow")}>✕</button>
          </Row>
          {current.innerGlow.enabled && (
            <>
              <Row label="Width"><Num value={current.innerGlow.blur} onChange={(v) => setEffect("innerGlow", { blur: v })} min={0} max={256} /><Num value={current.innerGlow.spread} onChange={(v) => setEffect("innerGlow", { spread: v })} min={0} max={256} /></Row>
              <Row label="Color"><Color value={current.innerGlow.color} onChange={(v) => setEffect("innerGlow", { color: v })} /></Row>
              <Row label="Opacity"><Opacity value={current.innerGlow.opacity} onChange={(v) => setEffect("innerGlow", { opacity: v })} /></Row>
            </>
          )}
        </div>
      )}

      {current.stroke && (
        <div>
          <Row label="Stroke">
            <label className="vs-check" style={{ fontSize: 11 }}><input type="checkbox" checked={current.stroke.enabled} onChange={(e) => toggleEffect("stroke", e.target.checked)} /> On</label>
            <button className="vs-btn" onClick={() => removeEffect("stroke")}>✕</button>
          </Row>
          {current.stroke.enabled && (
            <>
              <Row label="Color"><Color value={current.stroke.color} onChange={(v) => setEffect("stroke", { color: v })} /></Row>
              <Row label="Size"><Num value={current.stroke.width} onChange={(v) => setEffect("stroke", { width: v })} min={0} max={256} /></Row>
              <Row label="Position">
                <select style={{ flex: 1 }} value={current.stroke.position} onChange={(e) => setEffect("stroke", { position: e.target.value })}>
                  <option value="inside">Inside</option>
                  <option value="center">Center</option>
                  <option value="outside">Outside</option>
                </select>
              </Row>
              <Row label="Opacity"><Opacity value={current.stroke.opacity} onChange={(v) => setEffect("stroke", { opacity: v })} /></Row>
            </>
          )}
        </div>
      )}

      {current.colorOverlay && (
        <div>
          <Row label="Color Overlay">
            <label className="vs-check" style={{ fontSize: 11 }}><input type="checkbox" checked={current.colorOverlay.enabled} onChange={(e) => toggleEffect("colorOverlay", e.target.checked)} /> On</label>
            <button className="vs-btn" onClick={() => removeEffect("colorOverlay")}>✕</button>
          </Row>
          {current.colorOverlay.enabled && (
            <>
              <Row label="Color"><Color value={current.colorOverlay.color} onChange={(v) => setEffect("colorOverlay", { color: v })} /></Row>
              <Row label="Opacity"><Opacity value={current.colorOverlay.opacity} onChange={(v) => setEffect("colorOverlay", { opacity: v })} /></Row>
            </>
          )}
        </div>
      )}

      {go && (
        <div>
          <Row label="Gradient Overlay">
            <label className="vs-check" style={{ fontSize: 11 }}><input type="checkbox" checked={go.enabled} onChange={(e) => toggleEffect("gradientOverlay", e.target.checked)} /> On</label>
            <button className="vs-btn" onClick={() => removeEffect("gradientOverlay")}>✕</button>
          </Row>
          {go.enabled && (
            <>
              <Row label="Type">
                <select style={{ flex: 1 }} value={go.gradient} onChange={(e) => setEffect("gradientOverlay", { gradient: e.target.value })}>
                  <option value="linear">Linear</option>
                  <option value="radial">Radial</option>
                </select>
              </Row>
              {go.gradient === "linear" && (
                <Row label="Angle"><Num value={go.angle} onChange={(v) => setEffect("gradientOverlay", { angle: v })} min={-360} max={360} /></Row>
              )}
              <Row label="Start"><Color value={go.stops[0]?.color ?? "#ffffff"} onChange={(v) => setEffect("gradientOverlay", { stops: [{ pos: 0, color: v }, ...go.stops.slice(1)] })} /></Row>
              <Row label="End"><Color value={go.stops[go.stops.length - 1]?.color ?? "#000000"} onChange={(v) => setEffect("gradientOverlay", { stops: [...go.stops.slice(0, -1), { pos: 1, color: v }] })} /></Row>
              <Row label="Opacity"><Opacity value={go.opacity} onChange={(v) => setEffect("gradientOverlay", { opacity: v })} /></Row>
            </>
          )}
        </div>
      )}

      {current.bevel && (
        <div>
          <Row label="Bevel & Emboss">
            <label className="vs-check" style={{ fontSize: 11 }}><input type="checkbox" checked={current.bevel.enabled} onChange={(e) => toggleEffect("bevel", e.target.checked)} /> On</label>
            <button className="vs-btn" onClick={() => removeEffect("bevel")}>✕</button>
          </Row>
          {current.bevel.enabled && (
            <>
              <Row label="Size"><Num value={current.bevel.size} onChange={(v) => setEffect("bevel", { size: v })} min={0} max={256} /></Row>
              <Row label="Angle"><Num value={current.bevel.angle} onChange={(v) => setEffect("bevel", { angle: v })} min={0} max={360} /></Row>
              <Row label="Depth"><Opacity value={current.bevel.depth} onChange={(v) => setEffect("bevel", { depth: v })} /></Row>
              <Row label="Light"><Color value={current.bevel.highlightColor} onChange={(v) => setEffect("bevel", { highlightColor: v })} /></Row>
              <Row label="Shadow"><Color value={current.bevel.shadowColor} onChange={(v) => setEffect("bevel", { shadowColor: v })} /></Row>
            </>
          )}
        </div>
      )}
    </div>
  );
}