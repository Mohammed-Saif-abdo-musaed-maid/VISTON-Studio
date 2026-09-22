# VISTON STUDIO — Image Restoration & Noise Filters Extension

**Report date:** 2026-09-16
**Scope:** Noise Generation (Gaussian / Uniform / Salt & Pepper) + 5 classic restoration filters (Arithmetic Mean, Geometric Mean, Contra-Harmonic Mean, Alpha-Trimmed Mean, Wiener), fully integrated with the existing filtering pipeline, selection & layer-mask support, bilingual EN/AR UI, command palette, undo/redo, and worker-based execution.

---

## 1. What was added

| Feature | Notes |
|---|---|
| `noiseGeneration` | Seeded, **deterministic** Gaussian / Uniform / Salt & Pepper noise. Seed-based PRNG (mulberry32) with Box–Muller. Alpha channel is **never modified**. |
| `arithmeticMean` | Box mean (running-sum separable, O(N)); reuses the existing `boxBlur` with a new `keepAlpha` option. Original alpha preserved. |
| `geometricMean` | `exp(Σ ln(g) / N)` with a log-domain zero guard. Preserves more detail than a box mean. Alpha preserved. |
| `contraHarmonicMean` | `Σ g^(Q+1) / Σ g^Q`. `Q > 0` removes pepper (dark) noise, `Q < 0` removes salt (white) noise, `Q = 0` ≡ arithmetic mean. Denominator underflow (negative `Q`, pure black) guarded; alpha preserved. |
| `alphaTrimmedMean` | Per-channel window sort, discards `trim` extremes from each end, averages the rest. `trim` is clamped to `⌊(n−1)/2⌋` so the window can never be drained; alpha preserved. |
| `wienerFilter` | Adaptive local statistics: `out = mean + max(var−ν, 0) / max(var, ε) · (x−mean)`. Noise variance `ν` is **auto-estimated** (first-order luminance difference estimator) or entered manually; alpha preserved. |

All implemented as **real per-pixel math** in `src/editor/processing/processor.ts` — no stubs, no canvas tricks.

## 2. Files changed / created

| File | Change |
|---|---|
| `src/editor/processing/processor.ts` | New `FilterOp`/`ProcessOp` members + `ProcessParams` fields (`noiseType`, `mean`, `variance`, `saltProb`, `pepperProb`, `seed`, `kernel`, `q`, `trim`, `noiseVarianceMode`, `noiseVariance`); `runProcess` dispatch; the 6 algorithm implementations + mulberry32 PRNG; `boxBlur(…, keepAlpha=false)` backward-compatible option. |
| `src/editor/processing/filterSpecs.ts` | **New** pure spec module (React-free, testable in node). Includes dropdown `options` support and bilingual `label` keys for all 6 restoration ops + all existing ops. |
| `src/ui/dialogs/FilterDialog.tsx` | Imports specs from the new module; renders `<select>` for option-style params; honors `payload.values` (command-palette presets); runs labels through `t()`; passes the new params through `paramsFor`. |
| `src/ui/menus/MenuBar.tsx` | New **Filter → Restoration** submenu (Noise Generation → Gaussian/Uniform/Salt & Pepper, Arithmetic Mean, Geometric Mean, Contra-Harmonic Mean, Alpha-Trimmed Mean, Wiener). |
| `src/app/commands.ts` | 8 new commands incl. the three noise presets (Gaussian / Uniform / Salt & Pepper). No hard key-bindings (matches the existing filter commands). |
| `src/i18n/en.ts`, `src/i18n/ar.ts` | All new menu/param translations (Arabic terms below). |
| `src/i18n/index.ts` | **Bug fix:** `t()` and `getLanguage()` previously ignored the store language and always returned English. They now read `useEditorStore.getState().language`, so the bilingual UI actually switches. |
| `src/editor/core/engine.ts` | `buildEffectMask()` combines the layer mask and the current selection into a 0–255 grayscale mask mapped through the layer transform; `effectPreview`/`effectApply` now run through `processingEngine.processCanvas` so restricted edits preserve original pixels outside the mask. |
| `src/editor/processing/processingEngine.ts` | `applyMask` upgraded from binary (`sel === 0`) to **linear blending** `(sel/255·result + (1−sel/255)·original)` → feathered selections / soft painted masks blend correctly; alpha always restored outside the mask. |
| `src/ai/tests/setup.ts` | `ImageData` polyfill for the engine's synchronous worker-fallback path in the node test env. |
| `src/editor/tests/restorationFilters.test.ts` | **New** — 18 algorithm unit tests. |
| `src/editor/tests/restorationIntegration.test.ts` | **New** — 7 engine integration tests (pixel-backed canvas mock). |
| `src/editor/tests/sharpeningFilters.test.ts` | Test-data type tightened to the 14 sharpen ops (keeps `tsc` strict-mode clean). |

## 3. Determinism & noise design

- `mulberry32(seed)` seeds a reproducible stream; **the same seed always yields the identical noise image**, so preview and apply are pixel-identical and tests are repeatable.
- Gaussian noise: Box–Muller transform of PRNG uniforms, ε-guarded against `log(0)`.
- Uniform noise: `[−variance, +variance]` bounded by `amount`.
- Salt & Pepper: per-pixel impulse draw with separate `saltProb` / `pepperProb`.
- **RGBA guarantee:** all six ops leave the alpha channel untouched (restoration philosophy per spec §15). A dedicated test pins this for opaque and semi-transparent inputs.

## 4. Selection & layer-mask support (§13/§14)

`EditorEngine.buildEffectMask(source)` builds a full-size 0–255 mask:
1. start opaque (255);
2. **layer mask** — when editing a layer (`useLayerFx`), the layer's mask canvas (transform-space) is sampled into the effect source space and multiplied in;
3. **selection** — `selectionEngine.getMask()` (document space) is mapped into the effect source space. For the layer path the layer transform is inverted (translation / rotation / uniform scale supported); for the composite path it is mapped 1:1. Mask values are multiplied (`0/1` for binary selections, fractional for feathered ones).

The mask flows into `processingEngine.processCanvas` → `applyMask`, which linearly blends the processed result with the original inside soft regions and fully restores original RGB**+A** where the mask is 0. Undo/redo snap shots the whole layer canvas, so masked and unmasked edits always revert in one step.

## 5. Edge handling

All windowed filters use replicate (clamp-to-edge) sampling, so image borders are processed instead of darkened/blackened. Verified for 1×1, 3×3, 8×5, and 40×37 inputs.

## 6. Bilingual UI (EN / AR)

| Key | English | العربية |
|---|---|---|
| `restoration` | Restoration | استعادة |
| `noiseGeneration` | Noise Generation | إضافة الضوضاء |
| `gaussianNoise` | Gaussian Noise | ضوضاء غاوسية |
| `uniformNoise` | Uniform Noise | ضوضاء موحدة |
| `saltPepperNoise` | Salt & Pepper Noise | ضوضاء الملح والفلفل |
| `arithmeticMean` | Arithmetic Mean | المتوسط الحسابي |
| `geometricMean` | Geometric Mean | المتوسط الهندسي |
| `contraHarmonicMean` | Contra-Harmonic Mean | المتوسط التوافقي المعاكس |
| `alphaTrimmedMean` | Alpha-Trimmed Mean | متوسط ألفا المقطوع |
| `wienerFilter` | Wiener Filter | فلتر وينر |
| `noiseTypeParam` | Noise Type | نوع الضوضاء |
| `kernelSizeParam` | Kernel Size | حجم النواة |
| `qParam` / `trimParam` | Q / Trim | Q / العدد المقطوع |
| `seedParam` | Seed | البذرة |
| `auto` / `manual` | Auto / Manual | تلقائي / يدوي |

Menu paths, dialog titles, parameter labels, and history entry names all translate. The `t()` fix that makes Arabic switching actually work is a side-effect improvement applied in this task (existing English UI unaffected).

## 7. Command palette & keyboard

Eight new commands (no global hotkeys, matching the existing filter commands): `gaussianNoise`, `uniformNoise`, `saltPepperNoise`, `arithmeticMean`, `geometricMean`, `contraHarmonicMean`, `alphaTrimmedMean`, `wienerFilter`. The three noise commands open the dialog pre-set (`payload.values` / `initialValues`) for that noise type.

## 8. Testing & validation

- `npm run typecheck` → **clean** (strict mode, no `any` workarounds, no `@ts-ignore`).
- `npm run test` → **16 files / 107 tests passed** (100 pre-existing + 18 restoration algorithm tests + 7 engine integration tests).
  - Algorithm tests: seed determinism, seed sensitivity, per-mode distinction, uniform-noise bounds, alpha preservation, flat-image invariance, `Q=0 ≡ arithmetic` equivalence, pepper/salt selectivity, zero/NaN guards, window-clamp, edge sizes.
  - Integration tests (real pixel math through `EditorEngine.effectApply`): exact neighborhood average, single-step undo/redo restore, selection-respect, layer-mask-respect, all 6 ops end-to-end, command registration, spec completeness.
- `npm run build` → **succeeds** (Chrome-style chunk-size warning only, pre-existing).

## 9. Existing behavior preserved

No existing tools, layers, masks, selections, history, AI features, or documents were replaced. The `boxBlur` default (`keepAlpha=false`) keeps `meanBlur`/`localContrastSharpen` byte-identical. All previous 100 tests still pass unchanged (one test's local type annotation was tightened, no behavior change).

## 10. Known notes

- Selection-to-layer mapping supports translation, rotation, and uniform scale (skewed layers fall back to the un-skewed approximation).
- Preview downscaling samples the full-resolution mask, so on very large documents the preview mask is an approximation of the applied result (apply is exact).
- Pre-existing cosmetic typo in `src/i18n/ar.ts` (`directionalSharpen: "تكieber اتجاهي"`) was left untouched as it is outside this task's scope.