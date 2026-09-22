import { useState } from "react";
import { useEditorStore } from "../../state/store";
import { t } from "../../i18n";
import { addObjectToScene } from "../../3d/core/sceneDataStore";
import { PRIMITIVE_KINDS } from "../../3d/types/types3d";
import type { PrimitiveKind } from "../../3d/types/types3d";

const LABEL: Record<PrimitiveKind, string> = {
  cube: "Cube",
  sphere: "Sphere",
  cylinder: "Cylinder",
  cone: "Cone",
  plane: "Plane",
  torus: "Torus",
  capsule: "Capsule",
};

export function AddPrimitiveDialog() {
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const [kind, setKind] = useState<PrimitiveKind>("sphere");

  const add = () => {
    addObjectToScene(kind);
    closeDialog();
  };

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal" style={{ minWidth: 340 }}>
        <div className="vs-modal-header"><span>{t("vpAddObject")}</span></div>
        <div className="vs-modal-body" style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
          <label className="vs-field">
            <span>{t("vpPrimitive")}</span>
            <select className="vs-input" value={kind} onChange={(e) => setKind(e.target.value as PrimitiveKind)}>
              {PRIMITIVE_KINDS.map((k) => (
                <option key={k} value={k}>{LABEL[k]}</option>
              ))}
            </select>
          </label>
          <div className="vs-hint">{t("vpPrimitiveHint")}</div>
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn" onClick={closeDialog}>{t("cancel")}</button>
          <button className="vs-btn primary" onClick={add}>{t("vpAddObject")}</button>
        </div>
      </div>
    </div>
  );
}
