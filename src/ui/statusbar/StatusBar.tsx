import { useEditorStore } from "../../state/store";
import { rgbaToHex } from "../../utils/color";
import { runtime } from "../../editor/core/runtime";
import { useCallback } from "react";

export function StatusBar() {
  const zoom = useEditorStore((s) => s.zoomDisplay);
  const doc = useEditorStore((s) => s.doc);
  const cursor = useEditorStore((s) => s.cursor);
  const status = useEditorStore((s) => s.status);
  const lastError = useEditorStore((s) => s.lastError);
  const clearError = () => useEditorStore.getState().setLastError(null);

  const zoomIn = useCallback(() => runtime.canvas?.zoomAtVP({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, 1.3), []);
  const zoomOut = useCallback(() => runtime.canvas?.zoomAtVP({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, 1 / 1.3), []);
  const fit = useCallback(() => runtime.canvas?.fitToScreen(), []);
  const actual = useCallback(() => runtime.canvas?.zoom100(), []);

  const isError = !!lastError || /failed|error|unsupported/i.test(status);

  return (
    <div className="vs-statusbar">
      <div className={`info ${isError ? "sb-error" : ""}`}>
        <span>{lastError ?? status}</span>
        {isError && (
          <button
            type="button"
            className="sb-btn"
            title="Dismiss error"
            disabled={!isError}
            onClick={clearError}
            style={{ marginLeft: 4, opacity: 1 }}
          >✕</button>
        )}
      </div>
      <div className="spacer" />
      {doc && (
        <div className="info">
          <span>{doc.width} × {doc.height}</span>
        </div>
      )}
      <div className="sb-zoom">
        <button type="button" className="sb-btn" disabled={!doc} title="Zoom out" onClick={zoomOut}>−</button>
        <button type="button" className="sb-btn sb-zoom-value" disabled={!doc} title="Click to set 100%" onClick={actual}>{Math.round(zoom)}%</button>
        <button type="button" className="sb-btn" disabled={!doc} title="Zoom in" onClick={zoomIn}>+</button>
        <button type="button" className="sb-btn" disabled={!doc} title="Fit to screen" onClick={fit}>⊞ Fit</button>
      </div>
      {cursor && (
        <>
          <div className="info">
            <span>X: {cursor.x}</span>
          </div>
          <div className="info">
            <span>Y: {cursor.y}</span>
          </div>
          {cursor.rgb && (
            <div className="info" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 12, height: 12, background: rgbaToHex(cursor.rgb.r, cursor.rgb.g, cursor.rgb.b), border: "1px solid var(--border)", borderRadius: 2, display: "inline-block" }} />
              <span>{rgbaToHex(cursor.rgb.r, cursor.rgb.g, cursor.rgb.b)}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}