import { describe, it, expect, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MenuBar, buildMenu, type MenuItem } from "../menus/MenuBar";
import { runtime } from "../../editor/core/runtime";
import { useEditorStore } from "../../state/store";

function walk(items: MenuItem[]): MenuItem[] {
  const flat: MenuItem[] = [];
  for (const it of items) {
    flat.push(it);
    if (it.submenu) flat.push(...walk(it.submenu));
  }
  return flat;
}

function flattenFile(): MenuItem[] {
  return walk(buildMenu()[0]![0]!.submenu ?? []);
}

const render = () => renderToString(createElement(MenuBar));

describe("File menu structure (buildMenu)", () => {
  beforeEach(() => {
    runtime.engine = { doc: () => useEditorStore.getState().doc } as unknown as typeof runtime.engine;
    useEditorStore.setState({ doc: null, language: "en", recentProjects: [] });
  });

  it("defines the ordered File submenu required by the spec", () => {
    const top = buildMenu()[0]![0]!.submenu!.filter((m) => !m.separator).map((m) => m.label);
    expect(top.join("|")).toBe(
      "New Project|Open|Open Recent|Import|Save|Save As|Save a Copy…|Export|Export As…|Close|Close All|Document Info…|Print…|Preferences|Exit|Recover Documents"
    );
  });

  it("attaches the standard shortcuts for display", () => {
    const all = flattenFile();
    const at = (label: string) => all.find((m) => m.label === label);
    expect(at("New Project")?.shortcut).toBe("Ctrl+N");
    expect(at("Open")?.shortcut).toBe("Ctrl+O");
    expect(at("Save")?.shortcut).toBe("Ctrl+S");
    expect(at("Save As")?.shortcut).toBe("Ctrl+Shift+S");
    expect(at("Export As…")?.shortcut).toBe("Ctrl+Shift+E");
    expect(at("Close")?.shortcut).toBe("Ctrl+W");
  });

  it("gives every File item a monochrome icon (icon column)", () => {
    const all = flattenFile().filter((m) => !m.separator);
    for (const m of all) {
      expect(m.icon, `${m.label} should have an icon`).toBeTruthy();
    }
  });

  it("disables document-bound items without a document and only Exit when one exists", () => {
    useEditorStore.setState({ doc: null, recentProjects: [] });
    const noDoc = flattenFile().filter((m) => m.disabled === true);
    expect(noDoc.map((m) => m.label)).toEqual(
      expect.arrayContaining(["Save", "Save As", "Save a Copy…", "Export", "Export As…", "Close", "Close All", "Document Info…", "Print…"])
    );
    // no-document case also disables the export submenu items + import clipboard/place + recent placeholder + Exit.
    expect(noDoc.length).toBeGreaterThan(9);

    useEditorStore.setState({ doc: {} as never, recentProjects: [{ name: "Poster", path: "Poster.vstudio", lastOpenedAt: 1 }] });
    const withDoc = flattenFile().filter((m) => m.disabled === true);
    // With a document, only Exit (browser) and Export Artboard (no artboards yet) are disabled.
    expect(withDoc.map((m) => m.label)).toEqual(["Export Artboard…", "Exit"]);
    useEditorStore.setState({ doc: null, recentProjects: [] });
  });

  it("Offers Open Recent with latest documents and a Clear Recent action", () => {
    useEditorStore.setState({
      recentProjects: [
        { name: "Poster", path: "Poster.vstudio", lastOpenedAt: 3 },
        { name: "Sketch", path: "Sketch.vstudio", lastOpenedAt: 1 },
      ],
    });
    const file = buildMenu()[0]![0]!.submenu!;
    const recent = file.find((m) => m.label === "Open Recent")!.submenu ?? [];
    expect(recent.map((m) => m.label)).toContain("Poster");
    expect(recent.map((m) => m.label)).toContain("Sketch");
    expect(recent.map((m) => m.label)).toContain("Clear Recent");
    // empty list shows a disabled placeholder instead
    useEditorStore.setState({ recentProjects: [] });
    const recent2 = buildMenu()[0]![0]!.submenu!.find((m) => m.label === "Open Recent")!.submenu ?? [];
    expect(recent2[0]?.disabled).toBe(true);
    useEditorStore.setState({ recentProjects: [] });
  });

  it("Exposes Import and Export submenus with their items", () => {
    const file = buildMenu()[0]![0]!.submenu!;
    const imp = file.find((m) => m.label === "Import")!.submenu ?? [];
    expect(imp.map((m) => m.label)).toEqual(["Import Image", "From Clipboard", "Place as Layer…"]);
    const exp = file.find((m) => m.label === "Export")!.submenu ?? [];
    expect(exp.map((m) => m.label)).toEqual(["PNG", "JPEG", "WebP", "BMP", "", "Export Selected…", "Export Layer…", "Export Artboard…"]);
  });

  it("keeps the Edit menu complete and wired", () => {
    const edit = buildMenu()[0]![1]!.submenu!.filter((m) => !m.separator).map((m) => m.label);
    expect(edit).toEqual(["Undo", "Redo", "Cut", "Copy", "Paste", "Delete", "Fill", "Select All", "Deselect"]);
    const all = walk(buildMenu()[0]![1]!.submenu ?? []);
    expect(all.find((m) => m.label === "Undo")?.shortcut).toBe("Ctrl+Z");
    expect(all.find((m) => m.label === "Redo")?.shortcut).toBe("Ctrl+Shift+Z");
  });
});

describe("MenuBar render smoke (SSR)", () => {
  beforeEach(() => {
    runtime.engine = { doc: () => null } as unknown as typeof runtime.engine;
    useEditorStore.setState({ doc: null, language: "en", recentProjects: [] });
  });

  it("renders the menubar with all top-level menus in English", () => {
    const html = render();
    expect(html).toContain('role="menubar"');
    for (const label of ["File", "Edit", "Image", "Layer", "Select", "Adjust", "Filter", "View", "AI", "Product", "3D", "Help"]) {
      expect(html, label).toContain(label);
    }
  });

  it("renders the menubar with all top-level menus in Arabic", () => {
    useEditorStore.setState({ language: "ar" });
    const html = render();
    for (const label of ["ملف", "تحرير", "صورة", "طبقة", "تحديد", "مرشح", "عرض", "ذكاء اصطناعي", "مساعدة"]) {
      expect(html, label).toContain(label);
    }
    useEditorStore.setState({ language: "en" });
  });
});