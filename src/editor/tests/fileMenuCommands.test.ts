import { describe, it, expect, beforeEach } from "vitest";
import { COMMANDS, TOOL_SHORTCUTS, findCommand, shortcutTextFor, commandEnabled } from "../../app/commands";
import { runtime } from "../../editor/core/runtime";
import { EditorEngine } from "../../editor/core/engine";
import { useEditorStore } from "../../state/store";

const FILE_IDS = [
  "file.new",
  "file.open",
  "file.openRecent",
  "file.import",
  "file.importClipboard",
  "file.importPlace",
  "file.save",
  "file.saveAs",
  "file.saveCopy",
  "file.exportPng",
  "file.exportJpeg",
  "file.exportWebp",
  "file.exportBmp",
  "file.exportAs",
  "file.close",
  "file.closeAll",
  "file.documentInfo",
  "file.print",
  "file.preferences",
  "file.recovery",
  "file.exit",
];

const DOC_BOUND = [
  "file.save",
  "file.saveAs",
  "file.saveCopy",
  "file.exportPng",
  "file.exportJpeg",
  "file.exportWebp",
  "file.exportBmp",
  "file.exportAs",
  "file.close",
  "file.closeAll",
  "file.documentInfo",
  "file.print",
  "file.importClipboard",
  "file.importPlace",
];

const ALWAYS_ON = ["file.new", "file.open", "file.import", "file.preferences", "file.recovery"];

describe("File menu command registry", () => {
  beforeEach(() => {
    runtime.engine = new EditorEngine();
    useEditorStore.setState({ doc: null, recentProjects: [] });
  });

  it("registers every file.* command id from the spec", () => {
    for (const id of FILE_IDS) {
      expect(findCommand(id), `missing command ${id}`).toBeTruthy();
      expect(typeof findCommand(id)!.run).toBe("function");
    }
  });

  it("advertises the requested shortcuts from the central registry", () => {
    expect(shortcutTextFor("file.new")).toBe("Ctrl+N");
    expect(shortcutTextFor("file.open")).toBe("Ctrl+O");
    expect(shortcutTextFor("file.import")).toBe("Ctrl+Shift+I");
    expect(shortcutTextFor("file.save")).toBe("Ctrl+S");
    expect(shortcutTextFor("file.saveAs")).toBe("Ctrl+Shift+S");
    expect(shortcutTextFor("file.exportAs")).toBe("Ctrl+Shift+E");
    expect(shortcutTextFor("file.close")).toBe("Ctrl+W");
  });

  it("keeps keyboard bindings conflict-free (no duplicate key combinations)", () => {
    const all = [...COMMANDS, ...TOOL_SHORTCUTS].filter((c) => c.shortcut);
    const seen = new Set<string>();
    for (const c of all) {
      const s = c.shortcut!;
      const k = `${s.key}|${!!s.ctrl}|${!!s.shift}|${!!s.alt}`;
      expect(seen.has(k), `duplicate shortcut ${k}`).toBe(false);
      seen.add(k);
    }
    // file.* carry shortcutText only; binding stays on the legacy twin command.
    for (const id of FILE_IDS) {
      expect(findCommand(id)?.shortcut, `${id} should not double-bind`).toBeUndefined();
    }
  });

  it("gates document-dependent commands while always-available commands stay enabled", () => {
    useEditorStore.setState({ doc: null });
    for (const id of DOC_BOUND) {
      expect(commandEnabled(id), `${id} should be disabled without a document`).toBe(false);
    }
    for (const id of ALWAYS_ON) {
      expect(commandEnabled(id), `${id} should be always enabled`).toBe(true);
    }
  });

  it("enables document-bound commands once a document exists", () => {
    useEditorStore.setState({ doc: {} as never });
    for (const id of ["file.save", "file.saveAs", "file.saveCopy", "file.exportAs", "file.close", "file.closeAll", "file.documentInfo", "file.print"]) {
      expect(commandEnabled(id), `${id} should be enabled with a document`).toBe(true);
    }
    useEditorStore.setState({ doc: null });
  });

  it("disables Exit in the browser environment (no fake close)", () => {
    if (typeof window !== "undefined") {
      delete (window as unknown as { __VISTON_DESKTOP__?: boolean }).__VISTON_DESKTOP__;
    }
    expect(commandEnabled("file.exit")).toBe(false);
  });

  it("disables Open Recent when the recent list is empty and enables it otherwise", () => {
    useEditorStore.setState({ recentProjects: [] });
    expect(commandEnabled("file.openRecent")).toBe(false);
    useEditorStore.setState({ recentProjects: [{ name: "Poster", path: "Poster.vstudio", lastOpenedAt: 1 }] });
    expect(commandEnabled("file.openRecent")).toBe(true);
    useEditorStore.setState({ recentProjects: [] });
  });
});
