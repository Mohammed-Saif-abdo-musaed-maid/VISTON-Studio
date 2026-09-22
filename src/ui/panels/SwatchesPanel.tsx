import { useState } from "react";
import { useEditorStore } from "../../state/store";
import { t } from "../../i18n";
import { PanelShell } from "./PanelShell";

const PRESET_SWATCHES: string[] = [
  "#ffffff", "#cccccc", "#999999", "#666666", "#333333", "#000000",
  "#ff4d4d", "#ff9900", "#ffd700", "#00cc66", "#4dabff", "#4d7fff",
  "#b266ff", "#ff66cc", "#ff8c66", "#8c6b4d", "#66cccc", "#cc66cc",
];

export function SwatchesPanel() {
  const swatches = useEditorStore((s) => s.swatches);
  const addSwatch = useEditorStore((s) => s.addSwatch);
  const removeSwatch = useEditorStore((s) => s.removeSwatch);
  const [input, setInput] = useState("");

  const pick = (color: string) => {
    useEditorStore.getState().setToolOption("brush", { color });
    useEditorStore.getState().setStatus(`Swatch ${color.toUpperCase()}`);
  };

  const addCustom = () => {
    const hex = input.trim().startsWith("#") ? input.trim() : `#${input.trim()}`;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      addSwatch(hex);
      pick(hex);
    }
    setInput("");
  };

  return (
    <PanelShell id="swatches" title={t("panelSwatches")} grow>
      <div className="vs-swatches">
        <div className="vs-swatches-group">{t("preset")}</div>
        <div className="vs-swatches-row">
          {PRESET_SWATCHES.map((c) => (
            <button key={c} type="button" className="vs-swatch" style={{ background: c }} title={c} onClick={() => pick(c)} aria-label={c} />
          ))}
        </div>
        {swatches.length > 0 && (
          <>
            <div className="vs-swatches-group">{t("swatches")}</div>
            <div className="vs-swatches-row">
              {swatches.map((c) => (
                <button key={c} type="button" className="vs-swatch" style={{ background: c }} title={t("removeSwatch")} onClick={() => pick(c)} onContextMenu={(e) => { e.preventDefault(); removeSwatch(c); }} aria-label={c}>
                  <span className="vs-swatch-x">✕</span>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="vs-swatches-add">
          <input
            type="color"
            aria-label={t("addSwatch")}
            onChange={(e) => {
              const v = e.target.value;
              addSwatch(v);
              pick(v);
            }}
          />
          <input
            type="text"
            placeholder={t("swatchCustom")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
          />
          <button type="button" onClick={addCustom}>{t("add")}</button>
        </div>
      </div>
    </PanelShell>
  );
}