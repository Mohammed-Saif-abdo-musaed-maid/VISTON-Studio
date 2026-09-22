# Before / After Comparison — Fix Report

## Root cause

The Before/After comparison architecture already existed and the engine-side reference
capture (`getBeforeRef`, `_origRefs`) was correct — the failure was in the viewer's
render pipeline and in the drawing math:

1. **Stale render closure (primary).** `BeforeAfterViewer.tsx` ran its canvas render loop
   in a `useEffect` with deps `[compare, fitNow]`. The `drawFrame` closure read `mode`,
   `splitValue` and `opacity` from the render in which the effect mounted. Clicking
   Side-by-Side / Split / Overlay, dragging the divider, or moving the opacity slider
   re-rendered the DOM controls but never re-ran the effect, so the canvas kept drawing
   with the stale initial `mode="split"`, `splitValue=50`, `opacity=50`. The toolbar and
   BEFORE/AFTER badges were visible, but the actual compared images never reacted to the
   controls — the classic "comparison doesn't render correctly" symptom.
2. **Side-by-side was a cropped window, not two panels.** Fit was computed for the full
   viewport and the Before image was drawn shifted by `-half`; each half then showed a
   slice of the document instead of the full original and full edited image side by side.
3. **Before reference went stale across documents.** `beforeRef.current` was filled only
   when null, so switching documents / opening a new project / importing while the overlay
   stayed open kept the previous document's "Before".
4. **Downscaled Before misaligned.** For documents > 4096px the captured Before was
   downscaled but drawn at its native size, so it no longer covered the document area and
   the crop case could not carry original dimensions.
5. **No device-pixel-ratio scaling.** The overlay canvas backing store was sized in CSS
   pixels (the main canvas uses `devicePixelRatio`), producing a blurry result on HiDPI.
6. **No fallback message** when the Before reference is unavailable.

## Files modified

- `src/editor/compare/compareModel.ts`
- `src/editor/core/engine.ts`
- `src/ui/compare/BeforeAfterViewer.tsx`
- `src/i18n/en.ts`, `src/i18n/ar.ts`
- `src/styles/global.css`
- `src/editor/tests/beforeAfter.test.ts`

## What changed per file

**compareModel.ts**
- `CompareDrawOptions` gains optional `beforeW`/`beforeH` (original document dimensions)
  and `dpr`.
- `drawImageAtDoc` now draws images scaled to the given draw box, so a downscaled Before
  is stretched back to its original document size and stays aligned at the origin with the
  After composite (also correct after a crop).
- `drawCompareFrame` scales its transform by `dpr`, and in **Side-by-Side** mode draws
  Before in the left panel and After in the right panel (After at `camera.x + half`) so
  both full images are visible at the same time.
- New `compareFitForMode(...)`: fits split/overlay to the full viewport and side-by-side to
  a single panel (half the viewport), so "Fit to Screen" shows the complete image in each
  panel.

**engine.ts**
- `_origRefs` now stores `{ canvas, docW, docH }` per document so the original dimensions
  survive downscaling and crops.
- New `getBeforeRefInfo()` / `getBeforeRefInfoForKey()`; existing `getBeforeRef()` /
  `getBeforeRefForKey()` are unchanged in contract (still the canvas, lazily recaptured).
- Keep the PWA architecture: capture happens at document open (`_openDoc`); no history
  entries are created; Before is never mutated by edits, undo/redo, or layer ops.

**BeforeAfterViewer.tsx**
- `drawFrameRef` keeps the rAF loop pinned to the freshest draw closure, so mode changes,
  divider drags, and opacity changes take effect immediately on the canvas.
- `modeRef` + `compareFitForMode` make Fit-to-Screen, pan clamping, and wheel zoom
  mode-aware (half width in side-by-side).
- Before reference (and its original dimensions) is refreshed whenever the document
  changes while the overlay is open.
- Canvas backing store is sized with `devicePixelRatio` (mirrors the main canvas).
- When no Before reference is available, a status message is shown:
  "Before comparison is unavailable for this document." — no crash, no empty preview.

**i18n / CSS / tests**
- New `beforeAfterUnavailable` key in English and Arabic; `.vs-compare-unavailable` style.
- Tests updated for the corrected side-by-side geometry, added coverage for
  `compareFitForMode`, downscaled-Before scaling, and `dpr` rendering.

## Per-mode status

- **Before view** — shows the real original opened-session composite (captured at document
  open, per-document), preserved from edits/undo/redo/crop/flatten. ✅
- **After view** — shows the current composite recomputed from the live document on every
  version change (brush, filters, adjustments, transform, crop, undo/redo, imports). ✅
- **Side by Side** — full original on the left, full edited on the right, same zoom/pan,
  aligned, both visible at once; auto-falls-back to split below 520px viewport width. ✅
- **Split View** — movable divider (pointer + arrow/Home/End keys), same camera, correct
  alignment, Before left of divider / After right. ✅
- **Overlay** — adjustable opacity slider (0–100%); both images aligned. ✅

## Image fit status

- Fit-to-Screen fits the document inside the workspace with 48px padding in every mode,
  auto-centers, and re-fits on container resize and on document/mode changes. ✅
- Pan, wheel zoom-about-pointer, and zoom clamping are consistent across modes (side-by-side
  constraints use the panel width). ✅

## Undo/redo status

- Undo/redo bump `engine.version`, so the After view refreshes on every undo/redo step while
  the Before reference stays fixed to the original state. Covered by existing engine tests. ✅

## Validation

- `npm run typecheck` — ✅ clean
- `npm test` (vitest) — ✅ 178/178 passed (21 files), including 43 Before/After tests
- `npm run build` — ✅ successful (`tsc --noEmit && vite build`, 145 modules; only the
  pre-existing >900 kB chunk-size warning)

## Known limitations

- The Before reference is downscaled to ≤ 4096px on its longest side (memory guard). It is
  scaled back to the original document box when drawn, so alignment is correct, but detail
  beyond 4096px is reduced in the Before view only.
- If the initial Before capture fails (e.g., an image still hydrating), the viewer shows the
  "unavailable" message and retries automatically (throttled to 1s) and on each edit; the
  message disappears as soon as a reference becomes available.
- Comparison runs in a dedicated overlay without the layer/channel selection UI readouts;
  the regular editor canvas remains available underneath when the comparison is closed.
- 3D workspace and EXE/APK packaging were not touched, per scope.