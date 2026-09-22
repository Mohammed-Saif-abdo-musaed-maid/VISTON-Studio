# VISTON STUDIO — Split View Two-Image Fix Report

## 1. Root cause

Split View rendered a single full-frame image and "revealed/cropped" it at the
divider, so only one complete image was ever visible at a time: the part under the
*left* side of the divider showed the BEFORE, the part under the *right* side showed
the AFTER, and **neither image was complete or centered in a pane**.

## 2. Changes

### 2.1 `src/editor/compare/compareModel.ts` — two complete panes in Split mode

- Added `splitPaneFraction(splitValue)` = `clamp01(min(splitValue, 100 - splitValue) / 100)`
  — the smaller side's share, floor-clamped so a pane can never collapse to zero.
- `compareFitForMode` gained a 7th optional parameter `splitValue = 50`. In Split
  mode the fit target width is `viewW * splitPaneFraction(splitValue)`, so the
  **narrower pane** is guaranteed to contain its whole image at any divider position.
- `drawCompareFrame` Split branch now renders **two complete panes**, exactly like
  Side-by-Side does at the split point:
  - left pane: clip `rect(0, 0, splitX, viewH)`, draws the full BEFORE with `leftCam`;
  - right pane: clip `rect(splitX, 0, viewW - splitX, viewH)`, draws the full AFTER with `rightCam`;
  - per-pane checkerboard for the pane background (both panes identical color);
  - a 2px divider column is drawn purely as a separator line (no document content is
    driven by it).
- The two pane cameras derive from the shared fit camera so zoom/pan stay
  synchronized:
  - `leftCam = { x: cam.x + (splitX - fitW) / 2, y: cam.y, zoom }`
  - `rightCam = { x: cam.x + (viewW + splitX - fitW) / 2, y: cam.y, zoom }`
  - At 50/50 these reduce to the Side-by-Side camera offsets, matching the
    existing SBS behavior exactly.
- `drawCheckerDocSpace` now lives in the non-split (single-frame) branch where it
  belongs; the Overlay branch indentation was corrected (it previously fell through
  into the split branch's block).

### 2.2 `src/ui/compare/BeforeAfterViewer.tsx` — split-aware fit + live handle

- Added `splitPctRef`, mirrored from `splitValue` every render (so gesture clamping
  always matches the live value).
- `fitNow()` passes `splitPctRef.current` into `compareFitForMode(...)`, and
  `effectiveViewWidth("split")` returns `viewW * splitPaneFraction(splitPctRef.current)`
  so pan/zoom clamps match the pane the gestures operate in.
- Dragging the divider updates `splitPctRef.current` directly and calls `fitNow()`
  on every move → the panes refit live while dragging (same for Arrow/Home/End
  keyboard on the handle).
- **Fixed the divider-handle placement:** `handlePx` was computed only during the
  React render, when the container has no layout yet (`getBoundingClientRect().width`
  was `1`), so the knob sat at `left: 0.5px` forever. The handle (`handleRef`) is now
  repositioned every animation frame inside `drawFrame()`, keeping the knob exactly
  on the painted divider (also during drags and refits).

### 2.3 `src/editor/tests/beforeAfter.test.ts` — expectations for the new behavior

- The old split-fit test (split image fit to the full viewport width) was replaced
  by the new pane-fit behavior.
- Split frame now paints 3 clip groups (outer clip + left pane + right pane) instead
  of 2.
- New tests: fits to the narrower pane regardless of divider skew (split 30 → fit
  width 300, split 80 → 200); both panes center their full image (BEFORE translate at
  `cam.x`, AFTER at `cam.x + 400` at 50/50); each image stays inside its own pane
  when the divider is skewed (split 30 → splitX 240, fit 240, image within).
- Side-by-Side narrow-case comment/expectation clarified (unchanged behavior).

## 3. Cross-checked during investigation (left unchanged)

- Side-by-Side and Overlay rendering and their tests — unchanged, still green.
- The engine's Before-reference capture: verified byte-identical canvas
  (`getBeforeRefInfo().canvas`) before and after a layer edit (same hash
  `2487759480`, same dimensions & sampled pixels) — the freeze is content-accurate.
- The camera math (`splitPaneFraction`, pane offsets) matches runtime pixels exactly
  (measured image bounds vs model prediction, see §4).
- Sub-pixel resample jitter: after an edit the engine refits a couple frames later,
  which can shift resampled gradient pixels by ±1 in one channel (sub-pixel).
  The Before canvas itself is unchanged; this is imperceptible and outside the
  "frozen content" criterion.

## 4. Functional verification (runtime, headless Chrome via CDP)

Dev server on `http://localhost:5173` (Vite). Harness: `sa_splitverify.mjs` (raw CDP
over WebSocket, `--force-device-scale-factor=1`, 1400×900). Scenario: import 4000×6000
gradient + white circle PNG → open comparison (Ctrl+Alt+B) → fit → verify panes →
move the layer +3000px → drag divider to 30% → wheel zoom → fit → SBS/Overlay regressions.

Results — **40/40 checks passed, 0 runtime exceptions**:

| Check | Result |
| --- | --- |
| Before captured at 4000×6000 (frozen ref) | PASS |
| Split canvas fills viewport (1069×630) | PASS |
| SPLIT 50/50: BEFORE pane contains full image (top/bottom margins) | PASS |
| SPLIT 50/50: AFTER pane contains full image (top/bottom margins) | PASS |
| SPLIT 50/50: BEFORE contained in pane (no crop at edge/divider) | PASS |
| SPLIT 50/50: AFTER contained in pane (no crop at edge/divider) | PASS |
| SPLIT 50/50: aspect preserved ~1.5 (356×534 both panes) | PASS |
| SPLIT 50/50: panes share one camera (identical image size) | PASS |
| SPLIT 50/50: full vertical extent red top / blue bottom, both panes | PASS |
| SPLIT 50/50: white center circle visible in BOTH panes | PASS |
| Handle knob sits on the painted divider with no interaction | PASS |
| Edit (move +3000): AFTER pane changes | PASS |
| Edit: BEFORE pane unchanged (frozen reference, ±2/channel tolerance) | PASS |
| Divider drag to 30% (splitX 321) | PASS |
| SPLIT 30/70: both panes contain full image, contained, aspect, sync | PASS |
| SPLIT 30/70: red top / blue bottom, circle in both panes | PASS |
| Wheel zoom scales both panes equally (~×1.08 each) | PASS |
| Zoomed panes still share camera size | PASS |
| Fit returns to contained two-pane fit (checked again at 30/70) | PASS |
| Regression SBS: handle hidden, both halves complete, aspect 1.5 | PASS |
| Regression Overlay: opacity bar shown, handle hidden | PASS |
| Close (X): overlay removed, main editor canvas intact | PASS |

Instrumented pixel evidence at 30/70: L image x[48,272] y[146,483] (225×338),
R image x[582,806] y[146,483] (225×338), divider column x[320,321] exactly at the
handle, both images aspect 1.5 — i.e., two COMPLETE images in two panes.

## 5. Mode status

| Mode | Status |
| --- | --- |
| Split View | Fixed — two complete fitted/centered images, live refit while dragging the divider |
| Side-by-Side | Working (unchanged) |
| Overlay | Working (unchanged) |

## 6. History / Undo / Redo compatibility

No changes to the history subsystem. Edits made while the comparison is open continue
through the existing command/history paths; the comparison is read-only over the
document it renders.

## 7. Performance

- Pane drawing reuses the existing clip/drawImage path (no new surfaces); the left
  and right panes redraw the same two cached references each frame.
- The Before reference remains cached; the After composite is only recomputed on
  document/version change, not per frame.
- The per-frame handle style write is a single inline `left` assignment (no layout
  thrash on the small handle node).

## 8. Validation

- `npm run typecheck` (tsc --noEmit) — PASS
- `npm run build` (tsc + vite build) — PASS (only the pre-existing >900 kB chunk
  warning)
- `npm test` (vitest) — 21 files / **181 tests PASS**
- CDP runtime harness — **40/40 PASS**, no runtime exceptions

## 9. Limitations / notes

- Runtime verification was performed against the Vite development server, not the
  `dist/` production bundle.
- The divider remains a purely visual separator: it does not clip document content
  (both panes always show their complete image; the checkerboard fills any leftover
  pane space).
- Verified on Google Chrome (headless). Firefox/Safari pixel behavior was not tested.