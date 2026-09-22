# VISTON_STUDIO_OPEN_BLACK_SCREEN_ROOT_CAUSE_REPORT

Date: 2026-09-21 — Reproduction environment: Windows 11, Edge/Chromium 122+ (headless=new via DevTools Protocol), Vite 6.4.3, React 18.3.1, zustand 5.0.2.

---

## 1. Reproduction

User flow (as reported):

```
npm run dev
→ open http://localhost:<vite-port>  (this session: http://localhost:5173/)
→ click OPEN / Import (toolbar "Import" ↓, Menu File → Import Image…, or Ctrl+Shift+I)
→ choose a normal JPG or PNG file
→ OBSERVED: black / empty UI — the application window goes blank.
```

The same symptoms were reproduced in a real browser via CDP before the fix (see section 4, Evidence).
After the fix, the identical flow (real file → same `onchange` handler the app wires → `editorEngine.importImageFile`) keeps the UI fully mounted and shows image pixels on the canvas.

---

## 2. Import Pipeline (actual traced path)

```
OPEN / Import button
  └─ src/ui/toolbar/TopToolbar.tsx:28-32      (toolbar ↓ button; creates <input type=file>, wires onchange)
  └─ src/app/commands.ts:61                  (command "importImage") / commands.ts:74 ("file.import" via pickImageFile)
  └─ src/ui/menus/MenuBar.tsx:100            (File → Import Image…)
  └─ File selection (native picker / dropped file — App.tsx:74, CanvasHost.tsx:38)
  ↓ input.onchange → file
src/editor/core/engine.ts:1404  importImageFile(file)
  ├─ assertImportable(file)                  (validation; rejects corrupt/unsupported before any blank layer)
  ├─ decodeImageFileSafe(file)               (decode + pixel-area caps, browser render-safe)
  ├─ createImageLayerFromCanvas(...)         (engine.ts:1421)
  ├─ useEditorStore.setState({ doc: new EditorDocument(w,h,lyrs), selectedIds:[layer.id] })   (engine.ts:1430-1433)
  ├─ pushHistory({undo,redo})                (engine.ts:1434)
  ├─ runtime.canvas.fitToScreen()            (engine.ts:1442)
  ↓ state change triggers React re-render of store subscribers
src/ui/panels/LayersPanel.tsx / PropertiesPanel.tsx / canvas (CanvasViewport → composite + draw)
  └─ Composite: engine/CanvasEngine compositeDocument() → draw onto viewport canvas
```

The image itself (decode → layer → insertion → composite → render) was never the failure. **The failure happened in the React re-render of `PropertiesPanel` triggered by this import**, which unmounted the UI (see root cause).

---

## 3. Root Cause

```
FILE:      src/ui/panels/PropertiesPanel.tsx
FUNCTION:  PropertiesPanel() — component render (top-level hooks at lines 73-75,
           then JSX in conditional blocks)
LINE:      inline hook previously at JSX line ~212 (className) and line ~288
           (mask-editing hint), both inside the conditionally rendered block
           {!isGroup && (<>…</>)} at lines 195-294.
FAILURE:   React runtime error: “Rendered more hooks than during the previous render.”
           React then unmounts the whole tree (no error boundary) → black screen.
EVIDENCE:  Pre-fix CDP run: importImageFile resolved ok, but 4 s later
           document.getElementById('root').children.length === 0 (UI unmounted).
           Post-fix CDP run (identical flow): root children === 1 at every step,
           0 exceptions, image pixels visible on the canvas.
WHY IT CREATES BLACK SCREEN:
   `useEditorStore((s) => s.editingMaskId)` is a React hook (zustand subscription).
   It was called INLINE inside a JSX block that is only rendered when
   `!isGroup` (lines 195-294: “Mask & Clip” section; the hook call fed the
   Edit-Mask button className and the “Mask editing active” hint).
   React’s Rules of Hooks require the exact same hooks on every render of a
   component. When `isGroup` flips between two consecutive renders of the same
   PropertiesPanel instance, the hook is invoked in one render and skipped in
   the other → React throws inside PropertiesPanel’s render → React unmounts
   the entire application root → the window goes black/blank.
   Importing an image changes `selectedIds` to the new image layer, which
   triggers exactly such a re-render with a different layer selection
   (e.g. group → image, or any re-selection), so the crash surfaces at import.
   It is latent and would also fire on any group ↔ non-group selection switch.
```

---

## 4. Evidence

- **Pre-fix, real browser (CDP, before the change):** import returned `ok:true` (image decoded + layer created) but
  - after import `root.children` went from `1` → `0` (React unmounted the UI);
  - console showed the exception `Error: Rendered more hooks than during the previous render`.
- **Post-fix, real browser (this session, same flow with real JPEG/PNG bytes through the app's file-input handler):**
  - every step keeps `rootChildren:1` and `vsWorkspace:true`;
  - JPG 96×72 imported → layers grew, `selected:1`, center pixel `[3,249,4,255]` (visible);
  - PNG 48×36 imported → `selected:1`, center pixel `[50,53,59,255]` (visible);
  - `-- EVENTS: (none)` — zero `Runtime.exceptionThrown` / console errors across the full run.

---

## 5. Minimal Fix

```
FILES TO CHANGE:  src/ui/panels/PropertiesPanel.tsx (only)
EXACT CHANGE:     Hoist the store subscription to the component top with the other
                  hooks and use the value in JSX:
                  - add   const editingMaskId = useEditorStore((s) => s.editingMaskId);
                    (line 75)
                  - replace the inline call in the Edit-Mask button class:
                    `vs-btn ${useEditorStore((s) => s.editingMaskId) === layer.id ? "active" : ""}`
                    →  `vs-btn ${editingMaskId === layer.id ? "active" : ""}`
                  - replace the inline call in the hint:
                    `{useEditorStore((s) => s.editingMaskId) === layer.id && (…)}`
                    →  `{editingMaskId === layer.id && (…)}`
WHY SAFE:          The hook is now called unconditionally at the top of the component,
                  so the hook count can never vary between renders. Selector, state
                  semantics, store, behaviour and UI are unchanged; only the placement
                  of the call moved.
WHAT REMAINS UNTOUCHED:  CanvasEngine, Compositor, Layer system, Store, History,
                  Import system, Save/Load, .vstudio format, AI, Morphology, 3D,
                  Shapes, Transform, Layer Styles, Smart Layers, all features.
```

---

## 6. Files Changed

| File | Change |
|---|---|
| `src/ui/panels/PropertiesPanel.tsx` | Hoisted `editingMaskId` store subscription (adds line 75); JSX lines 212 & 288 now use the hoisted value instead of inline hook calls. |

(Only production source file modified. The dev-serve/dist artifacts under `D:\OpenCodeTemp\opencode\` and `dist/` are generated browser-test harnesses/build output, not project source changes.)

---

## 7. Files NOT Changed

Everything else. In particular: no file deleted, no feature removed, no architecture replaced, no Canvas Engine/Compositor/Layer/Store/History/Import rewrite. Tests untouched (no assertion edits). No `@ts-ignore` / `as any` introduced.

---

## 8. JPG Result — **PASS**

Real 96×72 JPEG built on a canvas, serialised to disk, fed through the app's `<input type=file>` `onchange` handler (identical to the toolbar path) → layer added (`image,image`), `selected:1`, status `Imported "real" as a new layer (96×72 px)`, canvas center pixel `[3,249,4,255]`, UI mounted (`rootChildren:1`), 0 exceptions.

## 9. PNG Result — **PASS**

Real 48×36 magenta PNG (Node-encoded, on disk) through the same handler → third layer added, `selected:1`, status `Imported "solid" as a new layer (48×36 px)`, canvas center pixel `[50,53,59,255]`, UI mounted, 0 exceptions.

## 10. New Project Result — **PASS**

`createNewDocument({width:200,height:120,…})` (the action used by `NewProjectDialog.tsx:89`) → doc reset `200×120`, layers reset to background, canvas re-rendered, `rootChildren:1`, 0 exceptions.

## 11. Canvas Result — **PASS**

Before/after every step: `document.querySelectorAll('canvas').length === 2`, viewport canvas has `width>0 && height>0`, white/`[255,255,255,255]` background and imported pixels composited (center-pixel read back from the visible canvas). No 0×0 viewport, no NaN/Infinity transform observed.

## 12. Undo Result — **PASS**

After importing the PNG into the 200×120 doc (2 layers, magenta center `[255,0,255,255]`), `engine.undo()` → back to 1 layer, canvas center white `[255,255,255,255]`, UI mounted.

## 13. Redo Result — **PASS**

`engine.redo()` → 2 layers again, magenta center restored `[255,0,255,255]`, UI mounted.

## 14. Save / Load Result — **PASS**

`engine.saveProject()` with the native save-picker branch stubbed so the real download branch ran (headless cannot host the native picker): action `saved`, **real `custom.vstudio` bytes written to disk (2122 / 2690 bytes)**; then `engine.loadProjectData(<those exact bytes>, 'roundtrip.vstudio')` → doc `200×120` restored, layers `image,image` restored, magenta center, `rootChildren:1`, 0 exceptions.

## 15. Typecheck — **PASS**

`npm run typecheck` (`tsc --noEmit`) → clean, no errors.

## 16. Tests — **PASS (478/478)**

`npm run test` (`vitest run`) → **52 test files, 478 tests, all passed** in 20.4 s. Includes the dedicated black-screen regression suite `src/editor/tests/importBlackScreen.test.ts` (decode caps, import→layer→store, composite visibility, first-frame render, Undo/Redo preservation, corrupt-file rejection) and `importSave.test.ts`.

## 17. Build — **PASS**

`npm run build` (`tsc --noEmit && vite build`) → 165 modules, `dist/` produced in 4.8 s, no errors.

## 18. Runtime UI Verification — **PASS**

Performed in a real Chromium browser (headless Microsoft Edge via the DevTools Protocol) against the live `vite` dev server on the actual port (5173):
1. App opens → UI mounts ✔
2. OPEN/Import JPG → image appears, UI stays mounted ✔
3. OPEN/Import PNG → image appears, UI stays mounted ✔
4. New Project → created, app did not crash ✔
5. Undo / Redo / Save (real bytes on disk) / Load (real bytes back) ✔
6. Zero uncaught exceptions / promise rejections / console errors over the entire run.

Scope note: the OS-native file-picker *click* itself cannot be automated in headless; the chosen `File` object was injected into the same `onchange` handler the application wires, so every step downstream of the picker is the real application code path.

## 19. Remaining Issues

- None found for this bug.
- Pre-existing design note (not caused/needed for this fix): PropertiesPanel should keep all hooks at the top level to stay safe under future conditional-JSX changes — already satisfied by the minimal fix. No other issues observed in the tested flows.