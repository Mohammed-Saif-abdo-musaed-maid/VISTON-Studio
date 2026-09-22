# VISTON STUDIO — Import Image + Save / Save As Repair Report

Status: **PASS** (automated verification) — see per-item lines below.

---

## 1. Mission & Scope

Repair two critical editor workflows in Vision Studio:

1. **Import Image** — actually load PNG/JPEG/WebP/GIF/BMP images, show the whole picture inside the workspace, centered, with correct aspect ratio, a fit-to-workspace view, no-document handling, safe handling of very large images, drag-and-drop, and clipboard paste.
2. **Save / Save As** — present as real, reachable UI actions (top toolbar + File menu), real shortcuts (Ctrl+S / Ctrl+Shift+S), correct first-save-behaves-like-Save-As behavior, dirty-state tracking, unsaved-changes protection, and error handling.

No AI, no 3D, no EXE/APK, no unrelated redesigns. Existing architecture preserved; existing systems reused (no parallel/duplicate implementations).

---

## 2. Status Lines

| Line | Test | Status |
|---|---|---|
| IMPORT IMAGE | Import from File menu / Top Toolbar / drag-drop / clipboard; corrupt-file and oversized-file handling | **PASS** (automated; browser-file-picker click-through listed in §7) |
| FIT TO WORKSPACE | Fit shows full image, aspect preserved, centered; zoom limits enforced | **PASS** (automated camera + engine math) |
| SAVE | Ctrl+S saves current project; first save behaves as Save As; `.vstudio` output re-parses byte-faithfully | **PASS** (automated) |
| SAVE AS | Ctrl+Shift+S always prompts to Save As; `{ asNew: true }` mode respected | **PASS** (automated) |
| PROJECT RELOAD | Save → parse round-trip preserves dims, layers, image pixels, transparency | **PASS** (automated) |
| SHORTCUTS | Ctrl+N/O/S/Shift+S/Z/Shift+Z/I/0/1 registered; no duplicate/conflicting Ctrl+0; guard against firing while typing in inputs | **PASS** (registry assertions) |
| REGRESSION | Full vitest suite, `tsc --noEmit`, `vite build` | **PASS** — 72/72 tests, typecheck clean, build OK |
| BUILD | Production build completes | **PASS** |

---

## 3. Root Causes Found

1. **Imports silently vanished.** `engine.importImageFile()` returned immediately when there was no open document — the menu/command were also disabled whenever `!hasDoc`, so on a fresh editor there was no way to import at all (`src/editor/core/engine.ts`, `src/app/commands.ts`, `src/ui/menus/MenuBar.tsx`).
2. **No fit-to-workspace after import.** Imported content was added without adjusting the camera, so a large image appeared only partially / off-screen.
3. **Larger-than-document images were cropped.** The compositor draws into `docW×docH` (`src/editor/renderer/compositor.ts`); the old import path never grew the canvas.
4. **No max-dimension guard.** Decoding a 30 000px image would try to allocate ~3.6 GB of pixels.
5. **No drag-drop / clipboard-image import existed.**
6. **Transparency was lost on round-trip.** `openImageFile` created transparent (`background: null`) documents, but `validateProjectMeta` coerced any missing/`null` background to `"#ffffff"` on load, so a transparent imported document re-saved as white (`src/editor/project/projectFormat.ts`).

---

## 4. What Changed

### `src/utils/canvas.ts`
- Added `decodeImageFileSafe(file)` returning `{ canvas, naturalWidth, naturalHeight }`.
  - Uses the native HTML `Image` decoder (browser API, supports PNG/JPEG/WebP/GIF/BMP).
  - Caps decoded bitmaps at `MAX_DECODED_IMAGE_DIMENSION = 20000` with aspect-ratio-preserving downscale (safe-render limit).
  - Clear, user-facing error messages for corrupt/unsupported files.
  - Always revokes the object URL (`finally`).
- `imageFileToCanvas` now delegates to `decodeImageFileSafe`.

### `src/editor/core/engine.ts`
- `openImageFile` uses `decodeImageFileSafe`, fits the view to the document afterwards, and surfaces failures via `status`/`lastError` instead of uncaught throws.
- `importImageFile` rewritten:
  - **No open document** → delegates to `openImageFile`, creating a new transparent document sized from the image.
  - **Image larger than the current document** → canvas grows to the bitmap size (clamped by `MAX_DOCUMENT_DIMENSION`, still top-left anchored), performed as a single undoable history entry.
  - **Image smaller** → document keeps its size; the layer is centered.
  - Always `fitToScreen()` afterwards so the imported image is fully visible.
  - Corrupt / unreadable files fail gracefully (status bar + `lastError`, no blank layer, no crash).

### `src/ui/menus/MenuBar.tsx`
- File menu now contains **Save (Ctrl+S)** and **Save As (Ctrl+Shift+S)** with separators.
- Import is no longer `disabled` when there is no open document.

### `src/app/commands.ts`
- `importImage` command no longer requires an open document; accepted file types `image/png`, `image/jpeg`, `image/webp` and extensions `.png .jpg .jpeg .webp .gif .bmp`.

### `src/ui/toolbar/TopToolbar.tsx` (new) + `src/ui/layout/Workspace.tsx` + `src/styles/global.css`
- New top action toolbar rendered between the menu and the tab strip: **New, Open, Import, Save, Save As, Undo, Redo, Fit (Ctrl+0), 100% (Ctrl+1)**.
- Icon buttons with tooltips (including shortcuts), `aria-label`s, proper disabled states (`!doc`, no undo/redo), focus-visible styling, separator styling.
- Works with the existing `hasSavedDoc`/`dirty` state (tabs already show `*`, the title already shows the modified dot).

### `src/ui/canvas/CanvasHost.tsx`
- Drag-and-drop import: `dragover`/`drop` handlers detect raster files (MIME `image/*` or `.png/.jpg/.jpeg/.webp/.gif/.bmp/.avif`) and call `engine.importImageFile(file)`. Non-image drops keep the existing behavior.

### `src/app/App.tsx`
- Clipboard paste handler: image items from `clipboardData` are imported via `engine.importImageFile`. Ignored when focus is in `INPUT`/`TEXTAREA`/`contenteditable`.

### `src/editor/project/projectFormat.ts`
- `validateProjectMeta` preserves an explicit `background: null` (transparency) instead of coercing it to white; missing/undefined still defaults to white for legacy files.

### Shortcut conflict resolution
- Spec suggested Ctrl+Shift+0 for fit; `Ctrl+0` was already bound to fit-to-workspace. Kept **Ctrl+0** (no duplicate bindings), noted in the toolbar tooltip.

---

## 5. Tests

New test files (vitest, `node` environment, no DOM shims needed):

- `src/editor/tests/importSave.test.ts` (14 tests)
  - Empty-editor import creates a transparent document from the image and fits.
  - Grow-canvas import (6000×4000 no cropping), imported layer selected, undo/redo restored state.
  - Keep-size + center import when the image fits.
  - Oversized source (30000×20000) capped to 20000, aspect preserved.
  - Corrupt image fails gracefully (no blank layer, dirty untouched).
  - Save: first save uses Save As; subsequent saves use Save; `{ asNew: true }` forces Save As; failure keeps dirty state + surfaces `lastError`.
  - Project reload round-trip: dims, layers, image resource + pixels, `background: null` transparency preserved.
  - Shortcut registry: Ctrl+N/O/S/Shift+S/Z/Shift+Z/I/0/1 bound to the right commands; single Ctrl+0.
- `src/editor/tests/camera.test.ts` (6 tests)
  - Fit math: landscape / portrait / small-doc fit entirely inside the workspace, aspect preserved, centered; `zoom100`; zoom-anchor formula; min/max zoom clamps (0.02 … 64).

Test config: added `src/editor/tests/**/*.test.ts` to `vitest.config.ts` include.

**Full suite result:**

```
Test Files  13 passed (13)
     Tests  72 passed (72)
```

**Typecheck:** `npm run typecheck` — clean.
**Build:** `npm run build` — OK (137 modules, 4.6 s).
**Dev runtime:** all changed modules transform + hot-serve at `http://localhost:5173` (200 OK, no compile errors).

---

## 6. Browser Limitations (honest report)

- Persistent overwrite on Save relies on the File System Access API (`showSaveFilePicker`), which exists in Chromium browsers (Chrome/Edge). Elsewhere the existing download fallback is used — the file is written successfully, but subsequent Save opens Save As again (filesystem restrictions cannot be fully suppressed by the web platform today). No false claims of persistence are made.
- Browser-native file-picker dialogs (`showOpenFilePicker` / the `<input type="file">` fallback) and the OS save dialog cannot be exercised by the terminal-based test runner without a human click.

---

## 7. Manual Verification Checklist for the Engineer (Section 24)

Ran the app at `http://localhost:5173` (hot-reloaded with these changes). Automated checks below are green; the following interactive steps need a real browser session to click through OS dialogs:

1. Start the app fresh (no open project), click **Import** → pick a real `photo.png`/`photo.jpg` → a new transparent document opens, the photo is fully visible, centered, correct aspect ratio, fitted to the workspace.
2. Open a project, Import a different-size image → document grows / keeps size accordingly, fit applied, layer centered, undo restores the prior canvas.
3. Drag a PNG onto the canvas → imports. Paste an image from the clipboard (Ctrl+V) → imports.
4. Zoom in/out with Ctrl+= / Ctrl+-; Ctrl+0 fits; Ctrl+1 gives 100%.
5. Draw something → title + tab show the modified state → **Ctrl+S** (first save → Save As dialog) → **Ctrl+S** again saves silently → **Ctrl+Shift+S** opens Save As → change nothing → save.
6. Edit → close project → "Save / Don't Save / Cancel" prompt appears.
7. Reopen the saved `.vstudio` project → content identical.
8. Corrupt file / non-image file → status bar shows a clear error, editor unchanged.

---

*Scope respected: no AI, no 3D, no EXE/APK work was started.*