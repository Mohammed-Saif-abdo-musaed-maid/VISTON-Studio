# VISTON Studio — Phases 21–25 Report

**Scope:** Shapes / Vector (21), Transform (22), Layer Styles (23), Blend Modes (24), Smart Layers / Smart Objects (25).

**Objective:** audit the five phases, repair existing bugs, and implement the missing pieces only where it is safe — without breaking Layers, Selection, Masks, Adjustment, Text, Pen/Paths, History/Undo-Redo, Save/Load, or the `.vstudio` format.

**Result:** ✅ Typecheck PASS · ✅ Tests PASS (42 files / 409 tests) · ✅ Production build PASS.

---

## 1. Baseline (before changes)

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | PASS |
| Tests | `npm run test` | PASS — 39 files / 385 tests |
| Build | `npm run build` | PASS — vite 6.4.3, 151 modules |

## 2. Final (after changes)

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | **PASS** |
| Tests | `npm run test` | **PASS — 42 files / 409 tests** (+3 files, +24 tests) |
| Build | `npm run build` | **PASS** — vite 6.4.3, 153 modules |

---

## 3. Phase status matrix

Legend: **VW** = VERIFIED WORKING · **PB** = PRESENT BUT BROKEN · **PI** = PARTIALLY IMPLEMENTED · **MI** = MISSING · **NS** = NOT SUPPORTED BY CURRENT ARCHITECTURE · **NSI** = NOT SAFE TO IMPLEMENT NOW.

### Phase 21 — Shapes / Vector

| Feature | Status before | Action | Status now |
| --- | --- | --- | --- |
| Shape tool + 8 shape kinds (rect, roundedRect, ellipse, line, arrow, polygon, star, path) | VW | — | VW |
| Creation options (fill, stroke, strokeWidth, cornerRadius, points, starRatio) in the tool options bar | VW | — | VW |
| Vector tracing / fill / stroke rendering | VW | — | VW |
| Path editing (anchors + bezier handles) | VW | — | VW |
| Path → selection | VW | — | VW |
| **Post-creation shape geometry editing** (cornerRadius / points / starRatio) | **MI** (only at creation time) | Implemented `Radius`, `Points`, `Ratio` rows in Properties panel, routed through undoable `updateLayerMeta` | **VW** |

### Phase 22 — Transform

| Feature | Status before | Action | Status now |
| --- | --- | --- | --- |
| Move / resize (8 handles, aspect lock, min-size) | VW | — | VW |
| Rotate | VW | — | VW |
| Skew (X / Y) | VW | — | VW |
| Numeric X / Y / W / H / Rotation / SkewX / SkewY | VW | — | VW |
| Layer flip H / V (non-destructive, `scaleX/scaleY` sign) | PI — engine existed, **no main-UI entry** | Added **Flip H** / **Flip V** buttons in Properties transform section | **VW** |
| Document flip H / V | VW | — | VW |
| Perspective / Distort / Warp | **MI** | Not implemented (see §6) | **NSI** |

### Phase 23 — Layer Styles

| Feature | Status before | Action | Status now |
| --- | --- | --- | --- |
| Any non-destructive layer style model | **MI** | Added `LayerStyles` model + optional `styles` field on `BaseLayer` | **VW** |
| Drop Shadow / Inner Shadow | **MI** | Implemented (offset, blur, colour, opacity) | **VW** |
| Outer Glow / Inner Glow | **MI** | Implemented (blur, spread, colour, opacity) | **VW** |
| Stroke (inside / center / outside) | **MI** | Implemented (colour, size, position, opacity) | **VW** |
| Color Overlay | **MI** | Implemented (colour, opacity) | **VW** |
| Gradient Overlay (linear / radial, angle, stops) | **MI** | Implemented | **VW** |
| Bevel & Emboss | **MI** | Implemented (size, angle, depth, highlight/shadow colours) | **VW** |
| Undo / Redo for styles | **MI** | `updateLayerMeta` with coalescing + `"Layer Styles"` history entry | **VW** |
| Save / Load round-trip (incl. disabled effects) | **MI** | Full serialise + tolerant sanitiser; backward compatible | **VW** |
| Styles on Groups / Adjustment layers | n/a | Intentionally not shown (no raster box) | VW |

### Phase 24 — Blend Modes

| Feature | Status before | Action | Status now |
| --- | --- | --- | --- |
| Compositor support for all 16 modes | VW | — | VW |
| **UI list exposes only 12 modes** (missing hue, saturation, color, luminosity) | **PB** | Expanded `BLEND_MODES` to all 16 | **VW** |
| Layer blend via `updateLayerMeta` (undoable) | VW | — | VW |

### Phase 25 — Smart Layers / Smart Objects

| Feature | Status before | Action | Status now |
| --- | --- | --- | --- |
| Smart Object model (embedded sub-document, reopen/commit, serialise) | **MI** | Not implemented (see §6) | **NSI** |

---

## 4. Bugs fixed

1. **Blend-mode UI gap (Phase 24, PRESENT BUT BROKEN):** the compositor implemented all 16 modes but the Properties blend dropdown listed only 12 — `hue`, `saturation`, `color`, and `luminosity` were unreachable from the UI. Fixed by extending `BLEND_MODES`.
2. **Shape geometry not editable after creation (Phase 21, MISSING):** `cornerRadius`, `points`, and `starRatio` were only applied at creation. Added kind-gated rows that persist through the existing undoable meta path.
3. **Layer flip not exposed (Phase 22, PARTIALLY IMPLEMENTED):** `engine.flipLayer` existed but was only reachable for product layers. Added per-layer Flip H/V to the Properties transform section.
4. **No Layer Styles at all (Phase 23, MISSING):** added the complete non-destructive pipeline (model → renderer → compositor → serialisation → history → UI).

---

## 5. Layer Styles design (non-destructive by construction)

- **Model** (`src/editor/core/types.ts`): `LayerStyles` with eight optional slots; `emptyLayerStyles()`, `hasAnyStyle()`, `cloneLayerStyles()`, `defaultLayerStyle()`. The field is optional on `BaseLayer`, so old projects load unchanged and no schema bump was required.
- **Renderer** (`src/editor/renderer/styleRenderer.ts`): deterministic per-pixel raster (separable box blur on `Float32` coverage maps), **no reliance on `ctx.filter`**. Effects are composited onto a padded offscreen canvas; content stays at `(pad, pad)`. `MAX_PADDING = 512`. Pipeline order: drop shadow → outer glow → content → colour overlay → gradient overlay → inner shadow/glow → bevel → stroke.
- **Compositor** (`src/editor/renderer/compositor.ts`): styled layers are routed through `buildLayerSurface()` → padded surface, then placed under the existing layer matrix (`drawSurfaceToStack`) or doc-space (`surfaceToDocSpace`) for clipping. Masks are stretched to the content box at `(pad, pad)`, preserving existing mask semantics. Pixels are never baked.
- **Serialisation** (`src/editor/project/projectFormat.ts`): `serializeLayerStyles()` writes every present effect (including disabled ones); `sanitizeLayerStyles()` is tolerant and clamps values, returning `null` for absent/garbage input.
- **History** (`src/editor/core/engine.ts`): style edits flow through `updateLayerMeta` and coalesce into one `"Layer Styles"` undo entry per interaction.
- **UI** (`src/ui/panels/LayerStylesSection.tsx`): add / enable / disable / remove each effect with typed editors (colours, numbers, opacity sliders, stroke position, gradient type/angle/stops).

---

## 6. Deliberately NOT implemented

- **Perspective / Distort / Warp (Phase 22):** the transform model is an affine `LayerTransform`; true perspective needs a projective matrix through the whole compositor, gizmo, and serialisation path. Implementing it partially would be a fake feature, so it is reported honestly as **NOT SAFE TO IMPLEMENT NOW**.
- **Smart Layers / Smart Objects (Phase 25):** no code exists anywhere. A real implementation requires a new layer type, an embedded sub-document store, reopen/commit workflow, serialisation, and history integration — **NOT SAFE TO IMPLEMENT NOW** within a no-breakage constraint. Classified **MISSING**.

---

## 7. Files changed

**Modified**
- `src/editor/core/types.ts` — Layer Styles model, `styles` on `BaseLayer`.
- `src/editor/core/engine.ts` — `"styles"` → `"Layer Styles"` history entry name.
- `src/editor/renderer/compositor.ts` — styled surface pipeline (`buildLayerSurface`, `drawSurfaceToStack`, `surfaceToDocSpace`, padded `applyMaskTo`), `hasAnyStyle` short-circuit.
- `src/editor/project/projectFormat.ts` — style serialise / sanitise; hooked into `serializeLayerBase` and `applyCommon`.
- `src/ui/panels/PropertiesPanel.tsx` — 16 blend modes, shape geometry rows, Flip H/V buttons, Layer Styles section mount, exported `BLEND_MODES`.

**Added**
- `src/editor/renderer/styleRenderer.ts` — style raster engine.
- `src/ui/panels/LayerStylesSection.tsx` — style editing UI.

**Tests added**
- `src/editor/tests/layerStyles.test.ts` — model/history/serialisation, shape geometry, flip, renderer math.
- `src/editor/tests/layerStylesRaster.test.ts` — software-canvas pixel pipeline (drop shadow, glow, outside stroke).
- `src/ui/tests/PropertiesPanelLayerStyles.test.ts` — 16 blend modes, shape geometry rows, flip buttons, Layer Styles UI.

---

## 8. Notes & limitations

- **Test rendering under node:** the project's UI tests use `renderToString`; zustand v5 supplies `getInitialState()` as React's server snapshot, so the store hook returns initial state during SSR. The new panel test mirrors the live `doc` / `selectedIds` into that snapshot before rendering (the same reason this repo tests `buildMenu()` and `engine` outcomes directly elsewhere).
- **Flip pivot:** `engine.flipLayer` keeps translating the pivot (`x += width`) on each flip — pre-existing behaviour, preserved. Flipping never touches the raster plane (verified).
- **Style rendering cost:** styles only run when `hasAnyStyle` is true; unstyled layers keep the original fast path. Padded surfaces are bounded by `MAX_PADDING = 512`.
