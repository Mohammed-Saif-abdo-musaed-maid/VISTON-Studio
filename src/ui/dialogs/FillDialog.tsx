import { useState } from "react";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";

export function FillDialog() {
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const [color, setColor] = useState("#000000");
  const [opacity, setOpacity] = useState(100);

  const handleApply = () => {
    runtime.engine?.fillSelection(color, opacity / 100);
    closeDialog();
  };

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal vs-dialog-fill">
        <div className="vs-modal-header">
          <span>Fill</span>
          <button className="vs-btn" style={{ padding: "2px 8px", fontSize: 14 }} onClick={closeDialog}>×</button>
        </div>
        <div className="vs-modal-body">
          <div className="vs-field">
            <label>Color</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
          <div className="vs-field">
            <label>Opacity ({opacity}%)</label>
            <input type="range" min={0} max={100} value={opacity} onChange={(e) => setOpacity(+e.target.value)} />
          </div>
          <div className="vs-hint" style={{ color: "var(--text-muted)", fontSize: 11 }}>
            Fills the current selection on the active image layer. With no selection, the whole layer is filled.
          </div>
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn" onClick={closeDialog}>Cancel</button>
          <button className="vs-btn primary" onClick={handleApply}>Fill</button>
        </div>
      </div>
    </div>
  );
}