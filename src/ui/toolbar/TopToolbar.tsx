import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import { t } from "../../i18n";
import { importAcceptString } from "../../editor/import/importFormats";

interface TopAction {
  id: string;
  icon: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  active?: boolean;
  action: () => void;
}

export function TopToolbar() {
  const doc = useEditorStore((s) => s.doc);
  const historyIndex = useEditorStore((s) => s.historyIndex);
  const compare = useEditorStore((s) => s.compare);
  const view3d = useEditorStore((s) => s.view3d);
  const engine = runtime.engine;
  const hasDoc = !!doc;
  void historyIndex;

  const actions: TopAction[] = [
    { id: "new", icon: "\uD83D\uDCC4", label: t("newDocument"), shortcut: "Ctrl+N", action: () => engine?.requestNewDocument() },
    { id: "open", icon: "\uD83D\uDCC2", label: t("openProject"), shortcut: "Ctrl+O", action: () => void engine?.openProject() },
    { id: "import", icon: "\u21E9", label: t("importImage"), shortcut: "Ctrl+Shift+I", action: () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = importAcceptString();
      input.onchange = () => { if (input.files?.[0]) void runtime.engine?.importImageFile(input.files[0]); };
      input.click();
    }},
    { id: "sep1", icon: "|", label: "", shortcut: undefined, disabled: true, action: () => undefined },
    { id: "save", icon: "\uD83D\uDCBE", label: t("save"), shortcut: "Ctrl+S", disabled: !hasDoc, action: () => void engine?.saveProject() },
    { id: "saveAs", icon: "\uD83D\uDCDD", label: t("saveAs"), shortcut: "Ctrl+Shift+S", disabled: !hasDoc, action: () => void engine?.saveProject({ asNew: true }) },
    { id: "sep2", icon: "|", label: "", shortcut: undefined, disabled: true, action: () => undefined },
    { id: "undo", icon: "\u21A9", label: t("undo"), shortcut: "Ctrl+Z", disabled: !engine?.canUndo(), action: () => engine?.undo() },
    { id: "redo", icon: "\u21AA", label: t("redo"), shortcut: "Ctrl+Shift+Z", disabled: !engine?.canRedo(), action: () => engine?.redo() },
    { id: "sep3", icon: "|", label: "", shortcut: undefined, disabled: true, action: () => undefined },
    { id: "fit", icon: "\u22A0", label: t("fitToScreen"), shortcut: "Ctrl+0", disabled: !hasDoc, action: () => runtime.canvas?.fitToScreen() },
    { id: "actual", icon: "1:1", label: t("percentage100"), shortcut: "Ctrl+1", disabled: !hasDoc, action: () => runtime.canvas?.zoom100() },
    { id: "beforeafter", icon: "\u21C4", label: t("beforeAfterToggle"), shortcut: "Ctrl+Alt+B", disabled: !hasDoc || view3d, active: compare, action: () => useEditorStore.getState().setCompare(!compare) },
  ];

  return (
    <div className="vs-top-toolbar" role="toolbar" aria-label="Actions">
      {actions.map((a) =>
        a.disabled && !a.label && a.icon === "|" ? (
          <div key={a.id} className="vs-toolbar-sep" role="separator" />
        ) : (
          <button
            key={a.id}
            type="button"
            className={`vs-tool-btn vs-top-tool-btn ${a.active ? "active" : ""}`}
            title={a.shortcut ? `${a.label} (${a.shortcut})` : a.label}
            aria-label={a.label}
            aria-pressed={a.active === true}
            disabled={a.disabled === true}
            onClick={a.action}
          >
            {a.icon}
          </button>
        )
      )}
    </div>
  );
}