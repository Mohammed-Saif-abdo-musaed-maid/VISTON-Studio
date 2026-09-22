# VISTON Studio — Phases 26–30 Report
## Color Management · Export · Import · Artboards · Guides/Rulers/Grid/Snapping

Date: 2026-09-21
Scope: audit + safe implementation of Phases 26, 27, 28, 29, 30 only. No other phase was modified.

Verification at completion:
- `npm run typecheck` → PASS (0 errors)
- `npm run test` → PASS (48 files, 451 tests)
- `npm run build` → PASS (`tsc --noEmit && vite build`)

Legend: **VERIFIED WORKING** · **PRESENT BUT BROKEN (fixed)** · **PARTIALLY IMPLEMENTED** · **MISSING** · **NOT SUPPORTED BY CURRENT ARCHITECTURE** · **NOT SAFE TO IMPLEMENT NOW** · **UNKNOWN**

---

## Phase 26 — Color Management

| Capability | Status | Notes |
|---|---|---|
| sRGB document profile | VERIFIED WORKING | `DocumentMeta.colorProfile`, default `"sRGB"`. Now normalized on load. |
| Profile normalization / validation | VERIFIED WORKING | `normalizeColorSpace()` in `src/editor/core/colorSpace.ts`; malformed values fall back to sRGB. |
| Profile capability descriptor | VERIFIED WORKING | `colorManagementCapabilities` reports honestly: only sRGB supported. |
| Display-P3 / Adobe RGB | NOT SUPPORTED | No ICC engine and no browser ICC transform used; a `"display-p3"` string would be cosmetic only, so it is not offered. |
| ICC profile embedding (read/write) | NOT SUPPORTED | Would require a color-management library. |
| 16-bit / 32-bit-float editing | NOT SUPPORTED | Pipeline is 8-bit RGBA (`Uint8ClampedArray`). Float32 buffers exist only internally for layer-style blur, not as a document depth. |
| Linear working space | NOT SUPPORTED | No linear-light pipeline. |
| Color conversion on import/export | NOT SUPPORTED | No conversion is performed; sRGB→sRGB leaves pixels untouched (verified by test). No double-conversion introduced. |

New module: `src/editor/core/colorSpace.ts` (`ColorSpaceId`, `COLOR_SPACES`, `DEFAULT_COLOR_SPACE`, `normalizeColorSpace`, `colorSpaceInfo`, `colorSpaceLabel`, `isColorSpaceSupported`, `BitDepth`, `SUPPORTED_BIT_DEPTHS=[8]`, `DEFAULT_BIT_DEPTH`, `isBitDepthSupported`, `colorManagementCapabilities`).
Wiring: `projectFormat.ts` `validateProjectMeta` now applies `normalizeColorSpace(raw.colorProfile)`.
Tests: `src/editor/tests/colorManagement.test.ts` (5).

---

## Phase 27 — Export

| Capability | Status | Notes |
|---|---|---|
| PNG / JPEG / WebP export | VERIFIED WORKING | Existing encoders, via `encodeCanvasToBlob`. |
| BMP export | PRESENT BUT BROKEN → fixed | The old path called `toBlob(..., "image/bmp")` and silently fell back to PNG bytes. Replaced with a genuine BMP writer. |
| Export Selected | VERIFIED WORKING | `exportSelection()`: crop to selection bounds + apply selection mask (`destination-in`). Errors honestly if no selection. |
| Export Layer | VERIFIED WORKING | `exportLayer()`: `renderLayerToCanvas` + opacity, cropped to layer bounds. Adjustment/group layers refuse with a clear message (no fake output). Blend mode is intentionally not faked without a backdrop. |
| Export Artboard | VERIFIED WORKING | `exportArtboard()`: crop composite to artboard bounds, paint artboard background behind. |
| Resize / quality / transparency options | VERIFIED WORKING | `deliverExport()` resizes, flattens when alpha unsupported, encodes, downloads. |
| Format registry + honest failures | VERIFIED WORKING | `src/editor/export/exportFormats.ts`; unsupported encoders throw instead of writing mislabelled bytes. |
| TIFF / SVG / PDF export | NOT SUPPORTED | No encoders; not offered. |
| DPI metadata in output | NOT SUPPORTED | Not written into PNG/JPEG metadata. |
| Multi-asset / batch export | MISSING | Single output per action. |

New modules: `src/editor/export/bmpEncoder.ts` (real `BITMAPV4HEADER` 108-byte header, 32-bit BGRA, `BI_BITFIELDS`, RGBA masks, `LCS_SRGB`, bottom-up rows), `src/editor/export/exportFormats.ts`.
Wiring: `engine.ts` `exportComposite` refactor + `exportSelection` / `exportLayer` / `exportArtboard` / `layerExportBounds` / `deliverExport`; `ExportDialog` scope + BMP; File menu items; commands `file.exportSelected/Layer/Artboard`.
Tests: `src/editor/tests/exportFormats.test.ts` (7) — includes real BMP header/BGRA/bottom-up/flatten and a no-PNG-signature assertion.

---

## Phase 28 — Import

| Capability | Status | Notes |
|---|---|---|
| PNG / JPEG / WebP / GIF / BMP import | VERIFIED WORKING | Browser `<img>` decoder (`decodeImageFileSafe`); GIF imports the first frame; oversized sources are safely downscaled. |
| SVG import | PARTIALLY IMPLEMENTED | Rasterized by the browser `<img>` path at intrinsic size; becomes a raster layer (not editable vectors). |
| JPEG EXIF orientation | VERIFIED WORKING | Applied by the browser decoder. |
| TIFF import | NOT SUPPORTED | No TIFF decoder in this build; now rejected with a clear message instead of a silent failure. |
| PSD import | NOT IMPLEMENTED | Out of scope (would require a PSD parser). |
| Format capability descriptor + accept lists | VERIFIED WORKING | `src/editor/import/importFormats.ts` drives `accept` for the menu, command, and toolbar import inputs. |

Wiring: `assertImportable()` guards `openImageFile` / `importImageFile` / `placeImageFile`; `importAcceptString()` used in `commands.ts`, `MenuBar.tsx`, `TopToolbar.tsx`.
Tests: `src/editor/tests/importFormats.test.ts` (4).

---

## Phase 29 — Artboards

| Capability | Status | Notes |
|---|---|---|
| Artboard data model | VERIFIED WORKING | `src/editor/core/artboards.ts` (`Artboard`, rect normalize/clamp, `artboardContains`, `findArtboardAt`, `artboardBounds`). |
| Artboard is a document entity (not a drawn rectangle) | VERIFIED WORKING | Stored as a sidecar `DocumentExtras` on `DocumentRecord.extras`, mirrored in the store, persisted in the project file. |
| Create / rename / move / resize / delete | VERIFIED WORKING | Engine methods with single-entry history (`addArtboard`, `updateArtboard`, `removeArtboard`); create/edit dialog (`ArtboardDialog`). |
| Active artboard selection | VERIFIED WORKING | `activeArtboardId` in store, set on create; rename/delete/export act on it. |
| Canvas rendering | VERIFIED WORKING | Outlines + labels + background fill drawn in `canvasEngine` as **overlays** (never part of export pixels). |
| Artboard background in export | VERIFIED WORKING | Painted behind the composite in `exportArtboard` only. |
| Save / load persistence | VERIFIED WORKING | `ProjectFile.artboards`, round-trip tested. |
| Auto-layout / multi-artboard toolsets / per-artboard layers | MISSING | Artboards are regions over one shared layer stack (documented limitation). |

Wiring: `documentMeta.ts` (`extras?`), `projectFormat.ts` (`artboards`), `store.ts`, `engine.ts` (`captureExtras`/`applyExtras`, `_openDoc`, `switchToDocument`, save/load), `MenuBar` artboard submenu, `DialogHost`/`GridArtboardDialogs`.
Tests: `src/editor/tests/artboards.test.ts` (10).

---

## Phase 30 — Guides / Rulers / Grid / Snapping

| Capability | Status | Notes |
|---|---|---|
| Rulers | VERIFIED WORKING | Pre-existing. |
| Guides create/drag/delete | PARTIALLY IMPLEMENTED → improved | Drag bug fixed (a move no longer cancelled the drag after the first event). |
| Guide persistence | PRESENT BUT BROKEN → fixed | Guides were not saved/loaded. Now persisted via `DocumentExtras` (`guides` in the project file). |
| Guide history | MISSING → implemented | Ruler create/drag, menu create, delete, and clear are each ONE history entry via `pushHistory` closures. |
| Grid visual | PARTIALLY IMPLEMENTED → improved | Now uses persisted `GridSettings` (spacing / subdivisions / colour) with an adaptive legibility fallback. |
| Grid settings persistence | MISSING → implemented | `ProjectFile.grid`; `GridSettingsDialog`. |
| Centralized snapping resolver | MISSING → implemented | `src/editor/snap/snapEngine.ts`: `snapPoint`, `snapMove`, `nearestSnap`, `collectSnapCandidates` for grid / guides / layers / center / edges / artboards. No per-tool `abs(x-target)<5` logic. |
| Move-tool snapping integration | PARTIALLY IMPLEMENTED → implemented | `handlePointerMove` "move" now calls `snapMove` through `snapSettings()` / `snapContext()`; overlay `SnapLine[]` drawn and cleared on pointerup. |
| Snap overlays excluded from export | VERIFIED WORKING | Drawn only in `canvasEngine`, never in the export pipeline. |
| Snapping during resize/rotate | MISSING | Only the move tool snaps today. |
| Snapping defaults (backward compat) | VERIFIED WORKING | All snap flags default `false`; old projects and old move behavior are unchanged. |

New module: `src/editor/snap/snapEngine.ts`, `src/editor/core/gridSettings.ts`, `src/editor/core/documentExtras.ts`.
Wiring: `engine.ts` (`snapSettings`, `snapContext`, `snapLines`, guide/artboard history methods), `canvasEngine.ts` (grid settings, artboard + snap overlays, guide drag history), `store.ts`, `projectFormat.ts`, `MenuBar` (Snapping / Guides / Artboards submenus, Grid Settings).
Tests: `src/editor/tests/snapEngine.test.ts` (9), `src/editor/tests/guidesArtboards.test.ts` (7).

---

## Hard-Rule Compliance

- **No fake outputs**: BMP is a real encoder; unsupported formats throw; artboards are real entities; snapping is a centralized resolver. No PNG bytes relabelled as another format.
- **No type escapes**: no `as any`, `@ts-ignore`, or `@ts-nocheck` were introduced.
- **History rule**: pointer-drag guide/artboard/layer operations commit exactly one history entry; export records no history.
- **Save/Load rule**: Document State (artboards, guides, grid settings) is persisted; transient overlays (snap lines) are not.
- **Backward compatibility**: old `.vstudio` files open with defaults (sRGB, no artboards/guides, grid off, snapping off).
- **Scope guardrails**: no changes to AI/3D/Morphology/Brush/Selection/Mask/Adjustment/Text/Pen/Shapes/Transform/Layer-Styles/Smart-Objects/Packaging/backend/framework/serialization core.

## Known Limitations (honest)
- No ICC / P3 / 16-bit / linear color pipeline.
- No TIFF, SVG (as vectors), PDF, or PSD import/export.
- No DPI metadata, no batch/multi-asset export.
- Artboards share a single layer stack; no per-artboard layout engine.
- Snapping is move-tool only (no resize/rotate snapping yet).
