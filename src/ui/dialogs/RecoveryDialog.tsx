import { useEffect, useState } from "react";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import type { AutosaveSlot } from "../../editor/project/projectStorage";

export function RecoveryDialog() {
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const engine = runtime.engine;
  const [slots, setSlots] = useState<AutosaveSlot[]>([]);

  useEffect(() => { setSlots(engine?.listRecoverableDocuments() ?? []); }, [engine]);

  const recover = async (id: string) => {
    await engine?.recoverFromAutosave(id);
    setSlots(engine?.listRecoverableDocuments() ?? []);
  };
  const discard = (id: string) => {
    engine?.discardRecoverableDocument(id);
    setSlots(engine?.listRecoverableDocuments() ?? []);
  };
  const discardAll = () => {
    engine?.discardAllRecoverableDocuments();
    closeDialog();
  };

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal" style={{ minWidth: 400 }}>
        <div className="vs-modal-header"><span>Recover Documents</span></div>
        <div className="vs-modal-body" style={{ padding: "12px 16px", maxHeight: 320, overflowY: "auto" }}>
          {slots.length === 0 && (
            <div style={{ color: "var(--text-muted)", fontSize: 12 }}>No recoverable documents found.</div>
          )}
          {slots.map((s) => (
            <div key={s.docId} className="vs-recovery-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 4px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                <div style={{ fontWeight: 600 }}>{s.name || "Untitled"}</div>
                <div style={{ color: "var(--text-muted)", marginTop: 2 }}>{new Date(s.savedAt).toLocaleString()}</div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="vs-btn primary" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => void recover(s.docId)}>Recover</button>
                <button className="vs-btn" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => discard(s.docId)}>Discard</button>
              </div>
            </div>
          ))}
        </div>
        <div className="vs-modal-footer" style={{ gap: 8 }}>
          {slots.length > 0 && (
            <button className="vs-btn" style={{ marginRight: "auto", color: "var(--danger)" }} onClick={discardAll}>Discard All</button>
          )}
          <button className="vs-btn primary" onClick={closeDialog}>Close</button>
        </div>
      </div>
    </div>
  );
}
