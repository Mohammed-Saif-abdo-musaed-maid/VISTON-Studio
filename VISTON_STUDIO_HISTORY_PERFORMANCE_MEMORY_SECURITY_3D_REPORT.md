# VISTON STUDIO — History, Performance, Memory, Security & 3D Report

**Phases 31–36** · Audit + repair pass
Project: VISTON Studio (`D:\VISION STUDIO`)
Stack: React 18 · TypeScript 5.6 (strict) · Zustand 5 · Vite 6 · Vitest 5 · three.js 0.186
Date: 2026-09-21

---

## 1. Method & Rules Followed

- The existing code was **audited first**; nothing was rebuilt and no new engine/architecture was introduced.
- Every capability is classified as one of: **VERIFIED WORKING / PRESENT BUT BROKEN / PARTIALLY IMPLEMENTED / MISSING / NOT SUPPORTED / NOT SAFE TO IMPLEMENT NOW**.
- `UNKNOWN` was never treated as broken or missing.
- No `as any`, `@ts-ignore`, or `@ts-nocheck` was added. TypeScript strict mode stays on.
- No tests were modified to force a pass. New tests only add coverage for real behavior.
- All before/after size claims are measured from actual `vite build` output.
- Out-of-scope systems (Color, Export, Import, Artboards, Guides, AI redesign, Morphology, 3D features, packaging) were left untouched.

---

## 2. Baseline (captured before changes)

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run test` | PASS — 48 files / 451 tests |
| `npm run build` | PASS — 162 modules |

Baseline bundle:

| Chunk | Raw | Gzip |
|---|---|---|
| `index-*.js` (entry) | 567.37 kB | 153.72 kB |
| `vendor-react-*.js` | 143.56 kB | 46.11 kB |
| `three3d-*.js` | 736.55 kB | 190.58 kB |
| `processWorker-*.js` | 34.08 kB | — |
| `index-*.css` | 31.39 kB | 6.22 kB |

Baseline `dist/index.html` **modulepreloaded `three3d`**, i.e. three.js was fetched on the initial (2D) load even though the 3D workspace was never opened. This was the single largest performance defect found.

---

## 3. Phase 31 — History Development

### Audit result

| Capability | Classification | Notes |
|---|---|---|
| Per-document history manager | **VERIFIED WORKING** | `src/editor/core/history.ts`; engine keeps one `HistoryManager` per document key. |
| Bounded by entry count | **VERIFIED WORKING** | `maxEntries = 200`. |
| Bounded by memory | **VERIFIED WORKING** | `maxBytes = 512 MB`; eviction keeps at least one entry. |
| Redo-branch truncation on new op | **VERIFIED WORKING** | `push()` drops the redo tail. |
| Undo / redo | **VERIFIED WORKING** | Replays real stored `undo`/`redo` closures. |
| Jump to state | **VERIFIED WORKING** | `jumpTo(index)` replays the correct undo/redo sequence. |
| One entry per logical operation | **VERIFIED WORKING** | e.g. 3D gizmo drag commits once via `commitSceneGesture`. |
| Presentation of real operations only | **VERIFIED WORKING** | Names come from the actual command that ran. |
| History panel localization | **PARTIALLY IMPLEMENTED → FIXED** | Labels were hardcoded English; now use `t()`. |
| Persisting history into `.vstudio` | **NOT SUPPORTED (by design)** | History is session-only; this is correct and was left as-is. |

### Changes

- `src/i18n/en.ts`, `src/i18n/ar.ts` — added `noHistory`, `historyJumpHint`, `historyUndoTitle`, `historyRedoTitle` (EN + AR).
- `src/ui/panels/HistoryPanel.tsx` — panel title, empty state, Undo/Redo buttons and tooltips now localized; behavior unchanged (still uses the real `editorEngine`).
- `src/editor/tests/historyManager.test.ts` (new) — 6 tests covering undo/redo order, redo-branch truncation, `jumpTo` replay, `maxEntries` eviction, `maxBytes` eviction, and `reset`.

No second history system was created; the existing `HistoryManager` remains the single source of truth.

---

## 4. Phase 32 — Performance / Code Splitting

### Audit result

| Item | Classification | Notes |
|---|---|---|
| three.js loaded eagerly on 2D startup | **PRESENT BUT BROKEN → FIXED** | `index.html` modulepreloaded `three3d`. |
| Static three imports in the entry graph | **PRESENT BUT BROKEN → FIXED** | Found via `engine.ts → importStore3d → three`, `sceneDataStore → renderScene3d → three`, and `MenuBar/Workspace → Viewport3D → three`. |
| Worker chunk separation | **VERIFIED WORKING** | `processWorker` already a separate chunk. |
| React vendor chunk separation | **VERIFIED WORKING** | `vendor-react` already split. |
| AI / export lazy chunks | **NOT SUPPORTED** | Not attempted; would require broader changes with no clear, measured need at this stage. |

### Root causes found

1. `engine.ts` (always loaded) statically imported `importStore3d`, which value-imported `BufferGeometry` from three **and** statically imported the three-based `loaders3d`.
2. `sceneDataStore.ts` (always loaded via MenuBar / panels / dialogs) statically imported `renderScene3d` (three) and `importStore3d`.
3. `MenuBar.tsx` and `Viewport3DToolbar.tsx` imported `viewport3d` directly from `Viewport3D.tsx` (three).
4. `Workspace.tsx` statically imported `Viewport3D`.

### Changes

- `src/ui/view3d/viewport3dController.ts` (new) — three-free controller interface + accessor; `Viewport3D` registers itself here.
- `src/ui/view3d/Viewport3D.tsx` — registers/unregisters through the controller module instead of exporting a three-coupled singleton.
- `src/ui/view3d/Viewport3DToolbar.tsx`, `src/ui/menus/MenuBar.tsx` — import the controller from the three-free module.
- `src/ui/layout/Workspace.tsx` — `React.lazy` + `Suspense` for `Viewport3D`, `Viewport3DToolbar`, `Viewport3DOptionsBar`.
- `src/3d/render/renderBridge.ts` (new) — indirection so the data store rasterizes without statically importing the renderer; `renderScene3d` registers its implementation on load.
- `src/3d/core/sceneDataStore.ts` — uses the render bridge; honest no-op when the renderer is not loaded.
- `src/3d/loading/importStore3d.ts` — `import type { BufferGeometry }`; model loaders are now a dynamic `import()`; removed the unused value re-export.
- `vite.config.ts` — `manualChunks` now isolates only `node_modules/three` into `three3d` (application 3D data code is three-free and stays in the main graph, so the three chunk is not preloaded).

### Measured result

`dist/index.html` now preloads **only** `index` + `vendor-react` + CSS. `three3d` is fetched lazily, on first entry to the 3D workspace.

| Chunk | Before (raw / gzip) | After (raw / gzip) |
|---|---|---|
| Entry `index` | 567.37 / 153.72 kB | 595.93 / 162.12 kB |
| `vendor-react` | 143.56 / 46.11 kB | 143.56 / 46.11 kB |
| `three3d` | 736.55 / 190.58 kB | 686.31 / 173.97 kB (**deferred**) |
| `Viewport3D` (async) | — | 19.82 / 7.20 kB |
| `Viewport3DToolbar` (async) | — | 4.13 / 1.41 kB |
| `loaders3d` (async) | — | 1.67 / 0.82 kB |

**Initial (preloaded) JS:** 1447.48 kB raw / 390.41 kB gzip → **739.49 kB raw / 208.23 kB gzip**.
That is a **~49% reduction in initial JavaScript** (raw) and **~47% gzip**, with three.js (686 kB) deferred until it is actually used. The entry grew by ~28 kB because the three-free 3D data store moved into it; this is a deliberate trade that removes a 686 kB eager download.

---

## 5. Phase 33 — Memory Management

### Audit result

| Item | Classification | Notes |
|---|---|---|
| Per-document pixel cleanup on close | **VERIFIED WORKING** | `_doClose` deletes unreferenced `pixelStore` images and autosave slots. |
| `_origRefs` (Before/After) cleanup | **VERIFIED WORKING** | Deleted on document close. |
| History snapshots bounded | **VERIFIED WORKING** | 200 entries / 512 MB cap. |
| Object URL revoke | **VERIFIED WORKING** | Every `createObjectURL` site has a matching `revokeObjectURL`. |
| Composite cache document-safety | **PARTIALLY IMPLEMENTED → FIXED** | Cache was guarded by engine version only; now also by active document key. |
| `createImageBitmap` → `close()` | **NOT APPLICABLE** | No `createImageBitmap` usage in the codebase. |
| AI result cache eviction | **PARTIALLY IMPLEMENTED → FIXED** | Was FIFO (insertion order); now true LRU. |
| Processing worker lifecycle | **PARTIALLY IMPLEMENTED → FIXED** | Worker was never terminated; added `dispose()`. |
| rAF loops stopped on unmount | **VERIFIED WORKING** | Canvas, 3D viewport, compare view, dialogs all cancel on cleanup. |

### Changes

- `src/ai/services/AICache.ts` — `get()` now refreshes recency (delete + re-set), making eviction true LRU; `enqueue()` refreshes an existing key instead of duplicating.
- `src/ai/tests/cache.test.ts` (new) — 4 tests proving LRU eviction, re-insert refresh, and `clear`.
- `src/editor/processing/processingEngine.ts` — added `dispose()` that terminates the worker and rejects in-flight tasks.
- `src/app/App.tsx` — `beforeunload` now calls `processingEngine.dispose()`.
- `src/editor/core/engine.ts` — composite cache is invalidated when the active document key changes (`_cachedCompositeKey`).

---

## 6. Phase 34 — Security

### Audit result

| Item | Classification | Notes |
|---|---|---|
| Hardcoded secrets in the frontend | **NOT FOUND** | Full grep for keys/tokens/passwords/credentials returned only test fixtures. |
| API key persistence | **VERIFIED WORKING (safe by design)** | Remote API key is held in memory only and never written to `localStorage`; covered by `src/ai/tests/honestySecurity.test.ts`. |
| Sensitive logging | **VERIFIED WORKING** | No `console.log/debug/info/warn/error` anywhere in `src/`. |
| `VITE_*` env exposure | **NOT APPLICABLE / SAFE** | Only `import.meta.env.BASE_URL` and `import.meta.env.DEV` are used — no secrets. |
| Auth header handling | **VERIFIED WORKING** | `Authorization: Bearer <in-memory key>` only, never logged or persisted. |
| `.env` files | **NOT FOUND** | No `.env*` files present. |

**No security code changes were required.** Any real secret placed in a frontend bundle is not a secret, and the codebase already follows that rule (user-supplied keys kept in memory only).

---

## 7. Phase 35 — Temporary File Cleanup

Root inventory classification:

| Path | Verdict |
|---|---|
| `src/`, `public/`, `index.html`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` | **KEEP** (source/config) |
| `node_modules/` | **KEEP** (dependencies) |
| `dist/` | **GENERATED** (build output; regenerated by `npm run build`) |
| `VISTON_STUDIO_*.md` (23 files) | **KEEP** (prior deliverable reports) |
| Logs / temp files (`*.log`, `*.tmp`, `tmp.txt`, `temp_store.ts`, `store_check.ts`, `vite.log`, …) | **NOT FOUND — nothing to delete** |

No `.git` and no `.gitignore` exist (the folder is not a Git repository), so no `.gitignore` change was made — per the rules it is only updated when Git is used.

**No files were deleted.** There was no temporary garbage to remove.

---

## 8. Phase 36 — 3D Audit & Stability (no feature work)

### Audit result

| Item | Classification | Notes |
|---|---|---|
| 2D startup does not load three.js | **PRESENT BUT BROKEN → FIXED** | Resolved in Phase 32. |
| Scene / geometry / material / texture disposal | **VERIFIED WORKING** | `Viewport3D` cleanup disposes transform, orbit, runtime (scene graph + textures), and renderer. |
| Renderer disposal | **VERIFIED WORKING** | `renderer.dispose()` on unmount. |
| rAF loop cancellation | **VERIFIED WORKING** | Cancelled in `dispose()`. |
| ResizeObserver + pointer listener cleanup | **VERIFIED WORKING** | Disconnected / removed in `dispose()`. |
| 3D Save/Load integrity | **VERIFIED WORKING** | Unchanged; `.vstudio` format untouched. |
| WebGL context-loss handling | **MISSING → FIXED** | Added honest notice + automatic runtime rebuild on restore. |
| 3D feature expansion | **NOT DONE (out of scope)** | No new 3D features were added. |

### Changes

- `src/ui/view3d/Viewport3D.tsx` — added `webglcontextlost` / `webglcontextrestored` handling: rendering stops, an honest localized notice is shown, and the runtime is rebuilt automatically when the context returns (effect re-keys on `glEpoch`). All listeners are removed on cleanup.
- `src/i18n/en.ts`, `src/i18n/ar.ts` — added `vpContextLostTitle`, `vpContextLostBody`.

---

## 9. Verification (after all changes)

| Check | Result |
|---|---|
| `npm run typecheck` | **PASS** |
| `npm run test` | **PASS — 50 files / 461 tests** (baseline 48 / 451; +2 files, +10 tests) |
| `npm run build` | **PASS — 165 modules** |

No regressions. No baseline failure was hidden. No test was altered to pass.

---

## 10. Files Changed / Added

**Added**
- `src/ui/view3d/viewport3dController.ts`
- `src/3d/render/renderBridge.ts`
- `src/editor/tests/historyManager.test.ts`
- `src/ai/tests/cache.test.ts`

**Modified**
- `src/ui/panels/HistoryPanel.tsx`
- `src/i18n/en.ts`, `src/i18n/ar.ts`
- `src/ui/view3d/Viewport3D.tsx`
- `src/ui/view3d/Viewport3DToolbar.tsx`
- `src/ui/menus/MenuBar.tsx`
- `src/ui/layout/Workspace.tsx`
- `src/3d/core/sceneDataStore.ts`
- `src/3d/loading/importStore3d.ts`
- `src/3d/render/renderScene3d.ts`
- `src/ai/services/AICache.ts`
- `src/editor/processing/processingEngine.ts`
- `src/editor/core/engine.ts`
- `src/app/App.tsx`
- `vite.config.ts`

---

## 11. Summary of Classifications

- **Phase 31 (History):** core system VERIFIED WORKING; panel localization PARTIALLY IMPLEMENTED → fixed; added test coverage.
- **Phase 32 (Performance):** three.js eager-load defect PRESENT BUT BROKEN → fixed; initial JS reduced ~49% raw / ~47% gzip by deferring the 686 kB three chunk.
- **Phase 33 (Memory):** most cleanup VERIFIED WORKING; composite-cache key guard, AI LRU, and worker disposal PARTIALLY IMPLEMENTED → fixed.
- **Phase 34 (Security):** no secrets, no sensitive logs, keys in-memory only — NOT FOUND / VERIFIED SAFE; no changes needed.
- **Phase 35 (Cleanup):** no temporary files present — NOT FOUND; nothing deleted.
- **Phase 36 (3D):** disposal/cleanup VERIFIED WORKING; context-loss handling MISSING → fixed; no feature expansion.

**Phases 31–36 complete. Stopping here — no Phase 37+.**
