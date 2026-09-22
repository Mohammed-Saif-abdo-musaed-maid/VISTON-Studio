import { useState } from "react";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";

export function ImageSizeDialog() {
  const doc = useEditorStore.getState().doc;
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const [w, setW] = useState(doc?.width ?? 100);
  const [h, setH] = useState(doc?.height ?? 100);

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal">
        <div className="vs-modal-header"><span>Image Size</span></div>
        <div className="vs-modal-body">
          <div className="vs-field">
            <label>Width</label>
            <input type="number" min={1} max={10000} value={w} onChange={(e) => { const v = +e.target.value; setW(v); if (doc) setH(Math.round(v * doc.height / doc.width)); }} />
          </div>
          <div className="vs-field">
            <label>Height</label>
            <input type="number" min={1} max={10000} value={h} onChange={(e) => { const v = +e.target.value; setH(v); if (doc) setW(Math.round(v * doc.width / doc.height)); }} />
          </div>
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn" onClick={closeDialog}>Cancel</button>
          <button className="vs-btn primary" onClick={() => { runtime.engine?.setImageSize(w, h); closeDialog(); }}>Apply</button>
        </div>
      </div>
    </div>
  );
}

export function CanvasSizeDialog() {
  const doc = useEditorStore.getState().doc;
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const [w, setW] = useState(doc?.width ?? 100);
  const [h, setH] = useState(doc?.height ?? 100);

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal">
        <div className="vs-modal-header"><span>Canvas Size</span></div>
        <div className="vs-modal-body">
          <div className="vs-field">
            <label>Width</label>
            <input type="number" min={1} max={10000} value={w} onChange={(e) => setW(+e.target.value)} />
          </div>
          <div className="vs-field">
            <label>Height</label>
            <input type="number" min={1} max={10000} value={h} onChange={(e) => setH(+e.target.value)} />
          </div>
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn" onClick={closeDialog}>Cancel</button>
          <button className="vs-btn primary" onClick={() => { runtime.engine?.setCanvasSize(w, h); closeDialog(); }}>Apply</button>
        </div>
      </div>
    </div>
  );
}