import { useEffect, useMemo, useState } from "react";
import { useEditorStore } from "../../state/store";
import { editorEngine } from "../../editor/core/engine";
import { selectionEngine } from "../../editor/selection/selectionEngine";
import { loadPresets, saveCustomPreset, removeCustomPreset, isPresetNameTaken, brushOptionsToPreset, presetToBrushOptions } from "../../editor/brushes/brushPresets";

function useSelectionVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => selectionEngine.subscribe(() => setV((x) => x + 1)), []);
  return v;
}

export function ToolOptionsBar() {
  const tool = useEditorStore((s) => s.tool);
  const opts = useEditorStore((s) => s.toolOptions);
  const set = useEditorStore((s) => s.setToolOption);
  useSelectionVersion();
  const [presetVersion, setPresetVersion] = useState(0);
  const presets = useMemo(() => loadPresets(), [presetVersion]);
  const [selectedPreset, setSelectedPreset] = useState("custom");

  return (
    <div className="vs-options-bar">
      {tool === "brush" && (
        <>
          <label>Size</label>
          <input type="range" min={1} max={200} value={opts.brush.size} onChange={(e) => set("brush", { size: +e.target.value })} />
          <input type="number" min={1} max={200} value={opts.brush.size} onChange={(e) => set("brush", { size: +e.target.value })} style={{ width: 50 }} />
          <div className="sep" />
          <label>Opacity</label>
          <input type="range" min={0} max={1} step={0.01} value={opts.brush.opacity} onChange={(e) => set("brush", { opacity: +e.target.value })} />
          <span style={{ width: 36, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{Math.round(opts.brush.opacity * 100)}%</span>
          <div className="sep" />
          <label>Hardness</label>
          <input type="range" min={0} max={1} step={0.01} value={opts.brush.hardness} onChange={(e) => set("brush", { hardness: +e.target.value })} />
          <span style={{ width: 36, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{Math.round(opts.brush.hardness * 100)}%</span>
          <div className="sep" />
          <label>Spacing</label>
          <input type="range" min={0.05} max={3} step={0.05} value={opts.brush.spacing} onChange={(e) => set("brush", { spacing: +e.target.value })} />
          <span style={{ width: 36, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{opts.brush.spacing.toFixed(2)}</span>
          <div className="sep" />
          <label>Flow</label>
          <input type="range" min={0.01} max={1} step={0.01} value={opts.brush.flow} onChange={(e) => set("brush", { flow: +e.target.value })} />
          <span style={{ width: 36, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{Math.round(opts.brush.flow * 100)}%</span>
          <div className="sep" />
          <label>Dynamics</label>
          <input type="range" min={0} max={1} step={0.01} value={opts.brush.dynamics} onChange={(e) => set("brush", { dynamics: +e.target.value })} />
          <span style={{ width: 36, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{Math.round(opts.brush.dynamics * 100)}%</span>
          <div className="sep" />
          <label>Scatter</label>
          <input type="range" min={0} max={1} step={0.01} value={opts.brush.scatter} onChange={(e) => set("brush", { scatter: +e.target.value })} />
          <span style={{ width: 36, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{Math.round(opts.brush.scatter * 100)}%</span>
          <div className="sep" />
          <label>Preset</label>
          <select value={selectedPreset} onChange={(e) => {
            const v = e.target.value;
            setSelectedPreset(v);
            if (v !== "custom") {
              const p = presets.find((x) => x.name === v);
              if (p) set("brush", presetToBrushOptions(p));
            }
          }} style={{ width: 110 }}>
            <option value="custom">Custom</option>
            {presets.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
          <button type="button" title="Save the current brush settings as a preset" onClick={() => {
            const name = window.prompt("Preset name:", "");
            if (!name) return;
            const trimmed = name.trim();
            if (!trimmed) return;
            if (isPresetNameTaken(trimmed)) {
              window.alert("A preset with that name already exists.");
              return;
            }
            if (saveCustomPreset(brushOptionsToPreset(trimmed, opts.brush))) {
              setPresetVersion((v) => v + 1);
              setSelectedPreset(trimmed);
            }
          }}>Save</button>
          {(() => {
            const sel = presets.find((p) => p.name === selectedPreset);
            if (!sel?.custom) return null;
            return (
              <button type="button" className="secondary" title="Remove this custom preset" onClick={() => {
                if (removeCustomPreset(selectedPreset)) {
                  setPresetVersion((v) => v + 1);
                  setSelectedPreset("custom");
                }
              }}>Remove</button>
            );
          })()}
          <div className="sep" />
          <label>Color</label>
          <input type="color" value={opts.brush.color} onChange={(e) => set("brush", { color: e.target.value })} />
        </>
      )}
      {tool === "eraser" && (
        <>
          <label>Size</label>
          <input type="range" min={1} max={200} value={opts.brush.size} onChange={(e) => set("brush", { size: +e.target.value })} />
          <input type="number" min={1} max={200} value={opts.brush.size} onChange={(e) => set("brush", { size: +e.target.value })} style={{ width: 50 }} />
          <div className="sep" />
          <label>Opacity</label>
          <input type="range" min={0} max={1} step={0.01} value={opts.brush.opacity} onChange={(e) => set("brush", { opacity: +e.target.value })} />
          <span style={{ width: 36, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{Math.round(opts.brush.opacity * 100)}%</span>
          <div className="sep" />
          <label>Hardness</label>
          <input type="range" min={0} max={1} step={0.01} value={opts.brush.hardness} onChange={(e) => set("brush", { hardness: +e.target.value })} />
          <span style={{ width: 36, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{Math.round(opts.brush.hardness * 100)}%</span>
          <div className="sep" />
          <label>Spacing</label>
          <input type="range" min={0.05} max={3} step={0.05} value={opts.brush.spacing} onChange={(e) => set("brush", { spacing: +e.target.value })} />
          <span style={{ width: 36, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{opts.brush.spacing.toFixed(2)}</span>
        </>
      )}
      {tool === "pencil" && (
        <>
          <label>Size</label>
          <input type="range" min={1} max={200} value={opts.pencil.size} onChange={(e) => set("pencil", { size: +e.target.value })} />
          <input type="number" min={1} max={200} value={opts.pencil.size} onChange={(e) => set("pencil", { size: +e.target.value })} style={{ width: 50 }} />
          <div className="sep" />
          <label>Opacity</label>
          <input type="range" min={0} max={1} step={0.01} value={opts.pencil.opacity} onChange={(e) => set("pencil", { opacity: +e.target.value })} />
          <span style={{ width: 36, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{Math.round(opts.pencil.opacity * 100)}%</span>
          <div className="sep" />
          <label>Spacing</label>
          <input type="range" min={0.05} max={3} step={0.05} value={opts.pencil.spacing} onChange={(e) => set("pencil", { spacing: +e.target.value })} />
          <span style={{ width: 36, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{opts.pencil.spacing.toFixed(2)}</span>
          <div className="sep" />
          <label>Color</label>
          <input type="color" value={opts.pencil.color} onChange={(e) => set("pencil", { color: e.target.value })} />
        </>
      )}
      {tool === "bucket" && (
        <>
          <label>Color</label>
          <input type="color" value={opts.brush.color} onChange={(e) => set("brush", { color: e.target.value })} />
          <div className="sep" />
          <label>Tolerance</label>
          <input type="number" min={0} max={255} value={opts.bucket.tolerance} onChange={(e) => set("bucket", { tolerance: +e.target.value })} style={{ width: 46 }} />
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Click an area to fill it. Respects the active selection.</span>
        </>
      )}
      {tool === "clone" && (
        <>
          <label>Size</label>
          <input type="range" min={1} max={300} value={opts.clone.size} onChange={(e) => set("clone", { size: +e.target.value })} />
          <input type="number" min={1} max={300} value={opts.clone.size} onChange={(e) => set("clone", { size: +e.target.value })} style={{ width: 50 }} />
          <div className="sep" />
          <label>Opacity</label>
          <input type="range" min={0} max={1} step={0.01} value={opts.clone.opacity} onChange={(e) => set("clone", { opacity: +e.target.value })} />
          <span style={{ width: 36, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{Math.round(opts.clone.opacity * 100)}%</span>
          <div className="sep" />
          <label>Spacing</label>
          <input type="range" min={0.05} max={3} step={0.05} value={opts.clone.spacing} onChange={(e) => set("clone", { spacing: +e.target.value })} />
          <span style={{ width: 36, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{opts.clone.spacing.toFixed(2)}</span>
          <div className="sep" />
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Alt+Click to set the source, then paint.</span>
        </>
      )}
      {tool === "heal" && (
        <>
          <label>Size</label>
          <input type="range" min={1} max={300} value={opts.heal.size} onChange={(e) => set("heal", { size: +e.target.value })} />
          <input type="number" min={1} max={300} value={opts.heal.size} onChange={(e) => set("heal", { size: +e.target.value })} style={{ width: 50 }} />
          <div className="sep" />
          <label>Opacity</label>
          <input type="range" min={0} max={1} step={0.01} value={opts.heal.opacity} onChange={(e) => set("heal", { opacity: +e.target.value })} />
          <span style={{ width: 36, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{Math.round(opts.heal.opacity * 100)}%</span>
          <div className="sep" />
          <label>Spacing</label>
          <input type="range" min={0.05} max={3} step={0.05} value={opts.heal.spacing} onChange={(e) => set("heal", { spacing: +e.target.value })} />
          <span style={{ width: 36, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{opts.heal.spacing.toFixed(2)}</span>
          <div className="sep" />
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Alt+Click to set the source. Matches luminance + blends edges.</span>
        </>
      )}
      {tool === "dodge" && (
        <>
          <label>Size</label>
          <input type="range" min={1} max={300} value={opts.dodge.size} onChange={(e) => set("dodge", { size: +e.target.value })} />
          <input type="number" min={1} max={300} value={opts.dodge.size} onChange={(e) => set("dodge", { size: +e.target.value })} style={{ width: 50 }} />
          <div className="sep" />
          <label>Strength</label>
          <input type="range" min={0} max={1} step={0.01} value={opts.dodge.strength} onChange={(e) => set("dodge", { strength: +e.target.value })} />
          <span style={{ width: 36, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{Math.round(opts.dodge.strength * 100)}%</span>
        </>
      )}
      {tool === "burn" && (
        <>
          <label>Size</label>
          <input type="range" min={1} max={300} value={opts.burn.size} onChange={(e) => set("burn", { size: +e.target.value })} />
          <input type="number" min={1} max={300} value={opts.burn.size} onChange={(e) => set("burn", { size: +e.target.value })} style={{ width: 50 }} />
          <div className="sep" />
          <label>Strength</label>
          <input type="range" min={0} max={1} step={0.01} value={opts.burn.strength} onChange={(e) => set("burn", { strength: +e.target.value })} />
          <span style={{ width: 36, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{Math.round(opts.burn.strength * 100)}%</span>
        </>
      )}
      {tool === "smudge" && (
        <>
          <label>Size</label>
          <input type="range" min={1} max={300} value={opts.smudge.size} onChange={(e) => set("smudge", { size: +e.target.value })} />
          <input type="number" min={1} max={300} value={opts.smudge.size} onChange={(e) => set("smudge", { size: +e.target.value })} style={{ width: 50 }} />
          <div className="sep" />
          <label>Strength</label>
          <input type="range" min={0} max={1} step={0.01} value={opts.smudge.strength} onChange={(e) => set("smudge", { strength: +e.target.value })} />
          <span style={{ width: 36, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{Math.round(opts.smudge.strength * 100)}%</span>
          <div className="sep" />
          <label>Spacing</label>
          <input type="range" min={0.05} max={3} step={0.05} value={opts.smudge.spacing} onChange={(e) => set("smudge", { spacing: +e.target.value })} />
          <span style={{ width: 36, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{opts.smudge.spacing.toFixed(2)}</span>
        </>
      )}
      {tool === "pen" && (
        <>
          <label>Fill</label>
          <input type="color" value={opts.pen.fill === "transparent" ? "#ffffff" : opts.pen.fill} onChange={(e) => set("pen", { fill: e.target.value })} />
          <label className="vs-check"><input type="checkbox" checked={opts.pen.fill !== "transparent"} onChange={(e) => set("pen", { fill: e.target.checked ? opts.pen.fill === "transparent" ? "#ffffff" : opts.pen.fill : "transparent" })} /> Fill</label>
          <div className="sep" />
          <label>Stroke</label>
          <input type="color" value={opts.pen.stroke} onChange={(e) => set("pen", { stroke: e.target.value })} />
          <div className="sep" />
          <label>Width</label>
          <input type="number" min={1} max={50} value={opts.pen.strokeWidth} onChange={(e) => set("pen", { strokeWidth: +e.target.value })} style={{ width: 44 }} />
          <div className="sep" />
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Click to add points. Double-click the last point to finish the path.</span>
        </>
      )}
      {tool === "selection" && (
        <>
          <label>Mode</label>
          <select value={opts.selection.mode} onChange={(e) => set("selection", { mode: e.target.value as "replace" | "add" | "subtract" | "intersect" })}>
            <option value="replace">New Selection</option>
            <option value="add">Add</option>
            <option value="subtract">Subtract</option>
            <option value="intersect">Intersect</option>
          </select>
          <div className="sep" />
          <label>Shape</label>
          <select value={opts.selection.shape} onChange={(e) => { set("selection", { shape: e.target.value as "rect" | "ellipse" | "lasso", useWand: false }); window.dispatchEvent(new CustomEvent("vs-selection-shape-change")); }}>
            <option value="rect">Rectangle</option>
            <option value="ellipse">Ellipse</option>
            <option value="lasso">Lasso</option>
          </select>
          <div className="sep" />
          <label className="vs-check"><input type="checkbox" checked={opts.selection.useWand} onChange={(e) => { set("selection", { useWand: e.target.checked, shape: "rect" }); window.dispatchEvent(new CustomEvent("vs-selection-shape-change")); }} /> Wand</label>
          {opts.selection.useWand && (
            <>
              <div className="sep" />
              <label>Tolerance</label>
              <input type="number" min={0} max={255} value={opts.selection.tolerance} onChange={(e) => set("selection", { tolerance: +e.target.value })} style={{ width: 46 }} />
            </>
          )}
          <div className="sep" />
          <button onClick={() => selectionEngine.feather(4)} title="Feather selection by 4px">Feather</button>
          <button onClick={() => selectionEngine.expand(4)} title="Expand selection by 4px">Expand</button>
          <button onClick={() => selectionEngine.contract(4)} title="Contract selection by 4px">Contract</button>
          <button onClick={() => selectionEngine.border(4)} title="Select a ring around the current selection">Border</button>
          <button onClick={() => selectionEngine.smooth(4)} title="Smooth selection edges">Smooth</button>
          <button onClick={() => {
            const st = useEditorStore.getState();
            const cur = st.cursor;
            const doc = editorEngine.doc();
            if (!cur || !doc) {
              useEditorStore.setState({ status: "Move the pointer over a pixel first, then select similar." });
              return;
            }
            const comp = editorEngine.getComposite();
            if (!comp) return;
            const ctx = comp.getContext("2d");
            if (!ctx) return;
            const img = ctx.getImageData(0, 0, comp.width, comp.height);
            const sOpts = st.toolOptions.selection;
            selectionEngine.resize(comp.width, comp.height);
            selectionEngine.selectSimilar(img, sOpts.tolerance, cur.x, cur.y, sOpts.mode);
            editorEngine.requestRender();
          }} title="Select all pixels similar to the sampled color">Similar</button>
          <button className="secondary" onClick={() => selectionEngine.clear()} title="Deselect">Clear</button>
        </>
      )}
      {tool === "gradient" && (
        <>
          <label>Type</label>
          <select value={opts.gradient.kind} onChange={(e) => set("gradient", { kind: e.target.value as "linear" | "radial" })}>
            <option value="linear">Linear</option>
            <option value="radial">Radial</option>
          </select>
          <div className="sep" />
          <label>Start</label>
          <input type="color" value={opts.gradient.colorStart} onChange={(e) => set("gradient", { colorStart: e.target.value })} />
          <div className="sep" />
          <label>End</label>
          <input type="color" value={opts.gradient.colorEnd} onChange={(e) => set("gradient", { colorEnd: e.target.value })} />
        </>
      )}
      {tool === "crop" && (
        <>
          <label>Aspect</label>
          <select value={opts.crop.aspect} onChange={(e) => set("crop", { aspect: e.target.value as "free" | "1:1" | "4:3" | "3:2" | "16:9" | "16:10" | "5:7" })}>
            <option value="free">Free</option>
            <option value="1:1">1:1</option>
            <option value="4:3">4:3</option>
            <option value="3:2">3:2</option>
            <option value="16:9">16:9</option>
            <option value="16:10">16:10</option>
            <option value="5:7">5:7</option>
          </select>
          <div className="sep" />
          <button onClick={() => editorEngine.applyCropFromTool()}>Apply</button>
          <button className="secondary" onClick={() => editorEngine.cancelCrop()}>Cancel</button>
          {editorEngine.hasCropSelection() && (
            <>
              <div className="sep" />
              <button onClick={() => editorEngine.applyCropToSelection()} title="Crop the document to the current selection bounds">To Selection</button>
            </>
          )}
          <div className="sep" />
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Drag inside the canvas. Hold Alt for a centered crop.</span>
        </>
      )}
      {tool === "text" && (
        <>
          <label>Font</label>
          <select value={opts.text.fontFamily} onChange={(e) => set("text", { fontFamily: e.target.value })} style={{ width: 120 }}>
            <option>Arial</option><option>Helvetica</option><option>Times New Roman</option><option>Courier New</option><option>Georgia</option><option>Verdana</option>
          </select>
          <div className="sep" />
          <label>Size</label>
          <input type="number" min={8} max={300} value={opts.text.fontSize} onChange={(e) => set("text", { fontSize: +e.target.value })} style={{ width: 50 }} />
          <div className="sep" />
          <label>Color</label>
          <input type="color" value={opts.text.color} onChange={(e) => set("text", { color: e.target.value })} />
          <div className="sep" />
          <button className={`vs-opt-toggle ${opts.text.fontWeight >= 600 ? "active" : ""}`} title="Bold (applies to new text)" onClick={() => set("text", { fontWeight: opts.text.fontWeight >= 600 ? 400 : 700 })} style={{ fontWeight: 700 }}>B</button>
          <button className={`vs-opt-toggle ${opts.text.fontStyle === "italic" ? "active" : ""}`} title="Italic (applies to new text)" onClick={() => set("text", { fontStyle: opts.text.fontStyle === "italic" ? "normal" : "italic" })} style={{ fontStyle: "italic" }}>I</button>
          <div className="sep" />
          <label>Align</label>
          <select value={opts.text.align} onChange={(e) => set("text", { align: e.target.value as "left" | "center" | "right" })}>
            <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
          </select>
          <div className="sep" />
          <label>Spacing</label>
          <input type="number" min={0} max={40} step={0.5} value={opts.text.letterSpacing} onChange={(e) => set("text", { letterSpacing: +e.target.value })} style={{ width: 46 }} />
          <div className="sep" />
          <label>Direction</label>
          <select value={opts.text.direction} onChange={(e) => set("text", { direction: e.target.value as "ltr" | "rtl" })}>
            <option value="ltr">LTR</option><option value="rtl">RTL</option>
          </select>
        </>
      )}
      {tool === "shape" && (
        <>
          <label>Shape</label>
          <select value={opts.shape.kind} onChange={(e) => {
            const kind = e.target.value as "rect" | "ellipse" | "line" | "arrow" | "roundedRect" | "polygon" | "star";
            set("shape", { kind });
            window.dispatchEvent(new CustomEvent("vs-shape-kind-change", { detail: kind }));
          }}>
            <option value="rect">Rectangle</option>
            <option value="roundedRect">Rounded Rect</option>
            <option value="ellipse">Ellipse</option>
            <option value="polygon">Polygon</option>
            <option value="star">Star</option>
            <option value="line">Line</option>
            <option value="arrow">Arrow</option>
          </select>
          <div className="sep" />
          <label>Fill</label>
          <input type="color" value={opts.shape.fill} onChange={(e) => set("shape", { fill: e.target.value })} />
          <div className="sep" />
          <label>Stroke</label>
          <input type="color" value={opts.shape.stroke} onChange={(e) => set("shape", { stroke: e.target.value })} />
          <div className="sep" />
          <label>Width</label>
          <input type="number" min={1} max={50} value={opts.shape.strokeWidth} onChange={(e) => set("shape", { strokeWidth: +e.target.value })} style={{ width: 44 }} />
          {opts.shape.kind === "roundedRect" && (
            <>
              <div className="sep" />
              <label>Radius</label>
              <input type="number" min={0} max={200} value={opts.shape.cornerRadius} onChange={(e) => set("shape", { cornerRadius: +e.target.value })} style={{ width: 46 }} />
            </>
          )}
          {(opts.shape.kind === "polygon" || opts.shape.kind === "star") && (
            <>
              <div className="sep" />
              <label>Points</label>
              <input type="number" min={3} max={24} value={opts.shape.points} onChange={(e) => set("shape", { points: +e.target.value })} style={{ width: 46 }} />
            </>
          )}
          {opts.shape.kind === "star" && (
            <>
              <div className="sep" />
              <label>Ratio</label>
              <input type="number" min={0.05} max={1} step={0.05} value={opts.shape.starRatio} onChange={(e) => set("shape", { starRatio: +e.target.value })} style={{ width: 46 }} />
            </>
          )}
        </>
      )}
      {tool === "move" && (
        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Click a layer to select, then drag to move. Use Transform handles for resize/rotate.</span>
      )}
      {tool === "eyedropper" && (
        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Click a pixel in the document to sample its color and set it as the brush color.</span>
      )}
      {tool === "hand" && (
        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Click and drag to pan the canvas.</span>
      )}
      {tool === "zoom" && (
        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Click to zoom in. Shift+Click to zoom out.</span>
      )}
    </div>
  );
}