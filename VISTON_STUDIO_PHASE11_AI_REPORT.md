# VISTON STUDIO — Phase 11: Full AI Editing System — Report

> Status: **IMPLEMENTED** (foundation complete, runs, tested, honest)
> App: Vision Studio (Vite 6 + React 18 + Zustand 5 + TypeScript strict)
> Date: 2026

---

## 1. Executive summary

Vision Studio now has a complete, honest AI editing architecture:

- A **provider abstraction** (`AIProvider` + registry) with three providers:
  - `remote` — user-configured inference endpoint (VS AI JSON protocol),
  - `local` — present but unpowered (no engine integrated yet),
  - `mock` — **dev/test only**, never present in production builds, results always labeled.
- A **job manager** (serialized queue, progress, cancel) and a **result cache**.
- A real **local image-analysis service** that computes genuine per-pixel statistics and clearly labels them as local, NOT AI.
- An **AI panel**, **menus**, **commands + shortcut**, **Preferences → AI settings**, **i18n (EN/AR)**, and — crucially — **non-destructive integration** with the existing document/history/layer/selection/mask system, plus **backward-compatible project serialization** of AI metadata.
- A **Vitest test suite** (22 tests, all passing) that verifies the honest-failure contract.

Nothing is faked: with no provider configured the UI says exactly that and every operation fails with a user-friendly error.

---

## 2. Compliance map (IMPLEMENTED / INTEGRATED / MOCKED / PROVIDER REQUIRED / UNAVAILABLE)

| Capability | Status | Where |
|---|---|---|
| Provider abstraction & registry | **IMPLEMENTED** | `src/ai/core/AIProvider.ts` |
| Remote wire-protocol client | **IMPLEMENTED** | `src/ai/providers/RemoteAIProvider.ts` |
| JSON job queue with progress/cancel | **IMPLEMENTED** | `src/ai/services/AIJobManager.ts` |
| Result cache (memory) | **IMPLEMENTED** | `src/ai/services/AICache.ts` |
| Settings persistence (no key storage) | **IMPLEMENTED** | `src/ai/services/AISettingsStore.ts` |
| Local deterministic pixel statistics | **IMPLEMENTED** (labeled "local") | `src/ai/image/ImageAnalysisService.ts` |
| Selection ⇄ mask conversion | **IMPLEMENTED** | `src/ai/image/maskConversion.ts` |
| AI result → new layer + history | **IMPLEMENTED** | `src/ai/history/AIHistoryAdapter.ts`, `layerFactory.createAiResultLayer` |
| AI metadata in .vstudio project files | **IMPLEMENTED** (backward compatible) | `src/editor/project/projectFormat.ts` |
| AI panel UI | **IMPLEMENTED** | `src/ui/panels/AIPanel.tsx` |
| Menus / commands / shortcut / Preferences / i18n | **IMPLEMENTED** | `MenuBar`, `commands.ts`, `PreferencesDialog`, `en.ts`/`ar.ts` |
| 26 AI operations routed to provider | **INTEGRATED** (fires when provider configured) | `AIService.run` + capability gate |
| Mock results | **MOCKED** (dev/test only, origin `mock`) | `src/ai/providers/MockAIProvider.ts` |
| Real inference output | **PROVIDER REQUIRED** (remote endpoint or future local engine) | all 26 ops |
| Local (on-device) inference engine | **UNAVAILABLE** (not integrated) | `src/ai/providers/LocalAIProvider.ts` |

---

## 3. Build-repair (from earlier phase) — verified

The emergency repair was completed and re-verified before Phase 11 work:

- `src/state/store.ts` — literal `\n` corruption removed, `language: "en"` restored, `setLanguage` action implemented.
- `src/ui/panels/LanguageSelector.tsx` — extra `</option>` removed, clean rewrite.
- `src/i18n/index.ts` — `en`/`ar` imports, `getDirection()` reads store, `t(key: string)`.
- `src/i18n/en.ts` + `ar.ts` — duplicate keys deduplicated.
- `src/ui/menus/MenuBar.tsx` — missing `createBlankImageLayer` import fixed, optional-chain guards.
- `src/ui/dialogs/PreferencesDialog.tsx` — dead array selector removed.

**Verification (Phase 11 start and end): `typecheck` PASS, `build` PASS.**

---

## 4. Architecture

```
src/ai/
├── types.ts                        # AIOperation, AIRequest/Result/Job, AISettings, AILayerMetadata…
├── core/
│   ├── AIError.ts                  # typed, user-safe errors (never leaks internals)
│   ├── AIProvider.ts               # AIProvider interface + registry
│   └── AIRequest.ts                # request build/validate + cache keys + hashes
├── providers/
│   ├── LocalAIProvider.ts          # no engine → unavailable, honest reason
│   ├── RemoteAIProvider.ts         # VS AI JSON protocol client (fetch, AbortController, timeout)
│   └── MockAIProvider.ts           # dev/test only, deterministic, origin "mock"
├── services/
│   ├── AIService.ts                # orchestrator: run(), availability, capabilities, cache, labels
│   ├── AIJobManager.ts             # serialized queue, progress, cancel, deferred settlement
│   ├── AICache.ts                  # bounded memory result cache
│   └── AISettingsStore.ts          # persisted settings, cycle-free (no store import)
├── image/
│   ├── dataUrl.ts                  # data URL ⇄ canvas helpers
│   ├── ImageAnalysisService.ts     # REAL per-pixel local statistics
│   └── maskConversion.ts           # selectionEngine ⇄ AISelection/AIMask
├── prompts/PromptManager.ts        # per-operation prompt templates + text-assist modes
├── history/AIHistoryAdapter.ts     # result → new layer (undoable), selection apply
├── commands/aiCommands.ts          # shared run pipeline used by panel + commands
└── tests/                          # 22 Vitest tests
```

Integration points (all pre-existing, reused — nothing proprietary rebuilt):

- **History:** results are inserted via `engine.addLayer(...)` so undo/redo "just works".
- **Selection/Masks:** `selectionEngine.getMask/setMask/resize/dims` used by `maskConversion`.
- **Layers:** `createImageLayerFromCanvas` + new `createAiResultLayer`; `BaseLayer.ai` metadata.
- **Serialization:** `projectFormat` round-trips `ai` metadata; old files load unchanged (field optional, sanitized on parse).
- **Panels/UI:** `PanelShell(id="ai")` mounted in `Workspace`; toggled via View → Panels, the new **AI** menu, and `Ctrl+Shift+A`.
- **i18n:** `en.ts`/`ar.ts` AI keys; assets/styles follow existing tokens (`.vs-*`).

---

## 5. Capabilities (26 operations)

`analyzeImage, describe, detectObjects, detectFaces, detectText, classifyScene, analyzeComposition, selectSubject, selectObject, segment, removeBackground, removeObject, inpaint, generativeFill, generativeExpand, objectReplace, generateImage, generateVariation, upscale, denoise, sharpen, colorize, restore, relight, enhance, textAssist`

- Opened in the panel's operator select (JSON-enforced).
- Quick actions: Remove Background, Select Subject, Upscale 2x, Generative Fill (needs selection), Denoise, Sharpen, Colorize, Smart Enhance, Generate, Describe.
- Selection-aware: maskable ops consume the editor selection (`mask` + bounds) via `maskConversion`; returned AI masks can be re-applied to the editor selection.
- Auto-insert: image results become new undoable layers (source untouched); selection results can be applied back.

**Real vs mock — the contract:**

| Source | Origin | Trust |
|---|---|---|
| Remote provider | `provider` | real server output, sent over HTTPS (optionally bearer-authenticated, key held in memory only) |
| Mock provider | `mock` | deterministic placeholders, registered ONLY when `import.meta.env.DEV && mockEnabled`; production bundles cannot contain it |
| Local statistics | `local` | genuine pixel math, labeled "no AI model involved" |
| No provider | — | every run fails with `AIError` (`not-configured`/`provider-unavailable`) — never faked |

---

## 6. Provider system

- `AIProviderRegistry` registers `local`, `remote` (always) and `mock` (dev only).
- `AIService.run()`: resolves active provider → availability gate → capability gate → build/validate request → cache lookup → enqueue → persist result.
- Remote protocol (documented in provider file):

```json
POST {endpoint}
{ "request": { id, operation, provider, model, selectionKind, params, image: dataURL|null } }
→ 200 { "ok": true,  "result": { text?, canvasDataUrl?, structured?, metadata? } }
→ 200 { "ok": false, "error": { "code": "...", "message": "..." } }
```

- Errors map to typed codes (`network`, `timeout`, `auth`, `rate-limit`, `server`, `cancelled`, …) with user-safe messages.
- Preferences → AI: provider choice, remote endpoint URL, default model, API key (flat, memory-only), cache toggle, dev mock toggle (dev builds).
- Settings persisted under `vs-ai-settings-v1`. The API key never touches localStorage.

---

## 7. Import status (verified)

- `engine.importImageFile(file)` / `pickImageFile()` already existed and work — **no changes needed**.
- AI source selection: the active **image layer** canvas when one is selected, otherwise the **composite** (`engine.getComposite()`). Verified present and callable.

## 8. New-document presets status (verified)

- `documentPresets.ts` already ships A4/A3/Legal/Tabloid/etc. with px ⇔ mm/in conversion plus DPI presets — **no changes needed**. The AI panel adds nothing here; AI-generated image fallback is 512×512 when no canvas exists.

---

## 9. Files created / modified

**Created (`src/ai/…`)**
- `types.ts`, `core/AIError.ts`, `core/AIProvider.ts`, `core/AIRequest.ts`
- `providers/LocalAIProvider.ts`, `providers/RemoteAIProvider.ts`, `providers/MockAIProvider.ts`
- `services/AIService.ts`, `services/AIJobManager.ts`, `services/AICache.ts`, `services/AISettingsStore.ts`
- `image/dataUrl.ts`, `image/ImageAnalysisService.ts`, `image/maskConversion.ts`
- `prompts/PromptManager.ts`, `history/AIHistoryAdapter.ts`, `commands/aiCommands.ts`
- `tests/setup.ts`, `tests/error.test.ts`, `tests/hash.test.ts`, `tests/settings.test.ts`, `tests/maskConversion.test.ts`, `tests/service.test.ts`

**Modified**
- `src/editor/core/types.ts` — optional `ai?: AILayerMetadata` on `BaseLayer`.
- `src/editor/layers/layerFactory.ts` — `createAiResultLayer(result, name, opts)`.
- `src/editor/project/projectFormat.ts` — serialize/parse + sanitize AI metadata (mask array ⇄ `Uint8Array`).
- `src/state/store.ts` — `PanelId "ai"`, `aiJobs`, `aiSettings`, `aiLastResult`, actions.
- `src/ui/panels/AIPanel.tsx` — **new panel** (`PanelShell id="ai"`).
- `src/ui/layout/Workspace.tsx` — mounts `AIPanel`, visibility computation.
- `src/ui/menus/MenuBar.tsx` — new **AI** menu + AI panel in View → Panels.
- `src/app/commands.ts` — AI commands (`Ctrl+Shift+A` toggle, analyze, remove background, select subject, upscale, denoise, sharpen, generate).
- `src/ui/dialogs/PreferencesDialog.tsx` — AI settings section.
- `src/i18n/en.ts`, `src/i18n/ar.ts` — AI keys.
- `src/styles/global.css` — AI panel/status/jobs/progress styles (existing tokens).
- `package.json` — `vitest` dev dep + `test` script; `vitest.config.ts` (new).

---

## 10. Validation results

| Check | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`, strict, no `@ts-ignore`/`@ts-nocheck`/`any`) | ✅ PASS |
| `npm run build` (`tsc --noEmit && vite build`) | ✅ PASS · 107 modules · 415 kB JS |
| `npm test` (Vitest, 5 files / 22 tests) | ✅ PASS |
| Dev runtime | ✅ Vite transforms all AI modules (HTTP 200); app served |

Covered in tests: AIError safety contract, cache/source/selection hash stability, CI settings persistence + corrupt-storage tolerance, mask ⇄ selection round-trip + rectangle fill + clear, availability gating (no endpoint → `not-configured`, never faked), job manager run + cancel.

---

## 11. Known limitations

- **No bundled inference model.** Real AI output requires a remote endpoint speaking the VS AI protocol (or implementing `LocalAIProvider.execute`). Until then operations are honest "unavailable".
- **Mock is dev-only** — by design, to keep fake results away from production.
- Local analysis is **not AI**; it is labeled as such in the UI.
- AI masks assume full-document size (1:1 with `selectionEngine` dimensions); non-doc-size provider masks fall back to their bounds.
- `getComposite()` cost scales with document size on large canvases (pre-existing behavior).
- Remote API key is memory-only; re-entering after reload is intentional.

---

## 12. How to get real AI working

1. Preferences → AI → choose **Remote AI**.
2. Set a remote endpoint implementing the protocol above, optionally the default model and an API key.
3. Back in the AI panel: status turns **Available**, all 26 operations enable, quick actions run, results insert as undoable layers.
4. (Development only) enable **Mock AI** to exercise the pipeline offline with labeled placeholders.