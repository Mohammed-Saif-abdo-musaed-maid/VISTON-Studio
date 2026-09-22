import { useState } from "react";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import { Layer, TextLayer, ShapeLayer } from "../../editor/core/types";
import { LayerStylesSection } from "./LayerStylesSection";
import { PanelShell } from "./PanelShell";

export const BLEND_MODES: Layer["blendMode"][] = [
  "normal", "multiply", "screen", "overlay", "soft-light", "hard-light",
  "darken", "lighten", "difference", "exclusion", "color-dodge", "color-burn",
  "hue", "saturation", "color", "luminosity",
];

function BlendRow({ layer, onBlend }: { layer: Layer; onBlend: (mode: Layer["blendMode"]) => void }) {
  return (
    <div className="vs-prop-row">
      <label>Blend</label>
      <select value={layer.blendMode} onChange={(e) => onBlend(e.target.value as Layer["blendMode"])} style={{ flex: 1 }}>
        {BLEND_MODES.map((m) => (
          <option key={m} value={m}>{m === "normal" ? "Normal" : m.split("-").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ")}</option>
        ))}
      </select>
    </div>
  );
}

function OpacityRow({ opacity, onOpacity }: { opacity: number; onOpacity: (v: number) => void }) {
  return (
    <div className="vs-prop-row">
      <label>α</label>
      <input type="range" min={0} max={1} step={0.01} value={opacity} onChange={(e) => onOpacity(+e.target.value)} style={{ flex: 1 }} />
      <span style={{ width: 30, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{Math.round(opacity * 100)}%</span>
    </div>
  );
}

function DocumentProperties() {
  const doc = useEditorStore((s) => s.doc);
  if (!doc) return <div className="vs-props-empty">Open or create a document to edit it.</div>;
  const imgCount = doc.layers.filter((l) => l.type === "image").length;
  const meta = runtime.engine?.getActiveMeta();
  return (
    <div>
      <div className="vs-doc-props">
        <div className="vs-field compact">
          <label>Name</label>
          <input type="text" readOnly value={meta?.name ?? "Untitled"} />
        </div>
        <div className="vs-field compact">
          <label>Size</label>
          <input type="text" readOnly value={`${doc.width} × ${doc.height}`} />
        </div>
        <div className="vs-field compact">
          <label>DPI</label>
          <input type="text" readOnly value={`${meta?.dpi ?? 72}`} />
        </div>
        <div className="vs-field compact">
          <label>Layers</label>
          <input type="text" readOnly value={`${doc.layers.length}`} />
        </div>
      </div>
      {imgCount > 0 && <div className="vs-props-empty" style={{ padding: "6px 2px" }}>{imgCount} raster layer{imgCount === 1 ? "" : "s"}.</div>}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
        <button className="vs-btn" onClick={() => useEditorStore.getState().openDialog({ name: "imageSize" })}>Image Size…</button>
        <button className="vs-btn" onClick={() => useEditorStore.getState().openDialog({ name: "canvasSize" })}>Canvas Size…</button>
        <button className="vs-btn" title="Merge all layers into one raster layer" onClick={() => runtime.engine?.flattenImage()}>Flatten</button>
      </div>
    </div>
  );
}

export function PropertiesPanel() {
  const doc = useEditorStore((s) => s.doc);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const editingMaskId = useEditorStore((s) => s.editingMaskId);
  const layer = selectedIds.length === 1 ? doc?.getLayer(selectedIds[0]!) : undefined;
  const multi = selectedIds.length > 1 && doc ? selectedIds.map((id) => doc.getLayer(id)).filter((l): l is Layer => !!l) : null;
  const engine = runtime.engine;

  if (!doc) {
    return (
      <PanelShell id="properties" title="Properties">
        <div className="vs-props-empty">No document open.</div>
      </PanelShell>
    );
  }

  if (!layer && !multi) {
    return (
      <PanelShell id="properties" title="Properties">
        <div className="vs-props-empty">No layer selected — showing document properties.</div>
        <DocumentProperties />
      </PanelShell>
    );
  }

  if (multi) {
    const frequencies: string[] = [];
    for (const l of multi) if (!frequencies.includes(l.blendMode)) frequencies.push(l.blendMode);
    const mixedBlend = frequencies.length > 1;
    return (
      <PanelShell id="properties" title="Properties">
        <div className="vs-multi-hint">{multi.length} layers selected — changes apply to all.</div>
        <div className="vs-properties-panel">
          <div className="vs-prop-row">
            <label>α</label>
            <input type="range" min={0} max={1} step={0.01} value={multi[0]!.opacity} onChange={(e) => {
              const v = +e.target.value;
              for (const l of multi) { engine?.updateLayerMeta(l.id, { opacity: v }); }
              engine?.requestRender();
            }} style={{ flex: 1 }} />
            <span style={{ width: 30, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{Math.round(multi[0]!.opacity * 100)}%</span>
          </div>
          <BlendRow layer={multi[0]!} onBlend={(mode) => {
            for (const l of multi) engine?.updateLayerMeta(l.id, { blendMode: mode });
            engine?.requestRender();
          }} />
          {mixedBlend && <div className="vs-multi-hint">Mixed blend modes — the list shows the active layer's value.</div>}
        </div>
      </PanelShell>
    );
  }

  if (!layer) return null;

  const t = layer.transform;

  const updateTransform = (patch: Record<string, unknown>) => {
    if (!engine) return;
    engine.updateLayerMeta(layer.id, { transform: { ...t, ...patch } });
    engine.requestRender();
  };

  const isGroup = layer.type === "group";

  return (
    <PanelShell id="properties" title="Properties">
      <div className="vs-properties-panel">
        {!isGroup && (
          <>
            <div className="vs-prop-row">
              <label>X</label>
              <input type="number" value={Math.round(t.x)} onChange={(e) => updateTransform({ x: +e.target.value })} />
            </div>
            <div className="vs-prop-row">
              <label>Y</label>
              <input type="number" value={Math.round(t.y)} onChange={(e) => updateTransform({ y: +e.target.value })} />
            </div>
            <div className="vs-prop-row">
              <label>W</label>
              <input type="number" value={Math.round(t.width)} onChange={(e) => updateTransform({ width: +e.target.value })} />
            </div>
            <div className="vs-prop-row">
              <label>H</label>
              <input type="number" value={Math.round(t.height)} onChange={(e) => updateTransform({ height: +e.target.value })} />
            </div>
            <div className="vs-prop-row">
              <label>Rot</label>
              <input type="number" value={Math.round(t.rotation)} onChange={(e) => updateTransform({ rotation: +e.target.value })} />
            </div>
            <div className="vs-prop-row">
              <label>SkewX</label>
              <input type="number" value={Math.round(t.skewX ?? 0)} onChange={(e) => updateTransform({ skewX: +e.target.value })} />
            </div>
            <div className="vs-prop-row">
              <label>SkewY</label>
              <input type="number" value={Math.round(t.skewY ?? 0)} onChange={(e) => updateTransform({ skewY: +e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
              <button className="vs-btn" title="Flip the layer horizontally (never bakes pixels)" onClick={() => { engine?.flipLayer(layer.id, true); }}>⇋ Flip H</button>
              <button className="vs-btn" title="Flip the layer vertically (never bakes pixels)" onClick={() => { engine?.flipLayer(layer.id, false); }}>⇌ Flip V</button>
            </div>
          </>
        )}
        <OpacityRow opacity={layer.opacity} onOpacity={(v) => {
          engine?.updateLayerMeta(layer.id, { opacity: v });
          engine?.requestRender();
        }} />
        <BlendRow layer={layer} onBlend={(mode) => {
          engine?.updateLayerMeta(layer.id, { blendMode: mode });
          engine?.requestRender();
        }} />
        {layer.type === "adjustment" && (layer.adjustment === "levels" || layer.adjustment === "curves") && (
          <div>
            <div style={{ borderTop: "1px solid var(--border)", margin: "6px 0", paddingTop: 6, fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>Adjustment</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button
                className="vs-btn"
                title="Open the curve/level editor for this adjustment layer"
                onClick={() => { useEditorStore.getState().openDialog({ name: layer.adjustment === "levels" ? "levels" : "curves", payload: { layerId: layer.id } }); }}
              >✎ Edit {layer.adjustment === "levels" ? "Levels…" : "Curves…"}</button>
            </div>
          </div>
        )}
        {!isGroup && (
          <>
            <div style={{ borderTop: "1px solid var(--border)", margin: "6px 0", paddingTop: 6, fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>Mask & Clip</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button
                className="vs-btn"
                disabled={!!layer.mask || layer.type === "adjustment"}
                title="Add a layer mask"
                onClick={() => { engine?.addMaskToLayer(layer.id); }}
              >+ Mask</button>
              <button
                className="vs-btn"
                disabled={!layer.mask || layer.type === "adjustment"}
                title={layer.mask?.enabled ? "Disable mask" : "Enable mask"}
                onClick={() => { engine?.toggleMaskEnabled(layer.id); }}
              >{layer.mask?.enabled ? "⊘ Mask Off" : "⊙ Mask On"}</button>
              <button
                className={`vs-btn ${editingMaskId === layer.id ? "active" : ""}`}
                disabled={!layer.mask || layer.type === "adjustment"}
                title="Paint the mask with the brush/eraser tool (press the active Edit button again to stop)"
                onClick={() => {
                  const cur = useEditorStore.getState().editingMaskId;
                  useEditorStore.getState().setMaskEditing(cur === layer.id ? null : layer.id);
                  useEditorStore.getState().setStatus(cur === layer.id ? "Mask editing stopped" : `Editing mask of "${layer.name}" with brush / eraser`);
                }}
              >🖌 Edit Mask</button>
              <button
                className="vs-btn"
                disabled={!layer.mask}
                title={layer.mask?.linked ? "Unlink the mask so it can move independently of the layer" : "Link the mask to the layer so they move together"}
                onClick={() => { engine?.setMaskLinked(layer.id, !layer.mask?.linked); }}
              >{layer.mask?.linked ? "⛓ Linked" : "⛌ Unlinked"}</button>
              <button
                className="vs-btn"
                disabled={!layer.mask}
                title="Invert the mask (hidden areas become visible and vice versa)"
                onClick={() => { engine?.invertMaskLayer(layer.id); }}
              >Invert</button>
              <button
                className="vs-btn"
                disabled={!layer.mask}
                title="Feather / soften the mask edges"
                onClick={() => {
                  const r = Number(window.prompt("Blur radius (px):", "4"));
                  if (!Number.isFinite(r) || r < 1) return;
                  engine?.blurMaskLayer(layer.id, r);
                }}
              >Feather…</button>
              <button
                className="vs-btn"
                disabled={!layer.mask}
                title="Adjust the mask's black/white/mid levels"
                onClick={() => {
                  const raw = window.prompt("Black, mid (0.1–9.9), white: (defaults 0, 1, 255)", "0, 1, 255");
                  if (!raw) return;
                  const parts = raw.split(",").map((x) => Number(x.trim()));
                  const black = parts[0] ?? 0;
                  const mid = parts[1] ?? 1;
                  const white = parts[2] ?? 255;
                  if (!Number.isFinite(black) || !Number.isFinite(mid) || !Number.isFinite(white)) return;
                  engine?.levelsMaskLayer(layer.id, { black, mid, white });
                }}
              >Levels…</button>
              <button
                className="vs-btn"
                disabled={layer.type === "adjustment"}
                title="Turn the current selection into this layer's mask"
                onClick={() => { engine?.maskFromSelection(layer.id); }}
              >◫ From Selection</button>
              <button
                className="vs-btn"
                disabled={!layer.mask}
                title="Convert this layer's mask into an active selection"
                onClick={() => { engine?.selectionFromMask(layer.id); }}
              >➜ To Selection</button>
              <button
                className="vs-btn"
                disabled={!layer.mask || layer.type === "adjustment"}
                title="Permanently apply the mask to the layer pixels"
                onClick={() => { engine?.applyMaskToLayer(layer.id); }}
              >Apply</button>
              <button
                className="vs-btn"
                disabled={!layer.mask || layer.type === "adjustment"}
                title="Remove the layer mask"
                onClick={() => { engine?.removeMaskFromLayer(layer.id); }}
              >✕ Remove</button>
              <button
                className={`vs-btn ${layer.clipTo ? "active-clip" : ""}`}
                title={layer.clipTo ? "Release clipping (unclip from layer below)" : "Clip this layer to the layer below"}
                onClick={() => { engine?.toggleClipping(layer.id); }}
              >{layer.clipTo ? "⛓ Unclip" : "⛓ Clip"}</button>
            </div>
            {editingMaskId === layer.id && (
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>
                Mask editing active — use the Brush to reveal and the Eraser to hide this layer.
              </div>
            )}
          </>
        )}

        {layer.type === "text" && (
          <>
            <div style={{ borderTop: "1px solid var(--border)", margin: "6px 0", paddingTop: 6, fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>Text</div>
            <div className="vs-prop-row">
              <label>Font</label>
              <select value={(layer as TextLayer).fontFamily} onFocus={() => engine?.beginTextEditSession(layer.id)} onBlur={() => engine?.commitTextEditSession(layer.id)} onChange={(e) => engine?.updateTextLayerLive(layer.id, { fontFamily: e.target.value } as Partial<TextLayer>)} style={{ flex: 1 }}>
                <option>Arial</option><option>Helvetica</option><option>Times New Roman</option><option>Courier New</option><option>Georgia</option><option>Verdana</option>
              </select>
            </div>
            <div className="vs-prop-row">
              <label>Size</label>
              <input type="number" min={8} max={300} value={(layer as TextLayer).fontSize} onFocus={() => engine?.beginTextEditSession(layer.id)} onBlur={() => engine?.commitTextEditSession(layer.id)} onChange={(e) => engine?.updateTextLayerLive(layer.id, { fontSize: +e.target.value } as Partial<TextLayer>)} />
            </div>
            <div className="vs-prop-row">
              <label>Color</label>
              <input type="color" value={(layer as TextLayer).color} onFocus={() => engine?.beginTextEditSession(layer.id)} onBlur={() => engine?.commitTextEditSession(layer.id)} onChange={(e) => engine?.updateTextLayerLive(layer.id, { color: e.target.value } as Partial<TextLayer>)} />
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              <button className={`vs-btn ${(layer as TextLayer).fontWeight >= 600 ? "active" : ""}`} title="Bold" onFocus={() => engine?.beginTextEditSession(layer.id)} onBlur={() => engine?.commitTextEditSession(layer.id)} onClick={() => engine?.updateTextLayerLive(layer.id, { fontWeight: (layer as TextLayer).fontWeight >= 600 ? 400 : 700 } as Partial<TextLayer>)} style={{ fontWeight: 700 }}>B</button>
              <button className={`vs-btn ${(layer as TextLayer).fontStyle === "italic" ? "active" : ""}`} title="Italic" onFocus={() => engine?.beginTextEditSession(layer.id)} onBlur={() => engine?.commitTextEditSession(layer.id)} onClick={() => engine?.updateTextLayerLive(layer.id, { fontStyle: (layer as TextLayer).fontStyle === "italic" ? "normal" : "italic" } as Partial<TextLayer>)} style={{ fontStyle: "italic" }}>I</button>
              <select value={(layer as TextLayer).align} onFocus={() => engine?.beginTextEditSession(layer.id)} onBlur={() => engine?.commitTextEditSession(layer.id)} onChange={(e) => engine?.updateTextLayerLive(layer.id, { align: e.target.value as TextLayer["align"] } as Partial<TextLayer>)} style={{ marginLeft: "auto", width: 86 }}>
                <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option>
              </select>
            </div>
            <div className="vs-prop-row">
              <label>Spacing</label>
              <input type="number" min={0} max={40} step={0.5} value={(layer as TextLayer).letterSpacing} onFocus={() => engine?.beginTextEditSession(layer.id)} onBlur={() => engine?.commitTextEditSession(layer.id)} onChange={(e) => engine?.updateTextLayerLive(layer.id, { letterSpacing: +e.target.value } as Partial<TextLayer>)} />
            </div>
            <div className="vs-prop-row">
              <label>Line H</label>
              <input type="number" min={0.8} max={3} step={0.05} value={(layer as TextLayer).lineHeight} onFocus={() => engine?.beginTextEditSession(layer.id)} onBlur={() => engine?.commitTextEditSession(layer.id)} onChange={(e) => engine?.updateTextLayerLive(layer.id, { lineHeight: +e.target.value } as Partial<TextLayer>)} />
            </div>
            <div className="vs-prop-row">
              <label>Stroke</label>
              <input type="color" value={(layer as TextLayer).stroke ?? "#000000"} onFocus={() => engine?.beginTextEditSession(layer.id)} onBlur={() => engine?.commitTextEditSession(layer.id)} onChange={(e) => engine?.updateTextLayerLive(layer.id, { stroke: e.target.value, strokeWidth: (layer as TextLayer).strokeWidth || 1 } as Partial<TextLayer>)} />
              <input type="number" min={0} max={40} step={0.5} value={(layer as TextLayer).strokeWidth} onFocus={() => engine?.beginTextEditSession(layer.id)} onBlur={() => engine?.commitTextEditSession(layer.id)} onChange={(e) => engine?.updateTextLayerLive(layer.id, { strokeWidth: +e.target.value } as Partial<TextLayer>)} title="Stroke width (0 = none)" style={{ width: 52 }} />
            </div>
            <div className="vs-prop-row">
              <label>Shadow</label>
              <input type="color" value={(layer as TextLayer).shadow?.color ?? "#000000"} onFocus={() => engine?.beginTextEditSession(layer.id)} onBlur={() => engine?.commitTextEditSession(layer.id)} onChange={(e) => engine?.updateTextLayerLive(layer.id, { shadow: { ...((layer as TextLayer).shadow ?? { offsetX: 2, offsetY: 2, blur: 4, color: "#000000", opacity: 1 }), color: e.target.value } } as Partial<TextLayer>)} />
              <input type="number" min={0} max={10} step={0.5} value={(layer as TextLayer).shadow?.blur ?? 0} onFocus={() => engine?.beginTextEditSession(layer.id)} onBlur={() => engine?.commitTextEditSession(layer.id)} onChange={(e) => engine?.updateTextLayerLive(layer.id, { shadow: { ...((layer as TextLayer).shadow ?? { offsetX: 2, offsetY: 2, blur: 4, color: "#000000", opacity: 1 }), blur: +e.target.value } } as Partial<TextLayer>)} title="Shadow blur" style={{ width: 52 }} />
            </div>
            <div className="vs-prop-row">
              <label>Shadow XY</label>
              <input type="number" min={-40} max={40} step={1} value={(layer as TextLayer).shadow?.offsetX ?? 0} onFocus={() => engine?.beginTextEditSession(layer.id)} onBlur={() => engine?.commitTextEditSession(layer.id)} onChange={(e) => engine?.updateTextLayerLive(layer.id, { shadow: { ...((layer as TextLayer).shadow ?? { offsetX: 2, offsetY: 2, blur: 4, color: "#000000", opacity: 1 }), offsetX: +e.target.value } } as Partial<TextLayer>)} style={{ width: 52 }} />
              <input type="number" min={-40} max={40} step={1} value={(layer as TextLayer).shadow?.offsetY ?? 0} onFocus={() => engine?.beginTextEditSession(layer.id)} onBlur={() => engine?.commitTextEditSession(layer.id)} onChange={(e) => engine?.updateTextLayerLive(layer.id, { shadow: { ...((layer as TextLayer).shadow ?? { offsetX: 2, offsetY: 2, blur: 4, color: "#000000", opacity: 1 }), offsetY: +e.target.value } } as Partial<TextLayer>)} style={{ width: 52 }} />
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
              <label className="vs-check" style={{ fontSize: 11 }}><input type="checkbox" checked={(layer as TextLayer).overflowHidden} onFocus={() => engine?.beginTextEditSession(layer.id)} onBlur={() => engine?.commitTextEditSession(layer.id)} onChange={(e) => engine?.updateTextLayerLive(layer.id, { overflowHidden: e.target.checked } as Partial<TextLayer>)} /> Clip overflow</label>
              <label className="vs-check" style={{ fontSize: 11 }}><input type="checkbox" checked={(layer as TextLayer).autoFit} onFocus={() => engine?.beginTextEditSession(layer.id)} onBlur={() => engine?.commitTextEditSession(layer.id)} onChange={(e) => engine?.updateTextLayerLive(layer.id, { autoFit: e.target.checked } as Partial<TextLayer>)} /> Auto fit</label>
            </div>
            {!!(layer as TextLayer).textPath?.points && (layer as TextLayer).textPath!.points.length >= 2 && (
              <div style={{ marginTop: 4 }}>
                <button className="vs-btn" title="Open the text editor to edit the path" onClick={() => useEditorStore.getState().openDialog({ name: "textEdit", payload: { layerId: layer.id } })}>✎ Path text…</button>
              </div>
            )}
          </>
        )}

        {layer.type === "shape" && (
          <>
            <div style={{ borderTop: "1px solid var(--border)", margin: "6px 0", paddingTop: 6, fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>Shape</div>
            <div className="vs-prop-row">
              <label>Fill</label>
              <input type="color" value={(layer as ShapeLayer).fill ?? "#000000"} onChange={(e) => {
                engine?.updateLayerMeta(layer.id, { fill: e.target.value } as Partial<Layer>);
                engine?.requestRender();
              }} />
            </div>
            <div className="vs-prop-row">
              <label>Str</label>
              <input type="color" value={(layer as ShapeLayer).stroke ?? "#000000"} onChange={(e) => {
                engine?.updateLayerMeta(layer.id, { stroke: e.target.value } as Partial<Layer>);
                engine?.requestRender();
              }} />
            </div>
            <div className="vs-prop-row">
              <label>SW</label>
              <input type="number" min={0} max={50} value={(layer as ShapeLayer).strokeWidth} onChange={(e) => {
                engine?.updateLayerMeta(layer.id, { strokeWidth: +e.target.value } as Partial<Layer>);
                engine?.requestRender();
              }} />
            </div>
            {(layer as ShapeLayer).shape === "roundedRect" && (
              <div className="vs-prop-row">
                <label>Radius</label>
                <input type="number" min={0} max={9999} value={(layer as ShapeLayer).cornerRadius} onChange={(e) => {
                  engine?.updateLayerMeta(layer.id, { cornerRadius: Math.max(0, +e.target.value) } as Partial<Layer>);
                  engine?.requestRender();
                }} />
              </div>
            )}
            {((layer as ShapeLayer).shape === "polygon" || (layer as ShapeLayer).shape === "star") && (
              <div className="vs-prop-row">
                <label>Points</label>
                <input type="number" min={3} max={64} value={(layer as ShapeLayer).points} onChange={(e) => {
                  engine?.updateLayerMeta(layer.id, { points: Math.max(3, Math.min(64, +e.target.value)) } as Partial<Layer>);
                  engine?.requestRender();
                }} />
              </div>
            )}
            {(layer as ShapeLayer).shape === "star" && (
              <div className="vs-prop-row">
                <label>Ratio</label>
                <input type="number" min={0.05} max={1} step={0.05} value={(layer as ShapeLayer).starRatio} onChange={(e) => {
                  engine?.updateLayerMeta(layer.id, { starRatio: Math.max(0.05, Math.min(1, +e.target.value)) } as Partial<Layer>);
                  engine?.requestRender();
                }} />
              </div>
            )}
            {(layer as ShapeLayer).shape === "path" && (
              <div className="vs-prop-row">
                <label>Path</label>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <button className="vs-btn" title="Edit anchors and bezier handles" onClick={() => useEditorStore.getState().openDialog({ name: "pathEdit", payload: { layerId: layer.id } })}>✎ Edit Path…</button>
                  <button className="vs-btn" title="Turn the path interior into an active selection" onClick={() => { engine?.selectionFromPath(layer.id); }}>➜ To Selection</button>
                </div>
              </div>
            )}
          </>
        )}

        {layer.type !== "group" && layer.type !== "adjustment" && <LayerStylesSection layer={layer} />}
      </div>
    </PanelShell>
  );
}