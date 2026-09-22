# VISTON Studio Packaging Report

## Project
D:\VISION STUDIO

## Existing Stack
- React 18.3.1 + TypeScript 5.6.3 + Vite 6.4.3 (SPA)
- Zustand 5 store, Canvas 2D engine, WebGL (three.js 0.186) lazy-loaded 3D viewport
- Vitest 5 test suite

## Desktop Technology
Electron (v44.4.3) + electron-builder (v26.15.3)
- Chosen because: no Rust toolchain is installed (Tauri would require installing a full Rust + MSVC toolchain); Electron is fully compatible with the existing browser-API architecture (Canvas, WebGL, Web Worker, File System Access API, localStorage).
- One desktop technology only. No Tauri added.

## Android Technology
Capacitor (v8.5.2: core / cli / android)
- Existing React/Vite web app → Android WebView shell → APK
- No React Native, no UI/canvas/engine rewrite.

## Baseline
- Typecheck: PASS
- Tests: 478/478 PASS (52 files)
- Build: PASS

## Desktop
- EXE: `release\VISTON-Studio-Windows-0.1.0.exe` (portable, single-file, 110.6 MB)
- Unpacked app EXE: `release\win-unpacked\VISTON Studio.exe` (234.9 MB)
- Installer: `release\VISTON-Studio-Setup-0.1.0.exe` (NSIS, 110.8 MB)
- Architecture: x64
- Signing: unsigned (no code-signing certificate available; `CSC_IDENTITY_AUTO_DISCOVERY=false`)
- Runtime verified via packaged-app smoke test (loads `app.asar/dist/index.html`):
  - UI: PASS (workspace + menubar rendered)
  - Canvas: PASS (2 canvas elements initialized)
  - Console: CLEAN (0 errors — worker, modules, localStorage all load)
- Installer verified: silent install to temp dir → installed `VISTON Studio.exe` runs and passes the same smoke test → uninstalled/cleaned.

## Android
- APK debug: `release\VISTON-Studio-Android-debug.apk` (4.5 MB) — signed with Android Debug key
- APK release: `release\VISTON-Studio-Android-release-unsigned.apk` (3.5 MB) — unsigned
- Debug: PASS
- Release: built as unsigned artifact (no keystore)
- Signed: Debug YES / Release NO
- Keystore: MISSING (no signing keystore exists; debug uses the standard debug key)

## Files Added
- `electron/main.cjs` — minimal Electron main process (window + load `dist/index.html`, optional `--smoke` self-test)
- `capacitor.config.ts` — Capacitor config (appId `com.viston.studio`, appName `VISTON Studio`, webDir `dist`, https Android scheme)
- Generated scaffold (not hand-written): `android/` project (from `cap add android`), `release/` build artifacts, `D:\OpenCodeTemp\opencode\gradle-user-home` (Gradle caches, kept off C:)

## Files Modified
- `package.json` — added `"main"`, `build` (electron-builder) config, scripts (`desktop`, `smoke`, `build:desktop`, `android:sync`, `build:android`), and devDependencies (electron, electron-builder, @capacitor/cli, @capacitor/android) + dependency @capacitor/core
- `package-lock.json` — updated by npm for the new dependencies
- `android/gradle/wrapper/gradle-wrapper.properties` — generated file: `networkTimeout=180000` (the 10 s default caused the Gradle distribution download to time out)

## Files Deleted
0

## Tests
- `npm run typecheck`: PASS
- `npm test`: 478/478 PASS
- `npm run build`: PASS
- Desktop runtime smoke (unpacked + installed): PASS
- Android: APK debug/release built; no device/emulator available for on-device runtime test (see Known Limitations)

## Known Limitations
- No code signing certificate → Windows EXE/Installer and release APK are unsigned. Windows SmartScreen may warn on first run.
- Android release APK is unsigned (`app-release-unsigned.apk`). To distribute, sign with a real keystore (`zipalign` + `apksigner` or Android Studio "Generate Signed Bundle/APK").
- Android on-device runtime (touch, zoom, file picker, save/export) NOT tested — no emulator/device in this environment. The app is unmodified web code inside the Capacitor WebView; `<input type=file>` image open and localStorage work in WebView, but File System Access API (Save) is not available on Android, so Save/Export falls back to the app's existing download path (platform-dependent on Android).
- EXE Save uses Electron's native File System Access API (`showSaveFilePicker`) where the Electron Chromium supports it; otherwise the existing download fallback applies.
- `author` is not set in package.json (electron-builder logs a notice only; window title and metadata use `productName`).
- Icon: electron-builder generated the Windows icon from `public/icons/viston-ms-512.png`. Android still uses the default Capacitor launcher icon for this build; replace `android/app/src/main/res/mipmap-*` if a branded icon is required.

## Installation Instructions

### Windows
1. Run `VISTON-Studio-Setup-0.1.0.exe` (installer) — selects install directory, creates Desktop and Start Menu shortcuts.
   - Or run the portable `VISTON-Studio-Windows-0.1.0.exe` (no install needed).
2. Launch "VISTON Studio" → New Project → open image (JPG/PNG/WebP/BMP supported) → edit → Save/Export.

### Android
1. On the phone enable "Install from unknown sources".
2. Transfer `VISTON-Studio-Android-debug.apk` to the phone and open it to install.
3. Launch "VISTON Studio" and open an image via the file picker.
   - For a distributable build, sign the release APK with a keystore first.

## Artifact Paths
- `D:\VISION STUDIO\release\VISTON-Studio-Setup-0.1.0.exe`
- `D:\VISION STUDIO\release\VISTON-Studio-Windows-0.1.0.exe`
- `D:\VISION STUDIO\release\win-unpacked\VISTON Studio.exe`
- `D:\VISION STUDIO\release\VISTON-Studio-Android-debug.apk`
- `D:\VISION STUDIO\release\VISTON-Studio-Android-release-unsigned.apk`

## Regression Safety
- Typecheck / Tests / Build all PASS after packaging changes.
- No editor feature was modified, disabled, or removed (FILES DELETED: 0).
- Node/npm audits: 0 vulnerabilities for web + electron install; 3 moderate advisories reported by npm for Capacitor CLI transitive deps (CLI tooling only, not shipped in the APK).