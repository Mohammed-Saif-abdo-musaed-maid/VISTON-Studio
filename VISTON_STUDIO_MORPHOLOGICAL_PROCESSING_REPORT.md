# VISTON STUDIO — Morphological Processing Report

## Summary

Implemented a complete **Morphological Processing** system with **15 real operations** (Erosion, Dilation, Opening, Closing, Morphological Gradient, Top Hat, Black Hat, Hit-or-Miss Transform, Boundary Extraction, Fill Holes, Thinning, Thickening, Skeletonization, Connected Components, Morphological Reconstruction), fully integrated into VISTON Studio's existing processing architecture.

Every operation runs inside the existing `ProcessingEngine` Web Worker through the shared `runProcess` → `processWorker` → preview/apply pipeline, so it inherits live preview (512 px max), full-resolution apply, and undo/redo automatically. Because the operations are implemented as **pure pixel processors** in `processor.ts`, they also work on the layer **mask** and the **selection** through a new target-aware engine entry point — the first pipeline feature to operate on all three targets.

## Operations Implemented

| Operation | Algorithm |
|---|---|
| `morphoErosion` | Min-filter over the structuring element; grayscale / binary / per-channel modes |
| `morphoDilation` | Max-filter over the structuring element; grayscale / binary / per-channel modes |
| `morphoOpening` | Erosion → Dilation (removes bright protrusions smaller than the SE) |
| `morphoClosing` | Dilation → Erosion (fills dark gaps smaller than the SE) |
| `morphoGradient` | `Dilation − Erosion` (edge magnitude map) |
| `morphoTopHat` | `Source − Opening` (extracts bright detail removed by opening) |
| `morphoBlackHat` | `Closing − Source` (extracts dark detail added by closing) |
| `morphoHitOrMiss` | Full Hit-or-Miss transform against the SE (hit cells + miss cells); custom-kernel aware |
| `morphoBoundary` | `Foreground ∩ ¬Erosion(foreground)` — one-pixel rim extraction |
| `morphoHoleFill` | Conditional flood-fill of background from the image border |
| `morphoThinning` | Zhang–Suen thinning (2 sub-iterations per cycle), iteration count honored |
| `morphoThickening` | `¬thin(¬foreground)` (topological thickening), iteration count honored |
| `morphoSkeleton` | Zhang–Suen thinning run **until convergence** (iterations ignored) |
| `morphoComponents` | 4-connected component labeling, colorized per component + exportable statistics |
| `morphoReconstruction` | Geodesic dilation of a thresholded marker within the thresholded mask, run **until convergence** (iterations ignored) |

### Input modes (continuous operations)

All 7 continuous ops support **Grayscale** (luminance plane), **Binary** (luminance ≥ threshold → 0/255), or **Per Channel** (each of R, G, B processed independently). The 8 inherent-binary ops always threshold internally.

### Structuring elements

Rectangle, Ellipse, and Cross shapes at odd sizes 1–25 px, or a fully custom **0/1 kernel** typed into the dialog (rows/cols must be odd and identical; the parser accepts spaces, commas, semicolons, or newlines). The custom kernel overrides shape+size for structure-building/continuous ops and *completely* defines the hit/miss pattern for Hit-or-Miss.

### Border handling

Replicate, Constant (0–255 value), or Reflect — applied via an out-of-bounds accessor used by every erode/dilate pass.

## Integration

### Pipeline reuse

```
MenuBar (Filter → Morphological Processing, 15 entries)
  → openDialog({ name: "morphology", payload: { op } })
  → MorphologyDialog (new, spec-driven controls + live canvas preview)
  → engine.morphoPreview / engine.morphoApply
  → ProcessingEngine({ makePreviewCanvas, processCanvas }) → processWorker → runProcess
  → preview (≤512 px, versioned/stale-guarded — no history)
  → apply (full-res) → pushHistory (single entry) → undo/redo → Before/After
```

### Targets

For the first time the feature is target-aware — the dialog lets the user apply to:

- **Active Layer** — delegates to the existing `effectApply` path: respects the selection as an effect mask (`buildEffectMask`), commits one history entry with canvas snapshots, fires `_uiFxApplied`, and re-renders. Before/After stays in sync automatically (the *After* pane is the live composite).
- **Layer Mask** — reads the top editable image layer's mask canvas, converts it to a grayscale plane (values live in the alpha channel), runs the operation with grayscale input, then **writes the result back into the alpha channel only** (the mask's RGB is preserved). The mask id, dimensions, and layer association are unchanged; `maskStore.set` + pushHistory with before/after canvas refs provide full undo/redo.
- **Selection** — builds a grayscale canvas from `selectionEngine.getMask()`, processes it, extracts the red channel back into a fresh `Uint8ClampedArray`, and calls `selectionEngine.setMask(next)` with a snapshot history entry (undo/redo restore the old/new masks). As with the existing magic wand, the live visible bounding box is cleared in favor of the stored pixel mask.

Masks and selections are single-channel by construction, so the mode control is folded to grayscale and the preview/apply force `inputMode: 0` for those targets.

### Connected-components metadata

The worker protocol is fixed (`{id,width,height,data}` / `{error}`) and cannot return side-channel metadata. Instead:

- `analyzeConnectedComponents(fg, w, h)` and `binaryFromLuminanceThreshold(...)` are exported **pure helpers** from `processor.ts`.
- The dialog computes live per-component statistics (count, bounding box, area) from the preview canvas pixels (no repeated `toDataURL` encoding — the preview is drawn directly into a DOM canvas).
- `engine.morphoComponentStats(target)` re-reads the full-resolution document / mask / selection after Apply and surfaces the component count in the status bar, so stats reflect the true document resolution rather than the 512 px preview.

## Files Changed

- **`src/editor/processing/processor.ts`** — core work (~660 net new lines).
  - Added 15 ops to `FilterOp`, `FilterOpDepth`, `ProcessOp`, `FILTER_OPS`; new `MORPHO_OPS` and `MORPHO_BINARY_OPS` exports.
  - Extended `ProcessParams` with `shape`, `size`, `iterations`, `borderMode`, `borderValue`, `inputMode`, `threshold`, `markerThreshold`, `customKernel`.
  - Added the `runMorphology` dispatch + full algorithm section: `SEPoint`/`SEBox`, `oddClamp`, `parseKernelGrid`, `buildSE`/`buildSEBox`, `Plane` (Float32Array) + `bwGet` (border-aware accessor), `planeMorph`/`planeErode`/`planeDilate`, `luminancePlane`, `planeOperation`, `CONTINUOUS_MORPHO_OPS` + `continuousOpKind`, `binaryThreshold`, `binaryErode`, `hitOrMissBinary`, `holeFillBinary`, `zhangSuenPass` + `thinBinary`, `reconstructionBinary`, exports `analyzeConnectedComponents`/`MorphoComponentStats`/`binaryFromLuminanceThreshold`, `colorizeComponents`, `runMorphology`.
- **`src/editor/core/engine.ts`** — new target-aware surface.
  - Exported `MorphoTarget = "layer" | "mask" | "selection"`.
  - `morphoPreview(op, params, target)` — versioned preview (shares the `_previewVersion` guard with filter previews, canned via `cancelFilterPreviews` on dialog close/unmount).
  - `morphoApply(op, params, target, historyName)` — layer delegates to `effectApply`; mask performs the alpha-only rewrite; selection replaces the mask with an undoable snapshot. Busy flag + failure status preserved.
  - `morphoComponentStats(target)` — full-res connected-component stats after apply; private helpers `grayFromValues`, `maskCanvasToGray`, `morphoSourceCanvas`.
- **`src/editor/processing/filterSpecs.ts`** — shared morpho param specs (`morphoShapeParam`, `morphoSizeParam`, `morphoIterationsParam`, `morphoBorderModeParam`, `morphoBorderValueParam`, `morphoInputModeParam`, `morphoThresholdParam`, `morphoMarkerThresholdParam`) + 15 `FilterSpec` entries so the record stays exhaustive.
- **`src/ui/dialogs/MorphologyDialog.tsx`** — new dialog (see below).
- **`src/ui/dialogs/DialogHost.tsx`** / **`src/state/store.ts`** — registered the `"morphology"` dialog.
- **`src/ui/menus/MenuBar.tsx`** — Filter → **Morphological Processing** submenu with 15 entries, each opening the dialog pre-selected to that operation.
- **`src/i18n/en.ts`** / **`src/i18n/ar.ts`** — bilingual keys for all ops, parameters, targets, notes, and stats (labels render through `t()`, falling back to the key). Menu / dialog are fully localized.
- **`src/styles/global.css`** — styles for the target segmented control, custom-kernel textarea, preview holder, live stats box, and wider labels.
- **`src/editor/tests/morphology.test.ts`** — new test suite (see below).

## MorphologyDialog

Spec-driven layout mirroring `FilterDialog` (`.vs-dialog-filter` chrome):

- Operation dropdown (15 ops), **Apply To** segmented control (Active Layer / Layer Mask / Selection; unsupported targets disabled with tooltip), mode select (hidden for mask/selection and for inherent-binary ops), binary threshold slider, marker threshold slider (reconstruction), shape select + size select + custom-kernel textarea (live validation), iterations slider (hidden for skeleton/reconstruction/fill-holes, which converge by construction), border mode/value controls (continuous + boundary), inline binary/convergence notes, live component-stat box for `morphoComponents`, and Reset / Cancel / Apply.
- Preview is drawn directly into a `<canvas>` via `drawImage` (no repeated `toDataURL` encoding), debounced 120 ms, guarded against stale results with a local generation counter.
- History entry name: `"Morphological Processing — <operation>"` (localized prefix + operation name).
- Size options in the dropdown are plain integral labels ("1 px" … "9 px"); custom kernels are free-form text, so both are language-neutral by design.

## Tests

New suite `src/editor/tests/morphology.test.ts` (19 tests):

- Registration: all 15 ops present in `MORPHO_OPS` and `FILTER_OPS`; binary-op set exposed.
- Correctness/stability: every op returns correctly sized, alpha-preserving, NaN-free output with defaults; binary mode is strictly 0/255 (components excluded — it colorizes by design); out-of-range params clamp without crashing; custom kernels are honored and malformed kernels fall back to the default SE.
- Behavior: erosion shrinks foreground while dilation grows it; opening ≤ source while closing ≥ source; gradient is nonzero exactly at the horizontal step edge; boundary extraction returns a 0/255 rim larger than 0 but smaller than the foreground; thinning ≤ source and thickening ≥ source; skeletonization is convergent (identical on re-run); reconstruction is convergent; hole-fill fully fills a ring interior.
- Semantics: opening drops a 1-px protrusion while closing retains it; thinning(1) differs from converged skeleton; hole-fill differs from reconstruction on a ring; top hat, boundary, hit-or-miss, gradient, thickening, and components each measurably change their source.
- Pure helpers: `binaryFromLuminanceThreshold` classifies by luminance; `analyzeConnectedComponents` finds two isolated blobs of the expected area/width and reports zero components on empty input.

## Verification

- `npm run typecheck` (`tsc --noEmit`): **clean**.
- `npm run test` (`vitest run`): **200 passing across 22 files** (full suite green; `morphology.test.ts` is 19 tests, all passing).
- `npm run build` (`tsc --noEmit && vite build`): **succeeds** (pre-existing chunk-size warning only).

```
npx tsc --noEmit
npx vitest run
npm run build
```

## Honest Limitations

- **Skeletonization and Reconstruction ignore the iterations control** (they iterate until convergence — noted in the UI): iterations are meaningful for them only in the sense of an upper cap, which we deliberately do not apply.
- **Thinning/Thickening honor iterations** (1–12); Zhang–Suen is only guaranteed to stabilize for the full run, so a low iteration count may leave the operation partially applied (this is standard behavior, surfaced via the iterations slider).
- **Closing on a hole-free block and Black Hat on a bright-dominant image are legitimately identity transforms** on some inputs — the pairwise-distinct test was intentionally dropped in favor of semantic, image-specific assertions rather than overfitting the code to fake arbitrary differences.
- **Connected Components on a mask/selection** is unusual in practice: the colorized output is read back as the mask value via its luminance (red channel), so the resulting mask is a grayscale interpretation of the false-color result.
- **Hit-or-Miss default SE** treats every cell inside the SE box as a *hit* and nothing as a *miss* (equivalent to erosion); discriminating hit/miss patterns require a custom kernel (`1` hit, `0` miss) — documented in the operation description.
- **Performance**: the naive min/max per-pixel loops are O(pixels × SE-area × iterations) with no integral-image acceleration; a 25×25 SE at max iterations is the expensive case. Documents processed at preview (≤512 px) and full resolution run on the Web Worker so the UI stays responsive, but very large masks with big SEs may take a moment.
- The existing `processWorker`/`ProcessingEngine` were **not modified**; component statistics are returned via the new pure exports rather than the worker protocol.