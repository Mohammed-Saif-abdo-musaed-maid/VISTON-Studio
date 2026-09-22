# VISTON STUDIO — STARTUP BLANK SCREEN FIX REPORT

**Problem:** STARTUP BLANK/BLACK SCREEN
The app opens on http://localhost:5174 but the VISTON Studio interface does not appear.

**Reproduced:** YES
Reproduced in a real browser engine (headless Chromium/Edge) executing the
actual app against the running Vite server on http://localhost:5174:

- Clean browser profile → full UI renders, console clean.
- Browser profile carrying persisted corruption → **root stays empty (blank page)**, first console error:
  `Uncaught TypeError: Cannot read properties of null (reading 'trim')` at
  `src/ai/providers/RemoteAIProvider.ts`, "The above error occurred in the <AIPanel> component".

**Root Cause:**
Persisted AI settings in `localStorage` (`vs-ai-settings-v1`) can contain
`null` for string-typed fields such as `remoteEndpoint`. On startup the store
initializes `aiSettings` via `loadAiSettings()`, which merged the stored object
onto the defaults **without validating types**, so `remoteEndpoint` stayed
`null`. `<AIPanel>` (rendered on the first frame) calls
`aiService.providerAvailable()` → `RemoteAIProvider.isAvailable()/availabilityReason()`
which executed `this.config().endpoint.trim()` on `null` → uncaught TypeError.
The app has no error boundary, so React unmounts the whole tree → blank/black page.

**Fix** (minimal, root-cause, no data deletion, no feature removal):
1. `src/ai/services/AISettingsStore.ts` — `loadAiSettings()` now coerces every
   persisted field to its declared type (string/boolean/positive finite number)
   and falls back to the safe default for invalid values. Corrupt/`null` values
   in storage are ignored at load; valid user values are preserved.
2. `src/ai/providers/RemoteAIProvider.ts` — `isAvailable()` and
   `availabilityReason()` are null-guarded (`(cfg.endpoint ?? "")`)
   so a `null` endpoint can never throw again, regardless of how the setting
   arrives.

The user's stored data is **not cleared**; it is simply read safely. If the
user's browser still shows a blank page after this fix, a normal hard refresh
(Ctrl+Shift+R) is required to drop any old in-memory module, because the
crash happened inside their already-open tab.

**Files Changed:**
- `src/ai/services/AISettingsStore.ts` (type-safe load)
- `src/ai/providers/RemoteAIProvider.ts` (null-guard on `endpoint.trim()`)

**Files Deleted:** 0
(One *temporary diagnostic file* was created under `public/` only to seed the
corrupt localStorage for reproduction and was removed immediately after the
capture; it was never part of the app.)

**Features Removed:** 0

**Typecheck:** PASS
**Tests:** 478/478 PASS (52 files)
**Build:** PASS (165 modules)
**Runtime:** PASS — real browser boot verified on http://localhost:5174
**UI Visible:** PASS — workspace, menu bar, toolbar, canvas, panels, status bar render
**Import After Startup Fix:** PASS — full suite still includes the passing
import black-screen regression tests (no import changes in this task)
**Regression:** PASS — clean-profile boot re-verified after the fix; no console errors.