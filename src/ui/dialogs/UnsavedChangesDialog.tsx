import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";

export function UnsavedChangesDialog() {
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const engine = runtime.engine;

  const saveAndContinue = () => {
    void engine?.resolvePendingDocAction(true);
    closeDialog();
  };
  const discardAndContinue = () => {
    void engine?.resolvePendingDocAction(false);
    closeDialog();
  };
  const cancel = () => {
    engine?.cancelPendingDocAction();
    closeDialog();
  };

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div className="vs-modal" style={{ minWidth: 340 }}>
        <div className="vs-modal-header"><span>Unsaved Changes</span></div>
        <div className="vs-modal-body" style={{ padding: "16px 20px", color: "var(--text-dim)", fontSize: 13, lineHeight: 1.5 }}>
          You have unsaved changes in the current document. What would you like to do?
        </div>
        <div className="vs-modal-footer" style={{ gap: 8 }}>
          <button className="vs-btn" onClick={cancel}>Cancel</button>
          <button className="vs-btn" onClick={discardAndContinue}>Don&rsquo;t Save</button>
          <button className="vs-btn primary" onClick={saveAndContinue}>Save</button>
        </div>
      </div>
    </div>
  );
}
