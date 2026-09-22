# VISTON STUDIO — Before/After Comparison Fix Report

## 1. Root cause

The Before/After comparison overlay rendered an empty, dark frame (especially after
importing a 4000×6000 image, editing, and opening the comparison at a low zoom level).

The root cause was a disconnected ref in `src/ui/compare/BeforeAfterViewer.tsx`:

- `containerRef` was declared (`useRef`), and the render loop guarded on it —
  `drawFrame()` returned early when `container` was null, and `fitNow()` returned
  early without ever fitting the camera (`src/ui/compare/BeforeAfterViewer.tsx:55-79`).
- The overlay `<div>` that owns the `.vs-compare-canvas` **never received
  `ref={containerRef}`**, so `containerRef.current` was permanently `null`:
  - `drawFrame()` early-returned → the compare canvas kept its default 300×150
    backing, was never resized or painted, and stayed fully transparent over the
    dark overlay background → "empty / dark" viewport.
  - `fitNow()` early-returned → the camera never fit the document, so zoom/pan and
    all painting were dead.
  - `containerSize()` fell back to `1×1` → divider-handle math collapsed.

This was proven at runtime (headless Chrome + CDP):

- A prototype-patched `getContext` on `.vs-compare-canvas` never fired in the
  original code — `drawFrame` never reached painting.
- Temporary instrumentation showed the render loop running ("drew frame") but
  `drawFrame` exiting at the guard: `canvas true, container false`.
- The compare-canvas backing size stayed at the default `300×150` with empty
  `style`, `getImageData` fully transparent (0 alpha), while the main editor
  canvas rendered the 4000×6000 image correctly.

## 2. Changes

### 2.1 `src/ui/compare/BeforeAfterViewer.tsx` — attach the container ref

Before: the overlay wrapper declared `containerRef` but never bound it.

After: `ref={containerRef}` is now attached to the overlay `<div>` (`BeforeAfterViewer.tsx:274`).

This re-enables the whole render pipeline: canvas backing is sized to the overlay,
the frame is painted each animation frame, and `fitNow()` fits the camera.
All `[BA-*]` debug logging added during investigation was removed.

### 2.2 `src/editor/core/engine.ts` — capture Before after import

Before: the Before reference was captured once when a document was opened. If the
user opened a fresh Untitled document and then imported an image, the stored Before
still reflected the pre-import Untitled state (1280×800), not the imported image.

After: `importImageFile` re-captures the Before reference at the end of the import
(`engine.ts:1172-1173`):

```ts
const activeDoc = this.doc();
if (this._activeKey && activeDoc) this.captureBeforeRef(this._activeKey, activeDoc);
```

So for the reported scenario, Before now correctly shows the freshly imported
4000×6000 image (`getBeforeRefInfo().docW/docH === 4000/6000`), instead of the
1280×800 Untitled document.

## 3. Cross-checked during investigation

The following were verified NOT to be the root cause and were left unchanged:

- The compositor (`src/editor/renderer/compositor.ts`) applies layer transforms
  correctly. `localMatrix(t)` → `t.translateSelf(t.x, t.y)` and
  `compositeToCanvas()` produce `m.e = 3000` for a layer moved +3000px, and the
  raster matches the moved geometry.
- The compare render loop already handled doc-identity and version changes
  (`docChanged || versionChanged`) to refresh the live "After" composite.
- The viewer's guarded early-returns were the only dead paths.

Two earlier harness "failures" were traced to test-side targeting (the harness moved
the *first* image layer, which is the document's hidden background layer sitting
beneath the imported image) and were corrected by targeting the selected/top image
layer. No application defect in edit reflection was found.

## 4. Functional verification (runtime, headless Chrome via CDP)

Dev server on `http://localhost:5173` (Vite). Harness: `ba_verify.mjs` (raw CDP over
WebSocket). Scenario: import 4000×6000 PNG → open comparison (Ctrl+Alt+B) → exercise
modes → move the imported layer +3000px → verify.

Results — 16/16 checks passed, 0 runtime exceptions:

| Check | Result |
| --- | --- |
| Before = imported image dims (4000×6000) | PASS |
| Compare canvas backing sized to viewport (1069×630, style 1069px) | PASS |
| No transparent pixels on compare canvas | PASS |
| Document visible (white circle + dark/checker background) | PASS |
| Split handle present (default Split mode) | PASS |
| Side-by-Side: handle hidden, both halves show image content | PASS |
| Overlay: opacity bar shown ("50%"), handle hidden | PASS |
| Wheel zoom changes rendered content (shared camera) | PASS |
| Pan drag changes rendered content (shared camera) | PASS |
| Move selected layer (+3000px) updates After half (rightDiff 70) | PASS |
| Before half identical after edit (frozen reference) | PASS |
| Close (X) removes overlay; main editor canvas intact | PASS |

Zoom and pan operate on the single comparison camera shared by all three modes, so
the modes stay in sync.

## 5. Mode status

| Mode | Status |
| --- | --- |
| Split View | Working (default; disposable divider handle) |
| Side-by-Side | Working (handle hidden, split at half-width) |
| Overlay | Working (shared camera, opacity slider bar) |

## 6. History / Undo / Redo compatibility

No changes were made to the history subsystem. Layer edits during comparison
continue through the existing `makeLayerCommand` / `pushHistory` paths (same undo/
redo semantics as the editor). The comparison itself is read-only over the document
it renders and does not modify the document or the history stack.

## 7. Performance

- The Before reference is captured once per document/import and reused.
- The After composite is recomputed only when the document identity or engine
  version changes (not per frame); the cached composite is redrawn each animation
  frame.
- A 4000×6000 composite is a large single allocation (~96 MB backing), which is
  inherent to compositing at document resolution; it happens on content change, not
  on every frame. No further changes were made here.

## 8. Validation

- `npm run typecheck` (tsc --noEmit) — PASS
- `npm run build` (tsc + vite build) — PASS (145 modules, ~5s)
- `npm test` (vitest) — 21 files / 178 tests PASS
- CDP runtime harness — 16/16 PASS, no runtime exceptions

## 9. Limitations / notes

- Runtime verification was performed against the Vite development server, not the
  `dist/` production bundle.
- Live "After" updating relies on the engine version being bumped by edits (already
  the case for moves, adjustments, etc.); edits that do not bump the version would
  not trigger a refresh.
- Verified on Google Chrome (headless). Firefox/Safari pixel behavior was not tested.