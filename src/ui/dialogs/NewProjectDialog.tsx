import { useState } from "react";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import {
  DOC_PRESETS,
  DPI_PRESETS,
  PRESET_GROUPS,
  convertUnit,
  getPreset,
  orientationLabel,
  physicalToPx,
  roundPx,
  formatPhysical,
  unitLabel,
  type DocOrientation,
  type DocUnit,
} from "../../editor/core/documentPresets";

type BgMode = "transparent" | "white" | "custom";

const DEFAULT_PRESET = "a4";

function isFinitePositive(v: number): boolean {
  return Number.isFinite(v) && v > 0;
}

export function NewProjectDialog() {
  const closeDialog = useEditorStore((s) => s.closeDialog);

  const [name, setName] = useState("Untitled");
  const [presetKey, setPresetKey] = useState(DEFAULT_PRESET);
  const [unit, setUnit] = useState<DocUnit>("mm");
  const [canonW, setCanonW] = useState(210);
  const [canonH, setCanonH] = useState(297);
  const [orientation, setOrientation] = useState<DocOrientation>("portrait");
  const [dpi, setDpi] = useState(300);
  const [bgMode, setBgMode] = useState<BgMode>("white");
  const [customBg, setCustomBg] = useState("#ffffff");

  const preset = getPreset(presetKey);

  const pxW = roundPx(physicalToPx(canonW, unit, dpi));
  const pxH = roundPx(physicalToPx(canonH, unit, dpi));

  const background = bgMode === "transparent" ? null : bgMode === "custom" ? customBg : "#ffffff";
  const bgLabel = bgMode === "transparent" ? "Transparent" : bgMode === "custom" ? customBg : "White";

  const selectPreset = (key: string) => {
    if (key === "custom") {
      setPresetKey("custom");
      return;
    }
    const p = getPreset(key);
    setPresetKey(p.key);
    setCanonW(p.baseW);
    setCanonH(p.baseH);
    setUnit(p.unit);
    setDpi(p.dpiDefault);
    setOrientation("portrait");
  };

  const changeUnit = (u: DocUnit) => {
    if (u === unit) return;
    setCanonW(Math.round(convertUnit(canonW, unit, u, dpi) * 1000) / 1000);
    setCanonH(Math.round(convertUnit(canonH, unit, u, dpi) * 1000) / 1000);
    setUnit(u);
  };

  const changeDpi = (d: number) => {
    setDpi(d);
  };

  const changeOrientation = (o: DocOrientation) => {
    if (o === orientation) return;
    setCanonW(canonH);
    setCanonH(canonW);
    setOrientation(o);
  };

  const editSize = (axis: "w" | "h", raw: string) => {
    const v = parseFloat(raw);
    if (!isFinitePositive(v)) return;
    setPresetKey("custom");
    if (axis === "w") setCanonW(v);
    else setCanonH(v);
  };

  const submit = () => {
    void runtime.engine?.createNewDocument({
      name: name.trim().length > 0 ? name : "Untitled",
      width: pxW,
      height: pxH,
      background,
      dpi,
      physicalUnit: unit,
      physicalWidth: Math.round(canonW * 1000) / 1000,
      physicalHeight: Math.round(canonH * 1000) / 1000,
    });
    closeDialog();
  };

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal vs-modal-newdoc">
        <div className="vs-modal-header"><span>New Document</span></div>
        <div className="vs-modal-body nd-body">
          <div className="nd-presets">
            {PRESET_GROUPS.map((g) => (
              <div key={g.key} className="nd-group">
                <div className="nd-group-title">{g.label}</div>
                <div className="nd-tiles">
                  {DOC_PRESETS.filter((p) => p.group === g.key).map((p) => {
                    const w = formatPhysical(p.baseW, p.unit, p.unit === "px" ? 0 : 2);
                    const h = formatPhysical(p.baseH, p.unit, p.unit === "px" ? 0 : 2);
                    return (
                      <button
                        key={p.key}
                        type="button"
                        data-preset={p.key}
                        className={`nd-tile ${presetKey === p.key ? "active" : ""}`}
                        title={`${p.label} — ${w} × ${h} ${unitLabel(p.unit)}`}
                        onClick={() => selectPreset(p.key)}
                      >
                        <span className="nd-tile-label">{p.label}</span>
                        <span className="nd-tile-size">{w} × {h} {unitLabel(p.unit)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="nd-main">
            <div className="vs-field">
              <label>Document name</label>
              <input id="nd-name" className="vs-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>

            <div className="vs-field">
              <label>Size {presetKey !== "custom" && <span className="nd-preset-hint">({preset.label})</span>}</label>
              <div className="nd-size-row">
                <input id="nd-w" className="vs-input" type="number" min={1} step={unit === "px" ? 1 : 0.1}
                  value={formatPhysical(canonW, unit, unit === "px" ? 0 : 2)}
                  onChange={(e) => editSize("w", e.target.value)} />
                <span className="nd-times">×</span>
                <input id="nd-h" className="vs-input" type="number" min={1} step={unit === "px" ? 1 : 0.1}
                  value={formatPhysical(canonH, unit, unit === "px" ? 0 : 2)}
                  onChange={(e) => editSize("h", e.target.value)} />
                <select id="nd-unit" className="vs-input nd-unit" value={unit} onChange={(e) => changeUnit(e.target.value as DocUnit)}>
                  <option value="px">px</option>
                  <option value="mm">mm</option>
                  <option value="cm">cm</option>
                  <option value="in">in</option>
                </select>
              </div>
            </div>

            <div className="vs-field">
              <label>Orientation</label>
              <div className="nd-seg" role="group">
                <button type="button" className={`nd-seg-btn ${orientation === "portrait" ? "active" : ""}`} data-ori="portrait"
                  onClick={() => changeOrientation("portrait")}>Portrait</button>
                <button type="button" className={`nd-seg-btn ${orientation === "landscape" ? "active" : ""}`} data-ori="landscape"
                  onClick={() => changeOrientation("landscape")}>Landscape</button>
              </div>
            </div>

            <div className="vs-field">
              <label>DPI / resolution</label>
              <div className="nd-seg" role="group">
                {DPI_PRESETS.map((d) => (
                  <button key={d} type="button" className={`nd-seg-btn ${dpi === d ? "active" : ""}`} data-dpi={d}
                    onClick={() => changeDpi(d)}>{d}</button>
                ))}
              </div>
            </div>

            <div className="vs-field">
              <label>Background</label>
              <div className="nd-seg" role="group">
                <button type="button" className={`nd-seg-btn ${bgMode === "white" ? "active" : ""}`} data-bg="white"
                  onClick={() => setBgMode("white")}>White</button>
                <button type="button" className={`nd-seg-btn ${bgMode === "transparent" ? "active" : ""}`} data-bg="transparent"
                  onClick={() => setBgMode("transparent")}>Transparent</button>
                <button type="button" className={`nd-seg-btn ${bgMode === "custom" ? "active" : ""}`} data-bg="custom"
                  onClick={() => setBgMode("custom")}>Custom…</button>
                {bgMode === "custom" && (
                  <input id="nd-bg-color" type="color" className="nd-color" value={customBg} onChange={(e) => setCustomBg(e.target.value)} />
                )}
              </div>
            </div>

            <div className="nd-summary" data-testid="nd-summary">
              <div className="nd-summary-title">Document: {presetKey === "custom" ? "Custom" : preset.label}</div>
              <div>{formatPhysical(canonW, unit, unit === "px" ? 0 : 2)} × {formatPhysical(canonH, unit, unit === "px" ? 0 : 2)} {unitLabel(unit)}</div>
              <div>{orientationLabel(orientation)}</div>
              <div>{dpi} DPI</div>
              <div>{pxW} × {pxH} px</div>
              <div>Background: {bgLabel}</div>
            </div>
          </div>
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn" onClick={closeDialog}>Cancel</button>
          <button className="vs-btn primary" onClick={submit}>Create</button>
        </div>
      </div>
    </div>
  );
}