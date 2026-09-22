import { useState } from "react";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import { t } from "../../i18n";
import { exportFormatSupportsAlpha, type ExportFormat } from "../../editor/export/exportFormats";

type ExportScope = "composite" | "selection" | "layer" | "artboard";

export function ExportDialog() {
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const doc = useEditorStore((s) => s.doc);
  const [format, setFormat] = useState<ExportFormat>("png");
  const [scope, setScope] = useState<ExportScope>("composite");
  const [quality, setQuality] = useState(92);
  const [transparency, setTransparency] = useState(true);
  const [fileName, setFileName] = useState("");
  const [width, setWidth] = useState(doc?.width ?? 0);
  const [height, setHeight] = useState(doc?.height ?? 0);
  const [error, setError] = useState<string | null>(null);
  const supportsAlpha = exportFormatSupportsAlpha(format);

  const handleExport = async () => {
    const engine = runtime.engine;
    if (!engine) return;
    const opts = {
      format,
      quality,
      width: width || undefined,
      height: height || undefined,
      transparent: supportsAlpha ? transparency : false,
      baseName: fileName || undefined,
    };
    const res =
      scope === "selection"
        ? await engine.exportSelection(opts)
        : scope === "layer"
          ? await engine.exportLayer(opts)
          : scope === "artboard"
            ? await engine.exportArtboard(opts)
            : await engine.exportComposite(opts);
    if (!res.ok) {
      setError(res.error ?? "Export failed.");
      return;
    }
    closeDialog();
  };

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal">
        <div className="vs-modal-header">
          <span>{t("exportImage")}</span>
          <button className="vs-btn" style={{ padding: "2px 8px", fontSize: 14 }} onClick={closeDialog}>×</button>
        </div>
        <div className="vs-modal-body">
          <div className="vs-field">
            <label>{t("exportScope")}</label>
            <select value={scope} onChange={(e) => setScope(e.target.value as ExportScope)}>
              <option value="composite">{t("scopeComposite")}</option>
              <option value="selection">{t("scopeSelection")}</option>
              <option value="layer">{t("scopeLayer")}</option>
              <option value="artboard">{t("scopeArtboard")}</option>
            </select>
          </div>
          <div className="vs-field">
            <label>{t("format")}</label>
            <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
              <option value="bmp">BMP</option>
            </select>
          </div>
          {supportsAlpha && (
            <div className="vs-field">
              <label>{t("transparency")}</label>
              <input type="checkbox" checked={transparency} onChange={(e) => setTransparency(e.target.checked)} />
            </div>
          )}
          {format !== "png" && (
            <div className="vs-field">
              <label>{t("quality")} ({quality}%)</label>
              <input type="range" min={1} max={100} value={quality} onChange={(e) => setQuality(+e.target.value)} />
            </div>
          )}
          <div className="vs-field">
            <label>{t("docInfoWidth")}</label>
            <input type="number" min={1} max={10000} value={width} onChange={(e) => { const v = +e.target.value; setWidth(v); setHeight(doc ? Math.round(v * doc.height / doc.width) : v); }} />
          </div>
          <div className="vs-field">
            <label>{t("docInfoHeight")}</label>
            <input type="number" min={1} max={10000} value={height} onChange={(e) => { const v = +e.target.value; setHeight(v); setWidth(doc ? Math.round(v * doc.width / doc.height) : v); }} />
          </div>
          <div className="vs-field">
            <label>{t("fileName")}</label>
            <input
              type="text"
              value={fileName}
              placeholder={useEditorStore.getState().savedName ?? useEditorStore.getState().projectName ?? "Untitled"}
              onChange={(e) => setFileName(e.target.value)}
            />
          </div>
          <div className="vs-field">
            <label>{t("location")}</label>
            <span className="vs-muted" style={{ fontSize: 12, color: "var(--text-dim)" }}>{t("locationBrowser")}</span>
          </div>
          {error && (
            <div style={{ color: "var(--danger, #ff6b6b)", fontSize: 12 }}>{error}</div>
          )}
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn" onClick={closeDialog}>{t("cancel")}</button>
          <button className="vs-btn primary" onClick={handleExport}>{t("exportAction")}</button>
        </div>
      </div>
    </div>
  );
}
