import { useEffect } from "react";
import { useEditorStore } from "../state/store";
import { runtime } from "../editor/core/runtime";
import { selectionEngine } from "../editor/selection/selectionEngine";
import { COMMANDS, TOOL_SHORTCUTS, type ShortcutSpec } from "./commands";

function matches(e: KeyboardEvent, spec: ShortcutSpec): boolean {
  if (key(e).toUpperCase() !== spec.key.toUpperCase()) return false;
  if (spec.ctrl) {
    if (!(e.ctrlKey || e.metaKey)) return false;
    if ((spec.shift ?? false) !== !!e.shiftKey) return false;
    if ((spec.alt ?? false) !== !!e.altKey) return false;
    return true;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  return (spec.shift ?? false) === e.shiftKey;
}

const key = (e: KeyboardEvent) => e.key;

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable=\"true\"], [contenteditable=\"\"]")) return;
      if (useEditorStore.getState().dialog) return;
      if (!runtime.engine) return;

      const view3d = useEditorStore.getState().view3d;

      for (const cmd of COMMANDS) {
        const binds = cmd.shortcut ? [cmd.shortcut, ...(cmd.shortcuts ?? [])] : [];
        let spec: ShortcutSpec | null = null;
        for (const s of binds) {
          if (!matches(e, s)) continue;
          if (view3d && !s.ctrl) continue;
          spec = s;
          break;
        }
        if (!spec) continue;
        if (cmd.enabled && !cmd.enabled()) continue;
        e.preventDefault();
        cmd.run();
        return;
      }

      if (view3d) return;

      if (e.key === "Escape") {
        selectionEngine.clear();
        useEditorStore.setState({ selectedIds: [] });
        runtime.engine.requestRender();
        return;
      }

      for (const cmd of TOOL_SHORTCUTS) {
        const spec = cmd.shortcut!;
        if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) && matches(e, spec)) {
          e.preventDefault();
          cmd.run();
          return;
        }
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
}