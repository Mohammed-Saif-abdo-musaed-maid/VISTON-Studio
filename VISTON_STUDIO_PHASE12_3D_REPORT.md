# Vision Studio — Phase 12: Real WebGL 3D Editing — Report

**Status:** Implemented & integrated · Typecheck ✓ · Production build ✓ · Vitest 52/52 ✓ · Dev + preview runtime sanity ✓
**Renderer:** Three.js (`three` `^0.186.0` + `@types/three` `0.186.0`), WebGL2/WebGL with honest fallback.

---

## 1. What this phase adds

A full **3D workspace** inside the existing 2D editor:

- Real, viewable, interactive WebGL 3D (OrbitControls + TransformControls gizmos).
- Non-destructive 3D scene editing with full undo/redo (scenes are serializable data;
  undo/redo hooks into the existing `engine.pushHistory`).
- 3D content composes **through the existing 2D pipeline**: each 3D layer type
  (`3d-scene`, `3d-object`, `3d-group`) carries an `imageId` whose `pixelStore` canvas
  is rasterized by the 3D runtime, so masks, clips, blend modes, opacity, opacity,
  histogram and AI all work on 3D output exactly as on raster layers.
- Projects save/load/autosave/recover 3D scenes, imported-model resources, and 3D layers
  while staying **backward compatible** with existing `.vstudio` files.

No EXE/APK/installer/distribution/deployment work was started (out of scope for this phase).

---

## 2. Architecture

```
3D data models (pure, serializable):  src/3d/types/types3d.ts (+ labels.ts)
3D scene logic (pure):                src/3d/core/sceneModel3d.ts   (hierarchy, sanitize, presets)
  · geometry builders:                src/3d/core/geometry3d.ts
Live three.js scene graph:            src/3d/core/SceneRuntime.ts
Viewport renderer:                    src/3d/render/renderer3d.ts    (WebGL, OrbitControls, settings)
Offscreen renderer (layers/export):   src/3d/render/renderScene3d.ts
Texture cache + invalidation:         src/3d/textures/textureManager3d.ts
Texture asset resolver:               src/3d/textures/resourceResolver.ts
Model import registry + parsers:      src/3d/loading/importStore3d.ts, src/3d/loading/loaders3d.ts
Scene data ops (store + history):     src/3d/core/sceneDataStore.ts
Per-document scene registry:          src/3d/core/sceneRegistry.ts
```

2D side:

- **Layer integration:** `src/editor/core/types.ts` (3D layer types + guards),
  `src/editor/layers/layerFactory.ts` (creators), `src/editor/renderer/compositor.ts`
  (`drawContent` renders 3D layers like image layers).
- **Persistence:** `src/editor/project/projectFormat.ts` (serialize/parse 3D), 
  `src/editor/core/engine.ts` (document lifecycle, save, autosave, recovery).
- **State:** `src/state/store.ts` (`scenes3D`, `activeSceneId`, `selected3DIds`, `view3d`,
  `PanelId "3d"`, actions).
- **UI:** `src/ui/view3d/Viewport3D.tsx`, `Viewport3DToolbar.tsx`, `fields.tsx`;
  `src/ui/panels/Scene3DPanel.tsx`; `src/ui/dialogs/AddPrimitiveDialog.tsx`,
  `AddLightDialog.tsx`, `Import3DDialog.tsx`; `src/ui/menus/MenuBar.tsx` (3D menu + 3D panel);
  `src/app/commands.ts`, `src/app/useKeyboardShortcuts.ts` (context-aware);
  `src/ui/dialogs/PreferencesDialog.tsx` + `src/editor/project/projectStorage.ts`
  (`EditorPreferences.three3D`); `src/i18n/en.ts`/`ar.ts`; `src/styles/global.css`.

---

## 3. Feature classification

| Feature | Classification |
|---|---|
| Real WebGL 3D rendering + OrbitControls | **IMPLEMENTED** (three.js, WebGL2→WebGL fallback) |
| Transform gizmos (move/rotate/scale, world/local) | **IMPLEMENTED** (api-status documented in `Viewport3D.tsx`) |
| Primitive object creation / edit (`cube…capsule`) | **IMPLEMENTED** |
| Object / light / camera / material inspector | **IMPLEMENTED** |
| Scene tree (objects, groups, lights) + selection sync | **IMPLEMENTED** |
| Import GLB / GLTF / OBJ / STL into scene | **IMPLEMENTED** (parsers: GLB/OBJ/STL synchronous, GLTF)
| Undo/redo for 3D edits + gestures | **IMPLEMENTED** (engine history stack) |
| Render-to-layer / live 3D layer / export PNG | **IMPLEMENTED** (offscreen WebGL; returns none when WebGL unavailable) |
| Per-document scene registry (multi-tab) | **IMPLEMENTED** |
| Project save/load/autosave/autorecovery of 3D | **IMPLEMENTED** (backward compatible) |
| RTL/Arabic + English i18n for all 3D UI | **IMPLEMENTED** |
| 3D preferences (display mode, snap, grid, axes, AA) | **IMPLEMENTED** |
| Hardware-accelerated GPU rendering | **BROWSER-DEPENDENT** (WebGL availability; app shows an honest message) |
| WebGPU renderer | **FUTURE** (browser-dependent; not used by this phase) |
| External 3D file drag-drop (models only) | **IMPLEMENTED** (GLB/GLTF/OBJ/STL) |
| AI × 3D | **INTEGRATED** only as the existing Phase 11 AI surface — AI operates on the rasterized 2D output; no new AI-X-3D features were added (deliberate). |

---

## 4. Integration summary

- **Lifecycle:** opening a tab → `activateDocScenesForKey`; switching tabs → capture +
  activate registry scenes; closing → cleanup; always `ensureDocScenesForKey` paths.
- **Save/autosave:** `json` scenes snapshot + imported resource list embedded in the
  project file; older files load without 3D (undefined-safe) and empty 3D scenes are not serialized.
- **Load/recovery:** `hydrate3DAfterOpen` sanitizes (`sanitizeScene3D`), hydrates imported
  resources, pre-warms geometry.
- **Context-aware shortcuts:** `2D` tool letter-key mapping is skipped while `view3d` is active;
  the viewport owns its own keys (W/E/R/Q/T gizmo, F/A frame…, 2 pan/orbit, Esc, Delete).
- **Dialogs/menus/panels:** 3D menu, `View → Panels → 3D`, panel toggle, add-object/light/import
  dialogs, preferences section — all wired through existing store + i18n.

---

## 5. Tests

New `src/3d/tests/*.test.ts` (node environment, no WebGL required):

- `types.test.ts` – creators, defaults, guards.
- `sceneModel.test.ts` – hierarchy, duplicate remapping, sanitize, camera presets.
- `geometry.test.ts` – primitive geometry + material builder (real three.js math).
- `sceneRegistry.test.ts` – per-document isolation, capture/activate.
- `sceneDataStore.test.ts` – create/scene/add/mutate/duplicate/remove via the real zustand store.
- `projectFormat3d.test.ts` – 3D serialization round-trip + legacy-file compatibility.

**Regression:** full suite `52/52` passing (22 pre-existing AI tests + 30 new 3D tests).
`npm run typecheck` clean; `npm run build` clean (136 modules; production
`dist/assets/index-*.js` served 200 on `vite preview`).

**Bug fixed by tests:** `duplicateObjects` in `sceneModel3d.ts` was nulling out
`parentId` on cloned descendants (remap check ran against the post-remap id). Fixed and covered.

---

## 6. Honest limitations

- All 3D features that need a GPU are **BROWSER-DEPENDENT**; when WebGL is missing the app
  shows "3D WebGL unavailable" and the 2D editor remains fully functional.
- Import parsing is best-effort per format; extremely malformed models may fail to import
  (a clear ✓/✕ is shown per file in the import dialog).
- Render-to-layer / PNG export reuse the same WebGL context path and therefore share the
  WebGL-availability limitation.
- Texture slots map to image layers already present in the document (`imageId`); external
  texture URLs are part of the data model but not yet populated by UI.