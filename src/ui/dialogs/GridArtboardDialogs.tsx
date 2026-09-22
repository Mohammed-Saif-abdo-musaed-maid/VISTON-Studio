import { useState } from "react";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import { t } from "../../i18n";
import { sanitizeGridSettings } from "../../editor/core/gridSettings";

export function GridSettingsDialog() {
  const current = useEditorStore.getState().gridSettings;
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const [spacing, setSpacing] = useState(current.spacing);
  const [subdivisions, setSubdivisions] = useState(current.subdivisions);
  const [color, setColor] = useState(current.color);

  const apply = () => {
    useEditorStore.getState().setGridSettings(
      sanitizeGridSettings({ spacing, subdivisions, color })
    );
    closeDialog();
  };

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal">
        <div className="vs-modal-header"><span>{t("gridSettings")}</span></div>
        <div className="vs-modal-body">
          <div className="vs-field">
            <label>{t("gridSpacing")}</label>
            <input type="number" min={1} max={4096} value={spacing} onChange={(e) => setSpacing(+e.target.value)} />
          </div>
          <div className="vs-field">
            <label>{t("gridSubdivisions")}</label>
            <input type="number" min={1} max={64} value={subdivisions} onChange={(e) => setSubdivisions(+e.target.value)} />
          </div>
          <div className="vs-field">
            <label>{t("gridColor")}</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn" onClick={closeDialog}>{t("cancel")}</button>
          <button className="vs-btn primary" onClick={apply}>{t("apply")}</button>
        </div>
      </div>
    </div>
  );
}

export function ArtboardDialog() {
  const doc = useEditorStore.getState().doc;
  const dialog = useEditorStore((s) => s.dialog);
  const artboards = useEditorStore.getState().artboards;
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const editId = typeof dialog?.payload?.artboardId === "string" ? dialog.payload.artboardId : null;
  const existing = editId ? artboards.find((a) => a.id === editId) ?? null : null;

  const docW = doc?.width ?? 1024;
  const docH = doc?.height ?? 1024;
  const defaultW = Math.min(512, docW);
  const defaultH = Math.min(512, docH);

  const [name, setName] = useState(existing?.name ?? t("newArtboard"));
  const [x, setX] = useState(existing?.x ?? Math.round((docW - defaultW) / 2));
  const [y, setY] = useState(existing?.y ?? Math.round((docH - defaultH) / 2));
  const [width, setWidth] = useState(existing?.width ?? defaultW);
  const [height, setHeight] = useState(existing?.height ?? defaultH);
  const [background, setBackground] = useState(existing?.background ?? "#ffffff");

  const apply = () => {
    const rect = { x, y, width, height };
    if (existing) {
      runtime.engine?.updateArtboard(existing.id, { ...rect, name, background }, "Edit Artboard");
    } else {
      runtime.engine?.addArtboard(rect, name);
    }
    closeDialog();
  };

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal">
        <div className="vs-modal-header"><span>{existing ? t("renameArtboard") : t("newArtboard")}</span></div>
        <div className="vs-modal-body">
          <div className="vs-field">
            <label>{t("artboardName")}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="vs-field">
            <label>{t("artboardPosition")}</label>
            <input type="number" value={x} onChange={(e) => setX(+e.target.value)} />
            <input type="number" value={y} onChange={(e) => setY(+e.target.value)} />
          </div>
          <div className="vs-field">
            <label>{t("artboardSize")}</label>
            <input type="number" min={1} max={10000} value={width} onChange={(e) => setWidth(+e.target.value)} />
            <input type="number" min={1} max={10000} value={height} onChange={(e) => setHeight(+e.target.value)} />
          </div>
          <div className="vs-field">
            <label>{t("artboardBackground")}</label>
            <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} />
          </div>
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn" onClick={closeDialog}>{t("cancel")}</button>
          <button className="vs-btn primary" onClick={apply}>{t("apply")}</button>
        </div>
      </div>
    </div>
  );
}
