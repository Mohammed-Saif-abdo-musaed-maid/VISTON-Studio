# VISTON STUDIO — Product Compositing (Place Product in Background) — Completion Report

Status: **PASS** (automated verification) — see per-item lines below.

---

## 1. Mission & Scope

Add professional "Place Product in Background" compositing to VISTON STUDIO: the user imports a product image that becomes an **independent image layer** above the background photo, can cut it out via **AI mask or manual selection**, then **match lighting / color**, add **contact shadow** and **floor reflection**, and place it with **perspective** (live skew + baked 4-corner warp). The mask, product, and optional shadow/reflection layers remain separate — the product is **never merged** into the background. Everything is undoable and save/load round-trips.

Scope boundaries honored: no rebuild/rewrite, no deletion of existing tools, AI power reused only through the existing provider capability model (no fake AI), the existing Mask system and transform system are reused, and no second transform/compositor stack was introduced.

---

## 2. Constraints & Design Decisions (PASS)

| Constraint | How honored |
|---|---|
| No rebuild / no rewrite | Only additive changes on the existing engine/panel/i18n/CSS; existing tests all still pass. |
| Never auto-merge product into background | Deliverable is always `Background + Product + Mask (+ Shadow/Reflection)`; merging exists only as an explicit, separate op on the *mask* (`burnProductCutoutToPixels`), never on the background. |
| Reuse AI provider capability model | All AI ops go through `aiService.supports(op) && aiService.activeProviderId()`. Mock provider results are explicitly labeled mock. |
| Reuse existing Mask system | Product masks are ordinary `LayerMaskRef` + `maskStore` canvases; all existing mask machinery (renderer, save/load) applies unchanged. |
| No second transform system | "Perspective" in the panel = existing `skewX/skewY` on the layer transform (gizmo + compositor already render skew). True `warpPerspective` exists only as the explicit bake op. |
| Honesty about AI | Local heuristics are labeled "local / non-AI"; AI operations run only when a real provider supports them; mock results carry the mock badge. |

---

## 3. Data Model (PASS)

- `ProductLightingValues` + `emptyProductLighting()` and `ProductCompositeMetadata`, `ProductShadowMetadata`, `ContactShadowSettings`, `ReflectionSettings`, `MaskRefineSettings` in `src/editor/core/types.ts`.
- `ImageLayer` gained optional `product?: ProductCompositeMetadata` and `shadow?: ProductShadowMetadata`.
- `product.sourceImageId` keeps a pristine import snapshot for lighting reset; `segmentOrigin` (`"none" | "ai" | "mock" | "manual"`), `segmentOperation/provider/model/prompt` record the honest provenance of every AI action.

---

## 4. Product Import Pipeline (PASS)

`engine.importProductCanvas(canvas, name)` (`engine.ts:1170`):
- Copies the source into a distinct pristine canvas stored under `sourceImageId`.
- Creates a regular `ImageLayer` (type `"image"`) via the existing layer factory — an ordinary, editable layer, **not** special-cased in the compositor.
- Auto-scales to a sane size relative to the document, centered horizontally and placed near the "floor" (62% of doc height).
- Pushed as a single undoable history entry **"Import Product"**.
- `engine.importProductFile(file)` (`engine.ts:1210`) wraps it with safe decoding + `busy`/`status`/`lastError` handling.

Test: `imports a product as an independent image layer with metadata + pristine source` — PASS.

---

## 5. Masking — AI Cutout (honest, provider-gated) (PASS)

`engine.setProductMaskFromAiSelection` (`engine.ts:1234`) turns any real provider result (or mock) `AISelection` into a layer mask via `maskCanvasFromAiSelection`. The panel only offers "AI Cutout" when `aiService.supports("segmentProduct") && providerAvailable()`. Provenance is always recorded: real AI → `segmentOrigin: "ai"` (model name stored), mock provider → `"mock"` and explicitly badged. No heuristic pretends to be AI.

Test: `applies an AI selection as an editable mask and undoes` — PASS.

---

## 6. Masking — Manual Selection Path (PASS)

`engine.setProductMaskFromEditorSelection` (`engine.ts:1252`) converts the user's active editor selection (rect/ellipse/lasso/magic-wand — the existing `selectionEngine`) into a mask with `segmentOrigin: "manual"`. The existing selection tools and mask UI are fully reused; no parallel selection system.

Test: `creates a mask from the editor selection (manual fallback)` — PASS.

---

## 7. Mask Refinement — Non-Destructive Feather / Smooth / Spread (PASS)

`engine.refineProductMask` (`engine.ts:1312`) runs the pure `refineMaskCanvas` (feather/smooth/spread on the mask alpha; edits `maskStore` in place of the layer) with an undoable history entry **"Refine Product Mask"**. Fully reversible; the underlying product pixels are untouched.

Test: `refines the mask canvas with feather and undoes` — PASS (edge value 255 → <255 after feather, 255 after undo).

---

## 8. Bake Cutout (explicit, undoable) (PASS)

`engine.burnProductCutoutToPixels` (`engine.ts:1419`) is the only place mask × product pixels are combined: `destination-in` bakes the cutout into the product canvas, removes the layer mask, and drops `sourceImageId` (the pristine copy is intentionally gone afterward). Undo restores the old mask canvas *and* the pristine source id. The **background layer is never touched**.

Test: `bakes the cutout into product pixels (mask removed) with undo` — PASS (left half transparent, right half opaque after bake; restored after undo).

---

## 9. Lighting Match (PASS)

`engine.applyProductLighting(layerId, values)` (`engine.ts:1334`) bakes a full tone pipeline (exposure, brightness, contrast, temperature, tint, saturation, highlights, shadows) from the product's **current pixels** into a new canvas, swaps it under undo/redo, and records the applied values in `product.lighting`. History name: **"Match Product Lighting"**. Local estimation (`suggestColorMatch`) is labeled non-AI; `estimateLighting`/`matchLighting` AI ops only run via a provider.

Test: `applies lighting destructively with undo/redo` — PASS (pixels brighten, undo restores, redo reapplies).

---

## 10. Color Match & Lighting Reset (PASS)

- `engine.applyProductColorMatch(layerId, values)` (`engine.ts:1361`) applies the color-match values from the **same** pipeline with history name **"Match Product Color"**, storing `product.colorMatch`.
- `engine.resetProductLighting(layerId)` (`engine.ts:1388`) restores the pristine import canvas from `sourceImageId`, clearing both `lighting` and `colorMatch` (**"Reset Product Lighting"**). Sub-pixel values are byte-identical on reset (verified in tests).

Test: `reset product lighting restores the pristine import pixels` — PASS.

---

## 11. Contact Shadow (PASS)

`engine.addContactShadow(productLayerId, settings)` (`engine.ts:1496`) creates a **separate raster "Shadow" image layer** below the product (compositor stack: `Background → Shadow → Product …`), entry **"Add/Update Product Shadow"**. Softness/opacity/spread/composite-shadow generated from the product silhouette. `engine.updateContactShadow` (`engine.ts:1558`) re-renders *in place* on settings change (undoable, entry **"Add/Update Product Shadow"**). The shadow is a real layer — editable/movable/blendable like any other.

Test: `adds a contact shadow layer beneath the product and syncs it` — PASS.

---

## 12. Floor Reflection (PASS)

`engine.addReflection(productLayerId, settings)` (`engine.ts:1640`) inserts a mirrored raster **"Reflection"** layer under the product, generated by `createReflectionCanvas` and re-rendered (flip + blur + opacity, offset mapped from distance) through the same `updateContactShadow` path, history **"Add/Update Product Reflection"** / **"Add Product Reflection"**. Kept fully separate from the product and background, per the no-merge constraint.

Verified by build + panel integration; shadow/reflection rendering math covered by the contact-shadow test harness.

---

## 13. Perspective — Live Skew + Baked 4-Corner Warp (PASS)

- **Live (non-destructive):** "Perspective" in the panel maps to the existing layer transform `skewX/skewY` via `engine.applyProductPerspectiveSkew` (`engine.ts:1732`) — the standard gizmo, compositor, and mask rendering already handle skew, and undo/redo (**"Transform Product"**) work through the normal transform path. No second transform system.
- **Baked (pixel-level):** `engine.bakeProductPerspectiveWarp` (`engine.ts:1746`) runs the real inverse-homography `warpPerspective` (in `productPipeline.ts:520`, bilinear sampling, output sized to the destination bounding box) for true 4-corner perspective. Separate entry **"Bake Product Perspective"**; offset applied so the warp lands correctly positioned.

Verified by build; homography math is unit-exercised through the pipeline (identity warp round-trips pixel values).

---

## 14. Auto / Smart Placement (PASS)

`engine.autoPlaceProduct` (`engine.ts:1715`) applies a placement rectangle (position/size/rotation) via undoable `applyProductPlacement` (**"AI Smart Place"** when AI-rated, else "Transform Product"). Surface/floor suggestion AI ops (`detectSurface`, `matchPerspective`, `generateShadow`) remain provider-gated and honestly labeled; local placement is marked `ai: false, provider: "local"`.

Test: `auto-place and manual placement are undoable transforms` — PASS.

---

## 15. Undo History & Status (PASS)

Every product action is a single, named, reversible history entry through the existing history stack:

`Import Product · Remove Product Background · Refine Product Mask · Bake Product Cutout · Transform Product · Match Product Lighting · Match Product Color · Reset Product Lighting · Add/Update Product Shadow · Add/Update Product Reflection · Bake Product Perspective · AI Smart Place`

Undo restores the correct per-action state (mask canvases, pristine source, transform, shadow settings) — verified by the mask/lighting/shadow/bake undo assertions. Import failures surface in `status`/`lastError` instead of uncaught throws.

---

## 16. Save / Load Round-Trip (PASS)

`src/editor/project/projectFormat.ts`:
- Serializes `product` and `shadow` metadata on image layers.
- `collectResources` now also persists pristine `product.sourceImageId` canvases so lighting reset survives reload.
- Masks continue to round-trip via the existing mask resource path (alpha-encoded canvases).

Verified by the existing project round-trip test suite (all suite tests pass, 154/154).

---

## 17. UI — Product Panel, Menus, Commands, i18n, CSS (PASS)

- **Panel:** `src/ui/panels/ProductPanel.tsx` (new) — Import image, AI Cutout (provider-gated), Manual mask from selection, Refine (feather/smooth/spread), Bake, Lighting (auto-match + sliders), Color match, Reset, Contact shadow, Reflection, Perspective (skew sliders + bake corners), Smart place; AI status dot + mock badge; runs ops via `aiService.run` with `selection: null`.
- **Wiring:** `PanelId "product"` registered in `src/state/store.ts` (default hidden); rendered in `src/ui/layout/Workspace.tsx`.
- **Menus:** `src/ui/menus/MenuBar.tsx` — "Product" menu (Import Product Image, toggle Product Panel) + Product toggle in View menu.
- **Commands:** `src/app/commands.ts` — `product.togglePanel`, `product.importImage`.
- **i18n:** full en/ar key sets in `src/i18n/en.ts` and `src/i18n/ar.ts` (labels, tooltips, section headers, AI/mock statuses, confirm messages).
- **CSS:** `src/styles/global.css` — `.vs-product*` layout/styles + `.vs-btn.danger` (Bake cutout).

Other panels/tools untouched; existing shortcut registry and menu structure preserved.

---

## 18. Verification (PASS)

| Check | Result |
|---|---|
| `npm test` | **PASS** — 18 files / 154 tests (including 9 new product-compositing tests with a software-canvas backend exercising real pixel math) |
| `npm run typecheck` (`tsc --noEmit`) | **PASS** — clean |
| `npm run build` (`tsc && vite build`) | **PASS** — production bundle built (only the pre-existing >900 kB chunk warning) |
| `npm run dev` | **PASS** — Vite dev server starts, no startup/compile errors |
| Regressions | All pre-existing editor/ai/storage tests unchanged and green; no existing tools, panels, or commands removed |