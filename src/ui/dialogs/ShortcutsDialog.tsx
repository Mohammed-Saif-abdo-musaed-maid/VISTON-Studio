import { useEditorStore } from "../../state/store";

const shortcuts = [
  ["Ctrl+N", "New Project"],
  ["Ctrl+O", "Open Image"],
  ["Ctrl+Shift+I", "Import Image"],
  ["Ctrl+S", "Save Project"],
  ["Ctrl+Shift+E", "Export"],
  ["Ctrl+Z", "Undo"],
  ["Ctrl+Shift+Z", "Redo"],
  ["Ctrl+C", "Copy"],
  ["Ctrl+X", "Cut"],
  ["Ctrl+V", "Paste"],
  ["Delete", "Delete Selection"],
  ["Ctrl+A", "Select All"],
  ["Ctrl+D", "Deselect"],
  ["Ctrl+J", "Duplicate Layer"],
  ["Ctrl+G", "Group"],
  ["Ctrl+Shift+G", "Ungroup"],
  ["Ctrl+E", "Merge Down"],
  ["V", "Move Tool"],
  ["M", "Selection Tool"],
  ["C", "Crop Tool"],
  ["B", "Brush Tool"],
  ["E", "Eraser Tool"],
  ["T", "Text Tool"],
  ["U", "Shape Tool"],
  ["H", "Hand Tool"],
  ["Z", "Zoom Tool"],
  ["Ctrl+=", "Zoom In"],
  ["Ctrl+-", "Zoom Out"],
  ["Ctrl+0", "Fit to Screen"],
  ["Ctrl+1", "100%"],
  ["Space+Drag", "Pan Canvas"],
  ["Esc", "Cancel / Deselect"],
];

export function ShortcutsDialog() {
  const closeDialog = useEditorStore((s) => s.closeDialog);

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal" style={{ minWidth: 420, maxHeight: "70vh" }}>
        <div className="vs-modal-header"><span>Keyboard Shortcuts</span></div>
        <div className="vs-modal-body" style={{ overflowY: "auto" }}>
          {shortcuts.map(([key, desc]) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
              <span style={{ color: "var(--text-muted)" }}>{desc}</span>
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)" }}>{key}</code>
            </div>
          ))}
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn primary" onClick={closeDialog}>Close</button>
        </div>
      </div>
    </div>
  );
}