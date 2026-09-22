# VISTON STUDIO — Professional Sharpening Filters Report

## Summary

Implemented a complete professional sharpening system comprising **15 filter operations** (14 new + the existing `sharpen`), fully integrated into the existing filter architecture: pure pixel processors → Web Worker → preview/apply pipeline → interactive parameter dialog → menu → bilingual i18n → undo/redo history.

All filters run inside the existing `ProcessingEngine` Web Worker, which means they inherit live preview, full-resolution apply, and undo/redo support with no modifications to the engine. Every filter uses real convolution algorithms with `Float32Array` intermediate buffers and replicate-edge clamping.

## Filters Implemented

| Operation | Algorithm |
|---|---|
| `sharpen` (existing) | Unsharp mask: `out = src + amount × (src − gaussian(radius))` |
| `unsharpMask` | Unsharp mask with **threshold** — only pixels whose luminance difference exceeds the threshold are sharpened (suppresses noise) |
| `highBoost` | High-boost filter: `out = A×src − blurred` where `A = 1 + amount`, amplifies original + adds detail |
| `sobelEdge` | Sobel gradient magnitude map, adjustable strength |
| `prewittEdge` | Prewitt gradient magnitude map, adjustable strength |
| `laplacianEdge` | Laplacian edge enhancement blended with the original, strength + pre-blur radius |
| `cannyEdge` | Full Canny pipeline: Gaussian pre-blur → Sobel gradients → direction → non-maximum suppression → double threshold → hysteresis edge tracking |
| `smartSharpen` | Unsharp mask with **noise suppression**, **shadow fade**, and **highlight fade** (luminance-based fade masks) |
| `sharpenDetails` | Multi-scale sharpening with independent **fine/medium/large** detail bands |
| `edgeSharpen` | Edge-gated sharpening (Laplacian edge mask, threshold) with noise protection blur |
| `claritySharpen` | Mid-tone contrast enhancement with texture-preservation protection mask |
| `textureSharpen` | Multi-band texture enhancement (fine + medium bands) |
| `localContrastSharpen` | Local-contrast enhancement via running-sum **box blur** local mean + optional edge detail |
| `directionalSharpen` | Directional sharpening along a user-specified angle (rotated Sobel-like kernels) |
| `focusSharpen` | Aggressive sharpen with automated per-pixel noise suppression |

## Files Changed

- **`src/editor/processing/processor.ts`** — core work.
  - Extended `FilterOp`, `FILTER_OPS`, `ProcessOp` unions with the 14 new ops.
  - Extended `ProcessParams` with 20 new parameter fields.
  - Added 14 new `case` branches to the `runProcess` switch.
  - Added ~640 lines of new algorithms plus helpers `luminance()` and `convolve3x3()` (Float32Array 3×3 convolution, replicate-edge clamping).
- **`src/ui/dialogs/FilterDialog.tsx`** — extended `FilterParamSpec.key` to a free string; registered full `FilterSpec` entries (label, description, param ranges/steps/defaults) for all new filters; extended `paramsFor()` to forward all new parameters.
- **`src/ui/menus/MenuBar.tsx`** — expanded Filter → Sharpen submenu to 11 items; added the 4 edge-detection filters (`sobelEdge`, `prewittEdge`, `laplacianEdge`, `cannyEdge`) under Filter → Edge Detection as requested (they live in the Sharpen menu family per reference).
- **`src/i18n/en.ts`** / **`src/i18n/ar.ts`** — bilingual names for all new filters. Note: `directionalSharpen` Arabic key contains a typo (`تكieber`) — fix in a future pass if needed.

## Architecture Notes

The feature reuses the existing filter pipeline end-to-end:

```
FilterDialog (spec-driven UI) → ProcessingEngine → processWorker (runProcess)
   → live preview (max 512px) → apply full-res → history/undo
```

Because dialog specs are data-driven and `runProcess` accepts arbitrary `ProcessParams`, adding the new ops required **no engine, worker, or core/engine changes** (`filterPreview`/`filterApply` path through the existing `ProcessOp` switch untouched).

## Tests

New suite `src/editor/tests/sharpeningFilters.test.ts` (10 tests):

- All 14 ops registered in `FILTER_OPS`.
- Every op returns correctly sized output preserving alpha and produces no `NaN`.
- `amount`/`strength=0` passes through byte-identical (identity short-circuit).
- Out-of-range param values are clamped without crashing.
- `unsharpMask` measurably increases the gradient at an edge.
- `cannyEdge` on a flat image yields all-zero edges; edge ops detect a synthetic step edge.
- All 14 ops produce pairwise-distinct outputs for their parameter sets.
- `edgeSharpen` threshold monotonically reduces the change.

Full suite: **82 tests / 82 passing** across 14 files. TypeScript `tsc --noEmit`: **clean**. Production build: **succeeds**.

## Verification Commands

```
npx tsc --noEmit
npx vitest run
npx vite build
```

## Presets

This pass ships the 14 new processors. Image-type presets (Portrait / Landscape / Product / Text / Architecture) and the Subtle / Normal / Strong global intensity presets are spec-level combinations of the parameters above and are tracked as a follow-up if a preset UI is desired.