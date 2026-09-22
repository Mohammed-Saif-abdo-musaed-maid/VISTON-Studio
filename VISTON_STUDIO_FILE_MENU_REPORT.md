# VISTON STUDIO — FILE MENU UPGRADE REPORT

Project: `D:\VISION STUDIO`
Status: Complete — `typecheck`, `test`, and `build` all pass; `dev` confirmed running.

---

## 1. Files Modified

| File | Changes |
|------|---------|
| `src/state/store.ts` | Added `DialogName` values `documentInfo`, `printNotice`, `exitNotice`; extended `PendingDocAction.kind` with `"closeAll"`. |
| `src/editor/core/documentMeta.ts` | Added `savedSize: number \| null` to `DocumentRecord` (used by Document Info). |
| `src/editor/project/projectStorage.ts` | `writeProjectText` gained optional `options?: { rememberHandle?: boolean }`; module `savedHandle` only updated when `rememberHandle !== false`. |
| `src/editor/core/engine.ts` | Added `saveCopyProject()`, `closeAllDocuments()`/`_doCloseAll()`, `exportComposite()`, `placeImageFile()`, `getDocumentInfo()`, `clearRecentDocuments()`; `closeAll` case in `ensureUnsavedConfirmation` and `resolvePendingDocAction`; `_openDoc`/`saveProject` now record `savedSize`; `importImageFile`/`openProject` still add to recent. |
| `src/app/commands.ts` | Registered 21 `file.*` commands in the central registry (see section 4). Legacy commands untouched. |
| `src/i18n/en.ts`, `src/i18n/ar.ts` | Added all File-menu strings in English and Arabic (see section 11). |
| `src/ui/menus/MenuBar.tsx` | Exported `MenuItem` and `buildMenu`; rebuilt the File menu to the spec structure; added `icon` + `title` to items, `FILE_ICON_PATHS` + `FileIcon` component, `sc(id)` shortcut lookup, Open Recent / Import / Export submenus, desktop-aware `Exit()`; full keyboard navigation for submenus in `renderMenuItems`. |
| `src/ui/dialogs/ExportDialog.tsx` | Rewritten as a professional Export As dialog (format / width / height / quality / transparency / filename / location) backed by `engine.exportComposite`. |
| `src/ui/dialogs/DialogHost.tsx` | Registered the new dialog cases. |
| `src/editor/core/documentPresets.ts` | Added missing New Project presets: **A6**, **1920x1080**, **1080x1920**, **1080x1080** (section 3 list is now complete). |
| `src/styles/global.css` | Added `.vs-menu-item-icon` and `.vs-menu-item-label` rules so icons/labels align inside menu items. |

## 2. New Files

| File | Purpose |
|------|---------|
| `src/ui/dialogs/DocumentInfoDialog.tsx` | Read-only Document Info dialog. |
| `src/ui/dialogs/NoticeDialog.tsx` | Honest notice dialogs (handles `printNotice` and `exitNotice`). |
| `src/editor/tests/fileMenuCommands.test.ts` | Command-registry tests for all `file.*` commands. |
| `src/ui/tests/FileMenuRender.test.ts` | `buildMenu` structure/state tests incl. Arabic/English SSR render. |

## 3. File Menu Structure

```
File
├── New Project                    (icon, Ctrl+N)
├── Open...                        (icon, Ctrl+O)
├── Open Recent >                  (icon)
│     ← recent projects from the existing recent system
│     (empty → "No recent files")
│     ────────────
│     Clear Recent
├── Import >                       (icon)
│     Import Image...
│     From Clipboard
│     Place as Layer...
├── ───────────────────────────────
├── Save                           (icon, Ctrl+S)
├── Save As...                     (icon, Ctrl+Shift+S)
├── Save a Copy...
├── ───────────────────────────────
├── Export >                       (icon)
│     PNG
│     JPEG
│     WebP
│     BMP
├── Export As...                   (icon, Ctrl+Shift+E displayed)
├── ───────────────────────────────
├── Close                          (icon, Ctrl+W)
├── Close All
├── ───────────────────────────────
├── Document Info...
├── Print...
├── ───────────────────────────────
├── Preferences
├── ───────────────────────────────
└── Exit                           (disabled in browser; desktop-ready)
```

Each item = **icon + label + shortcut (where it exists) + submenu arrow (where it has a submenu)**, consistent with the existing dark VISTON STUDIO theme.

## 4. Commands (central registry, no business logic in JSX)

Added to `src/app/commands.ts`: `file.new`, `file.open`, `file.openRecent`, `file.import`, `file.importClipboard`, `file.importPlace`, `file.save`, `file.saveAs`, `file.saveCopy`, `file.exportPng`, `file.exportJpeg`, `file.exportWebp`, `file.exportBmp`, `file.exportAs`, `file.close`, `file.closeAll`, `file.documentInfo`, `file.print`, `file.preferences`, `file.recovery`, `file.exit`. All invoke existing engine/store systems.

**Shortcut design:** legacy commands (`newProject`, `openProject`, `save`, `saveAs`, `importImage`) keep their real bindings; the new `file.*` commands carry only `shortcutText` (no `shortcut` field). This preserves the no-duplicate-binding invariants enforced by `importSave.test.ts` and `beforeAfter.test.ts` while the menu shows the correct shortcuts via `findCommand(...).shortcutText`.

## 5. Keyboard Shortcuts

| Action | Shortcut | Registered via |
|--------|----------|----------------|
| New Project | Ctrl+N | existing registry |
| Open | Ctrl+O | existing registry |
| Save | Ctrl+S | existing registry |
| Save As | Ctrl+Shift+S | existing registry |
| Close | Ctrl+W | existing registry (display-only; see limitations) |
| Export As | Ctrl+Shift+E (displayed) | displayed via `shortcutText` only |

No new keyboard listeners were added; the existing `useKeyboardShortcuts` registry drives behavior. Menu-level keyboard navigation (Arrow keys, Enter, Escape, focus, disabled state) handled in `renderMenuItems`.

## 6. Save / Load

- **Save** (Ctrl+S): existing `saveProject`; a document without a saved path falls through to Save As automatically. Never overwrites another file.
- **Save As** (Ctrl+Shift+S): existing picker flow; native VISTON project format stays separate from image export.
- **Save a Copy**: new engine `saveCopyProject` — writes `<name>-copy.viston` via Save As, records the copy in recent, and **does not** change the currently open document handle/path/dirty state (uses `writeProjectText(..., { rememberHandle: false })`).
- `savedSize` recorded on save for Document Info; not re-recorded on Save a Copy.
- Load path (open project) untouched — layers, masks, selections, text, adjustments survive per existing round-trip tests.

## 7. Import

- **Import Image...** — existing `importImageFile`: picks an image (PNG/JPG/WebP/BMP/GIF first frame where supported), creates a new Image Layer, centers it and runs Fit to View; a larger image does not overwrite the canvas.
- **From Clipboard** — existing clipboard-image insertion as a new layer.
- **Place as Layer...** — new `placeImageFile`: inserts the image as a centered layer **without resizing** the document (spec §25).
- PNG/JPG/etc. are never treated as VISTON project files — opening one goes through the image path (with a clear message), while opened VISTON `.viston` files load the full project.

## 8. Export

- **Export > PNG / JPEG / WebP / BMP** — quick exports via new `engine.exportComposite` (default filename from the document name; BMP honored with an honest "not supported by this browser" error where `toBlob` returns null).
- **Export As...** — professional dialog: format (PNG/JPEG/WebP), width, height with aspect lock, quality slider (non-PNG), transparency checkbox (PNG), filename, location ("Browser downloads folder"). Never modifies the document or its canvas dimensions.

## 9. Recent Projects

Uses the existing recent-projects store (`recentProjects`) — unchanged system, re-binds the Open Recent submenu. Updated after Open, Save As, and Save a Copy. Empty list shows a disabled "No recent files" placeholder. **Clear Recent** calls `engine.clearRecentDocuments()`.

## 10. Unsaved Changes

Reuses the existing `UnsavedChangesDialog` ([Save][Don't Save][Cancel]) driven by `ensureUnsavedConfirmation` for **Close**, **Close All**, New-Project-replacing-current-document, and opening another document. For **Close All**, the engine checks every open document and shows a single confirmation for the first dirty document before closing everything (`PendingDocAction.kind === "closeAll"`). Nothing is closed silently.

## 11. Arabic / English (i18n)

All strings live in `en.ts` / `ar.ts` (no hardcoded strings in the menu JSX):

- English: File, New Project, Open, Open Recent, Clear Recent, Import, Import Image, From Clipboard, Place as Layer, Save, Save As, Save a Copy, Export, Export As, PNG/JPEG/WebP/BMP, Close, Close All, Document Info, Print, Preferences, Exit + export dialog labels (Format, Width, Height, Quality, Transparency, Filename, Location, Browser downloads folder) + notice texts.
- Arabic (مطابق للمواصفة): ملف، مشروع جديد، فتح، فتح الأخير، مسح الأخير، استيراد، استيراد صورة، من الحافظة، وضع كطبقة، حفظ، حفظ باسم، حفظ نسخة، تصدير، تصدير باسم، إغلاق، إغلاق الكل، معلومات المستند، طباعة، التفضيلات، خروج + نصوص التصدير والإشعارات.

Top-level menu labels verified in both languages; SSR render test covers both.

## 12. Accessibility

- Full keyboard navigation for top-level menus and submenus: Arrow keys move focus, Enter / Space / ArrowRight open submenus (focusing the first enabled child), ArrowLeft / Escape return focus to the owning item, all items reachable/clickable.
- Disabled items render with `opacity: 0.4`, `pointer-events: none`, and `aria-disabled` — they are skipped by keyboard focus.
- Icon + label + shortcut structure is keyboard- and screen-reader-friendly (semantic buttons/menus, `title` tooltips where needed).

## 13. Tests

- **173 tests, 21 files — all pass.**
- New: `fileMenuCommands.test.ts` (7) — every `file.*` id registered with a runner, `shortcutText` values, no duplicate bindings and no `shortcut` on `file.*`, DOC_BOUND/ALWAYS_ON disabled-state model, Exit disabled in browser, Open Recent gated on recent list.
- New: `FileMenuRender.test.ts` (9) — exact ordered File submenu, shortcut display, icon presence on every File item, disabled-state counts (no doc → Save/Save As/Save a Copy/Export/Export As/Close/Close All/Document Info/Print + count >9; with doc + recents → only Exit disabled), Open Recent contents (incl. Clear Recent + empty placeholder), Import/Export submenu labels, Edit menu completeness, SSR render of top-level menus in English and Arabic.
- Existing tests untouched and green (incl. the shortcut no-duplicate invariants and the full save/open round-trip suites).

## 14. Typecheck

`npm run typecheck` → **PASS** (no errors; `tsc --noEmit`).

## 15. Build

`npm run build` → **PASS** (`tsc --noEmit && vite build`). Only pre-existing warning: main chunk >900 kB (informational; not introduced by this task).

## 16. Runtime Validation

`npm run dev` → Vite starts cleanly ("ready in ~0.8s"); served on http://localhost:5175/ (5173/5174 were already in use). No startup errors.

## 17. Known Limitations

1. **Ctrl+W** is a browser-reserved shortcut and cannot be captured in-page; the registration is harmless, but closing also works via File ▸ Close (the menu shows the shortcut as documented).
2. **Exit** is rendered disabled in the browser with a clear tooltip; the architecture is desktop-ready via `window.__VISTON_DESKTOP__ === true` (no Tauri wrapper is configured in this repo yet — `src-tauri` / `tauri.conf.json` absent), matching the "no fake behavior" requirement.
3. **Print** does not fake printing — it shows an honest notice that printing is unavailable in the current environment. Native print should hook the same command in a wrapped/desktop build.
4. **BMP export** depends on browser `toBlob` support; unsupported browsers receive an explicit error message instead of a silent/blank file.
5. **Import Image** grows the canvas when the imported image is larger (pre-existing documented system behavior, retained to avoid changing existing functionality); use **Place as Layer...** to insert without resizing the document.
6. **Document Info** is read-only (tiers of data: name/size always; created/modified only when the underlying record has them; file size only after a save exists).
7. Note on process: the continuing task referenced an "Edit Menu" implementation, but no Edit Menu spec/task exists in this workspace — the in-progress task was the File Menu upgrade; the Edit menu was verified intact (Undo/Redo/Cut/Copy/Paste/Delete/Fill/Select All/Deselect) and is covered by the new render tests.
8. Build emits the pre-existing >900 kB chunk warning (no code-splitting introduced here).

---

**Final rule respected:** No rewrite, no new app, no deletion of existing tools, no Canvas/Layers/History architecture changes, no duplicate systems, and no Phase 12 / 3D development started. Task complete — stopping.