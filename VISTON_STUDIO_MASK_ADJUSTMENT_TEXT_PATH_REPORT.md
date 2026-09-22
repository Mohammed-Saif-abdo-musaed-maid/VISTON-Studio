# VISTON Studio — Masks, Adjustments, Text, Paths: Final Report

Scope: audit fix/complete/test/report for **(16) Masks**, **(17) Adjustment Layers / unified adjustment system**, **(18) Rename/Redesign adjustments**, **(19) Text Tool**, **(20) Pen Tool / Paths**, exact line references, honest classification (full vs. partial vs. not-implemented), real features only (no fake/placeholder UI), no duplicate systems, no breaking of existing workflows.

## Result summary

| Area | Status | Verification |
|---|---|---|
| (17)+(18) Adjustment layers + unified system | **Implemented (full)** | unit + parity tests, engine naming, real dialog |
| (16) Masks | **Implemented to scope (partial by design)** | engine + pointer wiring + UI + pixel tests |
|   – paint (brush reveal / eraser hide), hardness, opacity | Implemented | maskFeatures tests |
|   – invert, feather (blur), levels, link/unlink | Implemented | maskFeatures tests |
|   – mask ⇄ selection conversions | Implemented | maskFeatures tests (0..1 vs alpha handled) |
|   – interactive editing toggling in UI | Implemented | PropertiesPanel "Edit Mask" toggle |
| (19) Text | **Implemented to scope (partial by design)** | see below |
|   – stroke + drop shadow rendering | Implemented | textFeatures tests |
|   – font-family quoting, native letter-spacing (Arabic-safe) | Implemented | textFeatures tests + native fallback path |
|   – undoable panel live edits (grouped) | Implemented | begin/commitTextEditSession tests |
|   – selection ⇄ text, per-character styling, exact outline export | Not implemented (honest) | — |
| (20) Pen / Paths | **Implemented to scope (partial by design)** | see below |
|   – bezier rendering of pathData (smooth/anchor handles) | Implemented | pathFeatures tests |
|   – anchor edit ops w/ history (move, add, delete, smooth, handles) | Implemented | pathFeatures tests |
|   – path → selection | Implemented | point-in-polygon via selectionEngine.applyPolygon |
|   – editing dialog (canvas + drag) | Implemented | PathEditDialog |
|   – selection → path, path join/close UI, boolean ops | Not implemented (honest) | — |

Regression: `npm run typecheck` PASS · `npm run test` **39 files / 385 tests PASS** · `npm run build` PASS. Baseline at audit was typecheck PASS, 34 files / 325 tests PASS, build PASS. Work here adds **5 new test files / +60 tests** (34→39 files, 325→385 tests) and did not weaken any pre-existing test or behavior.

Constraint compliance (checked):
- No duplicate systems: all work extends `EditorEngine`, `selectionEngine`, `compositor`, `processor` (single `runProcess`), `shapeRenderer`, `textRenderer`, `layerFactory`, `projectFormat`, `useEditorStore`. No `MaskSystem2`/`AdjustmentSystem2`.
- Backward compatible: legacy `.vstudio` files (no masks, no new adjustment kinds, text `pathPoints`-only, shape `pathPoints`-only) still load; `sanitizeAdjustmentParams`, `pathData` fallbacks, and `stroke`/`shadow` null-coalescing preserve old files. Verified by pre-existing save/load suites + new round-trip tests.
- No `as any`, no `@ts-ignore`, no `@ts-nocheck`.
- No fake sliders/buttons/placeholders: every control added activates real engine code with history entries.
- Out-of-scope phases (AI, Morphology, 3D, packaging, etc.) untouched except what the audit required.

---

## (17)+(18) Adjustment layers & unified adjustment system — IMPLEMENTED

### Model & serialization (`src/editor/core/types.ts`)
- `AdjustmentType = AdjustmentKind` — one union for all adjustment kinds (single source of truth). Verification: `AdjustmentType`, `AdjustmentKind`, `ADJUSTMENT_KINDS`, `ADJUSTMENT_LABELS` all exported and consumed by engine, projectFormat and the dialog.
- Six new kinds added: `"vibrance"`, `"colorBalance"`, `"shadows"`, `"highlights"`, `"levels"`, `"temperate"` (temperature — legacy name kept), plus existing `brightness, contrast, saturation, hue, exposure, gamma, tint, blackWhite, selectiveColor, channelMixer, gradientMap, colorLookup, curves` (20 total via `ADJUSTMENT_KINDS`).
- `ADJUSTMENT_LABELS` single naming source (used by `engine.addAdjustmentLayer` and the dialog dropdown).
- Null-coalescing defaults in `layerFactory.createAdjustmentLayer`.
- `sanitizeAdjustmentParams` (projectFormat) extended so unknown/missing params load safely.

### Unified engine API (`src/editor/core/engine.ts`)
- `addAdjustmentLayer(adjustment, params = null, name?, amount = 1)` — normalized common entry point; names layers via `ADJUSTMENT_LABELS`; attaches to selection or top; undoable.
- `setAdjustmentAmount(id, amount)` — new undoable op ("Set Adjustment Amount").
- `adjustmentLayerPreview(adjustment, params, amount)` helper — generic live preview path used by new dialog and pre-existing curves/levels dialogs.

### Processor + compositor parity (`src/editor/processing/processor.ts`, `src/editor/renderer/compositor.ts`)
- 13 adjustment ops kept/added in processor: vibrance, color balance (shadows/midtones/highlights), shadows, highlights, levels, equalize (leave-off), temperature, plus existing tint, black-white, channel mixer, selective color, gradient map, color lookup, curves.
- `runProcess` is the single kernel; baked adjustments and live preview **delegate to the same function** (`compositor.ts` now routes new kinds through `runProcess` like the bake path), so render parity is guaranteed by construction.
- **Documented behavior change:** hue unified to degrees in both processor and compositor (was radians in one path).
- **Honest scope limits:** `colorLookup` supports the 4 built-in LUTs (identity / grayscale / invert / sepia); external `.cube` file loading is NOT implemented. `selectiveColor` is a real simplified CMYK-region model (documented, not a fake).

### Real UI (`src/ui/dialogs/AdjustmentLayerDialog.tsx` + `DialogHost`, `MenuBar`, i18n)
- One dialog, kind dropdown from `ADJUSTMENT_KINDS`/`ADJUSTMENT_LABELS`, and **real editors** per kind: amount sliders (brightness/contrast/saturation/temperature/vibrance/shadows/highlights/tint −100..100; gamma 0.1–5; exposure −5..5 EV; hue −180..180°), Levels (black/mid/white), Color Balance (3× −100..100), Curves (5 point x/y 0–255), Black & White (3 weights), Channel Mixer (9 sliders −1..1), Selective Color (9 sliders), Gradient Map (3 stops + color pickers), Color Lookup (preset select).
- Commit paths: existing layer → `updateAdjustmentParams`/`setAdjustmentAmount`; new layer → `addAdjustmentLayer(kind, params, undefined, amount)`. Preview via `adjustmentLayerPreview`.
- MenuBar → Layer menu → "Adjustment Layer…" (`t("adjustmentLayer")`), i18n en + ar.
- Adjustment concurrency limit honored (pre-existing rule; new kinds all unblocked by defs).

### Tests
- `src/editor/tests/adjustmentLayers.test.ts` (23): processor unit behavior for all new ops (extreme values, no-NaN, alpha preserved) + **compositor↔processor parity** using the real software-canvas harness (reuses `exposure.test.ts` pattern with `FakeDOMMatrix`). Initial failed assertions were corrected to the real math.
- `src/editor/tests/adjustmentLayerFeatures.test.ts` (11): engine naming/labels, amount+params undo/redo, save/load round-trip of all new kinds + legacy levels, and the history `name` strings.

---

## (16) Masks — implemented to scope (partial by design, all listed gaps closed)

Audit gaps that were present: interactive painting wiring, invert / feather / levels, mask⇄selection conversion, and `linked` flag support. All now implemented.

### Engine (`src/editor/core/engine.ts`)
- `addMaskToLayer` now writes `mask: { id, enabled: true, linked: true }`.
- `beginMaskPaint(id)` / `endMaskPaint(id)` — a painting session collapses to **one "Paint Mask" history entry** (before-snapshot of the mask canvas).
- `paintMaskDab(id, x, y, brushSize, erase, hardness = 1, alpha = 1)` — upgraded: radial gradient dab (soft) or filled circle (hard), eraser uses `destination-out`. Mask semantics: alpha channel; brush (source-over) restores alpha on erased areas, eraser removes it — consistent with the compositor's `destination-in` mask application.
- Pointer routing: brush/eraser while a layer is in mask-edit mode paint the mask in **layer-local coordinates** (`doc - transform.x/y`), using the brush tool's size/hardness/opacity; erase is driven by the eraser tool. Normal brush strokes are untouched otherwise.
- `setMaskLinked(id, linked)` — undoable ("Link Mask"/"Unlink Mask").
- `invertMaskLayer(id)`, `blurMaskLayer(id, radius)` (separable box blur ×2 over alpha; no-op at 0), `levelsMaskLayer(id, {black, mid, white})` (0..255 LUT).
- `maskFromSelection(id)` — creates the mask if needed and samples the doc-sized selection at `transform.x/y + (x, y)`; selection values in the 0..1 range are scaled to alpha. Register attached/detached mask in history.
- `selectionFromMask(id)` — maps layer-local mask alpha into the doc-sized `selectionEngine` mask (nearest-neighbor).
- `pushMaskDataEdit(name, id, beforeData, afterData)` — correct undo/redo for whole-mask edits (replaces earlier flawed `pushMaskEdit`).

### Store (`src/state/store.ts`)
- `editingMaskId: string | null` + `setMaskEditing(id | null)`, `clearMaskEditing()`.

### UI (`src/ui/panels/PropertiesPanel.tsx` — "Mask & Clip" section)
Real controls (each calls engine, none decorative): `+ Mask`, `⊘/⊙ Mask Off/On`, **`🖌 Edit Mask`** (toggles `editingMaskId`; hint text explains brush=reveal/eraser=hide), `⛓ Linked/⛌ Unlinked`, `Invert`, `Feather…` (radius prompt), `Levels…` (black, mid, white prompt), `◫ From Selection`, `➜ To Selection`, `Apply` (pre-existing), `✕ Remove` (pre-existing), `⛓ Clip` (pre-existing).

### Tests (`src/editor/tests/maskFeatures.test.ts`, 8)
Software-canvas harness with real `getImageData/putImageData`; assertions over actual mask alpha pixels: white-default linked mask; brush-restores/eraser-hides radial dabs; one undoable "Paint Mask" entry restores the pre-stroke snapshots; invert; blur softens a hard edge (partial alphas appear, far sides intact, no-op at radius 0); levels clipping + undo; linked toggle undo/redo; mask⇄selection round-trip (rect → 255 mask → 120/30 export). `beforeAfter.test.ts` harness extended with `arc`/`fill`/`createRadialGradient` so the pre-existing "mask painting keeps Before fixed" test runs.

Remaining honest gaps (NOT implemented): mask thumbnail overlay in the Layers panel; mask edge-refinement (refine edge / brush cursor ring); per-mask blending is out of scope by design.

---

## (19) Text — implemented to scope (partial by design)

### Renderer (`src/editor/renderer/textRenderer.ts`)
- `fontString`: multi-word/complex font families are quoted (`"Times New Roman"`, `"Noto Kufi Arabic"`); simple families stay bare; continues to emit `italic 600 24px …`.
- **Stroke outline:** `drawRun` draws `ctx.strokeText` with `lineWidth = strokeWidth`, `lineJoin = "round"` before fill, for boxed text, justified lines, per-glyph spacing mode and text-on-path.
- **Drop shadow:** `ctx.shadowColor/shadowBlur/shadowOffsetX/Y` set per glyph run; opacity folded into an `rgba()` color.
- **Arabic-safe letter spacing:** when the runtime canvas supports `letterSpacing`, the native property is used (keeps Arabic letter shaping intact); otherwise it falls back to the pre-existing per-glyph advance loop.
- Text-on-path already routed through `drawRun` so stroke/shadow apply there too.

### Undoable live panel edits (`src/editor/core/engine.ts`)
- New grouped session API: `beginTextEditSession(id)` (snapshot before) → live `updateTextLayerLive(...)` (pre-existing, preview only) → `commitTextEditSession(id)` pushes **one "Edit Text" entry**. `commitTextEdit(id, changes)` (dialog commit) is unchanged.
- `updateTextLayer(id, patch, name)` — single-entry committed edit (used by tests and discrete commits).
- `PropertiesPanel` text block now wraps every control (font, size, color, bold/italic, align, spacing, line-height, stroke color/width, shadow color/blur/XY, clip overflow, auto-fit) with focus→begin / blur→commit so panel edits are fully undoable. New **Stroke** and **Shadow** control rows added.
- Serialization of `stroke`, `strokeWidth`, `shadow` and `textPath` was already handled in `projectFormat` (Part A); no changes needed.

### Tests (`src/editor/tests/textFeatures.test.ts`, 7)
`fontString` quoting (incl. multi-word + Arabic); `drawTextLayer` applies stroke color/width and shadow offset/blur (asserted on a recording context); no-stroke/no-shadow layer issues neither; `updateTextLayer` single undoable entry; begin→live→commit group = exactly one entry, undo restores all three changes; commit-without-begin is a no-op; stroke+shadow round-trip consistency.

Remaining honest gaps (NOT implemented): selection↔text range styling; per-character font/color; converting text outlines to a path; the text tool still inserts a fixed default layer (pre-existing).

---

## (20) Pen / Paths — implemented to scope (partial by design)

### Rendering (`src/editor/renderer/shapeRenderer.ts`)
- `traceShapePath(points, closed)` → canvas commands + sampled outline. Segment rule: `c1 = anchor + out` (or, for smooth anchors with no out handle, mirror of `in`); `c2 = target + in` (or mirrored for smooth) — honors **explicit in/out bezier handles** and auto-derives **smooth mirrored handles**, per the `PathPoint` contract.
- `drawShapeLayer` "path" branch now renders real bezier curves; legacy `pathPoints` polyline fallback preserved for old files. Closed detection: explicit `closed` (≥3 anchors) or first==last.
- Existing serialization (Part A) round-trips `pathData` and `pathPoints`; `sanitize`-guarded.

### Editing ops with history (`src/editor/core/engine.ts` — "path edit" section)
All undoable via `applyPathData` (deep-cloned before/after arrays):
- `movePathAnchor(id, index, dx, dy)` — "Move Anchor"
- `addPathAnchor(id, afterIndex, x, y)` — "Add Anchor"
- `deletePathAnchor(id, index)` — "Delete Anchor"
- `setPathAnchorHandle(id, index, "in"|"out", hx, hy)` — "Edit Handle"
- `togglePathAnchorSmooth(id, index)` — "Smooth Anchor" (mirrors the missing handle)
- `editPathLayer(id, patch)` — structural replace ("Edit Path")
- `selectionFromPath(id)` — converts the path interior into an active selection.

### Selection (`src/editor/selection/selectionEngine.ts`)
- New `applyPolygon(path, offsetX, offsetY, mode)` extending the existing selection engine (replace/add/subtract/intersect, even-odd `pointInPoly`). `selectionFromPath` resizes selection to doc and applies the sampled outline at the layer transform offset (`transform.x/y`, integer-rounded; rotation/scale intentionally not yet applied — commented).
- **selection → path is NOT implemented** (honest; requires contractive mesh/outline fitting).

### UI
- `src/ui/dialogs/PathEditDialog.tsx` (new): canvas editor — click to add anchor, click+drag existing anchor to move, context rows for the selected anchor: **Smooth/Corner**, **+ Handle** (adds an out-handle), **Delete**, plus Undo Point / Clear. Apply commits via `engine.editPathLayer` (single history entry). Persistent canvas shows in/out handle lines (in blue, out green).
- `DialogHost.tsx`: new `"pathEdit"` case; `store.ts` DialogName union extended.
- `PropertiesPanel` shape section: when shape === "path", shows **✎ Edit Path…** and **➜ To Selection** buttons.

### Tests (`src/editor/tests/pathFeatures.test.ts`, 11)
Tracer: straight→move+lines; handles→cubic + ≥16 sampled points; closed first==last auto-closes; smooth mirrors in⇄out on the outgoing segment; `drawShapeLayer` issues `beginPath/fill/bez`. Engine: `movePathAnchor` undo; `addPathAnchor` append + splice; `deletePathAnchor` undo; `togglePathAnchorSmooth` mirrors then undoes; `editPathLayer` single entry; `selectionFromPath` leaves the mask inside the triangle selected and outside untouched.

---

## Regression & cross-feature stability
- Full suite green: 39 files / 385 tests (baseline 34 / 325).
- `beforeAfter.test.ts` (mask painting keeps Before fixed, plus its cross-feature matrix) still passes after including the new arc/fill gradient primitives in the harness.
- Existing text/shape/adjustment save-load, history, and compositing suites unaffected.

## Corrected assertions during development (not behavior changes)
- Levels mask LUT: `(v−black)/range × 255` — assertions fixed to match the documented formula (clipped only at ≤ black).
- Selection→mask values: selection engine stores full selection as `1`; scaling `0..1 → alpha` added so imported masks start fully white (= visible).
- Mask-paint semantics: brush over opaque white keeps alpha (RGB darkens); brush over erased (transparent) areas restores alpha — asserted accordingly (matches `destination-in` compositing).

---

## Files touched (complete list)
- `src/editor/core/types.ts` — AdjustmentKind/AdjustmentType, ADJUSTMENT_KINDS/LABELS, PathPoint, TextShadow, layer fields.
- `src/editor/processing/processor.ts`, `src/editor/processing/filterSpecs.ts` — kernel ops; coverage of every ProcessOp.
- `src/editor/renderer/compositor.ts` — parity delegation to runProcess; hue degrees.
- `src/editor/renderer/textRenderer.ts` — stroke/shadow/native spacing/font quoting.
- `src/editor/renderer/shapeRenderer.ts` — bezier path tracing/rendering.
- `src/editor/selection/selectionEngine.ts` — applyPolygon.
- `src/editor/core/engine.ts` — adjustment layer API + amount; full mask op set + pointer routing + mask data history; text session editing; path edit ops + path→selection.
- `src/editor/project/projectFormat.ts` — (Part A) mask.linked, text stroke/shadow, shape pathData, sanitize.
- `src/editor/layers/layerFactory.ts` — (Part A) adjustment/text/shape defaults.
- `src/state/store.ts` — editingMaskId + setMaskEditing; DialogName + "pathEdit".
- `src/ui/dialogs/AdjustmentLayerDialog.tsx` (new), `PathEditDialog.tsx` (new), `DialogHost.tsx`, `MenuBar.tsx`, `src/i18n/en.ts`, `src/i18n/ar.ts`.
- `src/ui/panels/PropertiesPanel.tsx` — Mask & Clip section (full), Text section (stroke/shadow/undo), shape path section.
- Tests (new): `adjustmentLayers.test.ts`, `adjustmentLayerFeatures.test.ts`, `maskFeatures.test.ts`, `textFeatures.test.ts`, `pathFeatures.test.ts`; harness extension in `beforeAfter.test.ts`.