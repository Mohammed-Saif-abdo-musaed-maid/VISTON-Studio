import { useEditorStore } from "../../state/store";
import { ToolId } from "../../state/store";

const tools: { id: ToolId; icon: string; shortcut: string; label: string }[] = [
  { id: "move", icon: "↗", shortcut: "V", label: "Move" },
  { id: "selection", icon: "◻", shortcut: "M", label: "Selection" },
  { id: "crop", icon: "⊡", shortcut: "C", label: "Crop" },
  { id: "pencil", icon: "✏️", shortcut: "N", label: "Pencil" },
  { id: "brush", icon: "◉", shortcut: "B", label: "Brush" },
  { id: "eraser", icon: "○", shortcut: "E", label: "Eraser" },
  { id: "eyedropper", icon: "💧", shortcut: "I", label: "Eyedropper" },
  { id: "bucket", icon: "🪣", shortcut: "K", label: "Paint Bucket" },
  { id: "clone", icon: "⊕", shortcut: "S", label: "Clone Stamp" },
  { id: "heal", icon: "✚", shortcut: "J", label: "Healing Brush" },
  { id: "dodge", icon: "◐", shortcut: "O", label: "Dodge" },
  { id: "burn", icon: "◑", shortcut: "", label: "Burn" },
  { id: "smudge", icon: "≋", shortcut: "", label: "Smudge" },
  { id: "pen", icon: "✒", shortcut: "P", label: "Pen" },
  { id: "text", icon: "T", shortcut: "T", label: "Text" },
  { id: "shape", icon: "△", shortcut: "U", label: "Shape" },
  { id: "gradient", icon: "▤", shortcut: "G", label: "Gradient" },
  { id: "hand", icon: "✋", shortcut: "H", label: "Hand" },
  { id: "zoom", icon: "🔍", shortcut: "Z", label: "Zoom" },
];

export function LeftToolbar() {
  const tool = useEditorStore((s) => s.tool);
  const doc = useEditorStore((s) => s.doc);
  const setTool = useEditorStore((s) => s.setTool);

  return (
    <div className="vs-toolbar" role="toolbar" aria-label="Tools">
      {tools.map((t) => {
        const disabled = !doc;
        return (
          <button
            key={t.id}
            type="button"
            className={`vs-tool-btn ${tool === t.id ? "active" : ""}`}
            onClick={() => setTool(t.id)}
            title={`${t.label} (${t.shortcut})`}
            disabled={disabled}
            aria-pressed={tool === t.id}
            aria-label={`${t.label} tool`}
          >
            {t.icon}
          </button>
        );
      })}
    </div>
  );
}