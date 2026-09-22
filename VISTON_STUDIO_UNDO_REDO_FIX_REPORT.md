# VISTON STUDIO — Undo / Redo Fix Report

**Status:** Fixed and verified
**Date:** 2026-09-20
**Validated against:** `npm run typecheck`, `npm test` (181/181), `npm run build`, headless Chrome (CDP) runtime harness

---

## 1. Bug summary

> "When the user performs an edit and presses Ctrl+Z the edit does not actually get reverted."

### Root cause

The undo/redo *data* layer was wired correctly — engine `undo()/redo()`, the `HistoryManager`, the Ctrl+Z / Ctrl+Shift+Z shortcuts, and the per-operation undo closures all existed. The failure was in the **render pipeline after a commit**:

- `commitStroke()` (and every edit that goes through `pushHistory()`) mutated the document/pixels and bumped `engine.version`, but **never scheduled a canvas repaint**.
- `canvasEngine.render()` only re-bakes the composite when `requestRender()` is called (`needsRender` set) or — on the *next already-scheduled* frame — when `compositeCacheVersion !== engine.version`. After a stroke, **no frame was ever scheduled**, so the newly committed result was never drawn.
- The user therefore never saw the committed edit until some unrelated action happened to repaint the canvas. When they pressed Ctrl+Z, `engine.undo()` *did* run and *did* schedule a repaint — but the frame it painted was already the pre-edit state, so **nothing visibly changed**. Result: "the edit does not get reverted."

This was reproduced headlessly: after a real brush stroke, the model (`pixelStore`) changed and `historyItems` showed `["Brush Stroke"]`, but the on-screen `.vs-canvas-element` bitmap was byte-for-byte **unchanged** (`-1451802724` → `-1451802724`). A manual `runtime.canvas.requestRender()` immediately repainted (`1077947206`).

Move-layer undo/redo already worked end-to-end because `commitLayerTransform()` (via `makeLayerCommand`) and `engine.undo()` both call `requestRender()`; the broken path was every operation that relies solely on `pushHistory()`.

---

## 2. Changes made (smallest safe surface)

### 2.1 `src/editor/core/engine.ts` — repaint on every committed edit (root fix)

`pushHistory()` is the single choke point for "a document-mutating operation was just committed". It now requests a canvas repaint after pushing:

```ts
pushHistory(e: Omit<HistoryEntry, "id">): void {
  this.history.push({ ...e, thumb: e.thumb ?? this.historyThumbnail() });
  this.syncHistoryView();
  this.version++;
  this.markDirty();
  runtime.canvas?.requestRender();
}
```

- `version` is already bumped above it, so the renderer re-bakes the composite on this frame (no extra version increment).
- Covers every commit path uniformly: brush/eraser/pencil/clone/heal/dodge/burn/smudge strokes, move/resize/rotate commits, adjustments, filters, crop, group/merge/flatten, masks, delete, text, paste, import, AI ops, 3D scene history, etc.
- Safe in all existing call sites: redundant `requestRender()` calls in some wrappers are harmless; undo/redo closures do not call `pushHistory`.

### 2.2 `src/app/commands.ts` — Ctrl+Y redo

- Extended `Command` with an optional `shortcuts?: ShortcutSpec[]` (additional alternate bindings; the primary `shortcut` is unchanged so menus and `shortcutText` are untouched).
- `redo` now also binds **Ctrl+Y**:
  ```ts
  { id: "redo", ..., shortcut: { key: "z", ctrl: true, shift: true }, shortcuts: [{ key: "y", ctrl: true }], ... }
  ```

### 2.3 `src/app/useKeyboardShortcuts.ts` — match alternates + hardened input guard

- The single global `keydown` listener now matches `shortcut` plus all `shortcuts[]` (still one listener — no duplicates).
- Input guard upgraded to `target.closest("input, textarea, select, [contenteditable=\"true\"], [contenteditable=\"\"]")`:
  - still returns early for `INPUT`/`TEXTAREA`/`SELECT` (as before), now robust to key events targeting child elements;
  - also protects `contenteditable` text (e.g. future inline text editing): Ctrl+Z/Ctrl+Y inside editable content stays native and never triggers the app undo/redo.

No `@ts-ignore` / `@ts-nocheck` / `any` introduced (the alternate-binding loop uses an explicit `ShortcutSpec | null`).

---

## 3. Verification

### 3.1 Static validation

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` (21 files) | **181 passed / 181** |
| `npm run build` | PASS (only pre-existing >900 kB chunk warning) |

### 3.2 Runtime verification (headless Chrome CDP against the dev server)

Hash identifiers below are deterministic grid-hash functions of the named bitmap (`px` = layer pixelStore, `vis` = on-screen `.vs-canvas-element`, `comp` = `engine.getComposite()`, `before` = `engine.getBeforeRefInfo().canvas`).

| # | Scenario | Result |
|---|---|---|
| 1 | Brush stroke on selected layer | `px`, `vis`, `comp` all changed; exactly **1** history entry "Brush Stroke" |
| 2 | Ctrl+Z | `px`/`vis`/`comp` restored to pre-edit values; `canRedo=true` — **visible revert** |
| 3 | Ctrl+Y (new binding) | redoes; values restored; `canUndo=true` |
| 4 | Ctrl+Shift+Z (original binding) | still functional |
| 5 | Ctrl+Z keydown while focus is **inside an `<input>`** (real bubbling) | nothing undone; `canUndo` stays true |
| 6 | `saveProject()` attempt | history stack intact (`idx`/`items` unchanged) — Save never clears within-session history |
| 7 | Edit → open Before/After → Ctrl+Z (CASE 12) | `before` **identical before and after undo** (−793209536), `comp` updated after undo — Before frozen, After refreshed |
| 8 | Opening compare view | adds **no** history entries (view-only op) |
| 9 | `setDoc(new)` | history reset, `canUndo=false` — new/opened documents isolate history |
| 10 | Runtime exceptions | none |

### 3.3 Spec requirements coverage

- **No second history system** — reuses the existing `HistoryManager`; nothing added.
- **No screenshot-based undo** — undo closures use `snapshotCanvas`/`restoreSnapshot` on `pixelStore` regions and layer/doc snapshots.
- **One logical entry per gesture** — already the architecture (commit-at-gesture-end): brush = 1 `commitStroke`, move/resize/rotate = 1 `commitLayerTransform` at pointer-up, shape/gradient/pen/text = 1 layer add, adjustments/levels/curves = 1 on OK, 3D scene gestures = `commitSceneGesture`. Verified by harness (single entry per stroke) and the existing undo unit/restoration tests.
- **No duplicate global listeners** — only `useKeyboardShortcuts` (single `keydown`), canvasEngine (Space/Escape only), compare viewer (Arrow keys only), LayersPanel (Escape only), DialogHost (dialog-internal).
- **Before/After compatibility** — Before reference is immutable (byte-stable across edits and undo); After re-fetches `engine.getComposite()` whenever `engine.version` changes (undo/redo bump `version` via `requestRender()`).
- **Save / New / Open** — Save (`saveProject`/`saveCopyProject`) never calls `history.reset()`; `setDoc` and `_openDoc` reset history for new/opened documents.
- **AI operations** — route through `AIHistoryAdapter` → `engine.addLayer`/single push → one undoable entry (existing tests cover AI undo).
- **History UI** — `HistoryPanel` reads store `historyItems`/`historyIndex` (synced by `pushHistory` and `undo/redo/jumpTo`), empty state shows "No history", buttons disable via index; thumbnails/`jumpTo` untouched.
- **Ctrl+Y** — supported (Windows convention; Ctrl+Shift+Z kept as primary/menu binding).

---

## 4. Limitations / notes

- The PropertiesPanel text-layer controls currently apply via live updates (`updateTextLayerLive`, no history entry) rather than committing on blur; they remain "preview" changes. Making them commit-on-blur was out of scope to keep the change minimal — flag if the desired UX is one "Edit Text" entry per panel edit session.
- File picker flows (Save/Open/Export dialogs) cannot complete in the headless harness; those were validated by code inspection (no reset path) and the existing `importSave.test.ts`.
- Only the pre-existing Vite "chunk larger than 900 kB" warning remains in `npm run build`.

## 5. Files changed

- `src/editor/core/engine.ts` — `pushHistory()` now triggers a canvas repaint (root fix).
- `src/app/commands.ts` — `Command.shortcuts[]` alternate bindings; `redo` also bound to Ctrl+Y.
- `src/app/useKeyboardShortcuts.ts` — match alternate bindings; hardened editable-content guard.