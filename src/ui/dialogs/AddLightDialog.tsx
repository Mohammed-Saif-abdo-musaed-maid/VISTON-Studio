import { useState } from "react";
import { useEditorStore } from "../../state/store";
import { t } from "../../i18n";
import { addLightToScene } from "../../3d/core/sceneDataStore";
import { LIGHT_KINDS } from "../../3d/types/types3d";
import type { LightKind } from "../../3d/types/types3d";

const LABEL: Record<LightKind, string> = {
  ambient: "Ambient",
  directional: "Directional",
  point: "Point",
  spot: "Spot",
};

export function AddLightDialog() {
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const [kind, setKind] = useState<LightKind>("point");

  const add = () => {
    addLightToScene(kind);
    closeDialog();
  };

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal" style={{ minWidth: 340 }}>
        <div className="vs-modal-header"><span>{t("vpAddLight")}</span></div>
        <div className="vs-modal-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label className="vs-field">
            <span>{t("vpKind")}</span>
            <select className="vs-input" value={kind} onChange={(e) => setKind(e.target.value as LightKind)}>
              {LIGHT_KINDS.map((k) => (
                <option key={k} value={k}>{LABEL[k]}</option>
              ))}
            </select>
          </label>
          <div className="vs-hint">{t("vpLightHint")}</div>
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn" onClick={closeDialog}>{t("cancel")}</button>
          <button className="vs-btn primary" onClick={add}>{t("vpAddLight")}</button>
        </div>
      </div>
    </div>
  );
}
