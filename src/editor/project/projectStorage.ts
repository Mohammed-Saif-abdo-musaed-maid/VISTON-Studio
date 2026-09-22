import { EXT, stringifyProject, ProjectFile, PROJECT_COMPAT_EXTS } from "./projectFormat";
import { importAcceptString } from "../import/importFormats";

/**
 * Storage abstraction for project files and app persistence.
 *
 * The web build saves via the File System Access API when available
 * (Chrome/Edge, secure context) and falls back to downloads otherwise.
 * Recent projects, autosave recovery slots and preferences use localStorage.
 */

export interface RecentProject {
  name: string;
  path: string;
  lastOpenedAt: number;
}

export interface AutosaveSlot {
  docId: string;
  name: string;
  savedAt: number;
  bytes: string;
  path: string | null;
}

export interface Three3DPreferences {
  defaultDisplayMode: "solid" | "wireframe" | "material";
  snapSize: number;
  gridVisible: boolean;
  axesVisible: boolean;
  antialias: boolean;
}

export interface EditorPreferences {
  autosaveEnabled: boolean;
  autosaveIntervalSec: number;
  defaultDpi: number;
  three3D: Three3DPreferences;
}

export const DEFAULT_PREFERENCES: EditorPreferences = {
  autosaveEnabled: true,
  autosaveIntervalSec: 120,
  defaultDpi: 96,
  three3D: {
    defaultDisplayMode: "material",
    snapSize: 0.1,
    gridVisible: true,
    axesVisible: true,
    antialias: true,
  },
};

const RECENT_KEY = "vsstudio:recent";
const PREFS_KEY = "vsstudio:prefs";
const AUTOSAVE_PREFIX = "vsstudio:autosave:";
const RECENT_MAX = 12;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be full/unavailable; never throw into the app.
  }
}

// ── Recent projects ──

export function getRecentProjects(): RecentProject[] {
  const list = readJson<RecentProject[]>(RECENT_KEY);
  return Array.isArray(list) ? list.filter((r) => r && typeof r.name === "string") : [];
}

export function addRecentProject(entry: { name: string; path: string }): RecentProject[] {
  const list = getRecentProjects().filter((r) => r.path !== entry.path || r.name !== entry.name);
  list.unshift({ ...entry, lastOpenedAt: Date.now() });
  const trimmed = list.slice(0, RECENT_MAX);
  writeJson(RECENT_KEY, trimmed);
  return trimmed;
}

export function touchRecentProject(path: string): RecentProject[] {
  const list = getRecentProjects();
  const idx = list.findIndex((r) => r.path === path);
  if (idx >= 0) {
    list[idx] = { ...list[idx], lastOpenedAt: Date.now() };
    const [item] = list.splice(idx, 1);
    list.unshift(item);
    writeJson(RECENT_KEY, list);
  }
  return list;
}

export function removeRecentProject(path: string): RecentProject[] {
  const list = getRecentProjects().filter((r) => r.path !== path);
  writeJson(RECENT_KEY, list);
  return list;
}

export function clearRecentProjects(): void {
  try { localStorage.removeItem(RECENT_KEY); } catch { /* noop */ }
}

// ── Preferences ──

export function getPreferences(): EditorPreferences {
  const stored = readJson<Partial<EditorPreferences>>(PREFS_KEY);
  const merged: EditorPreferences = { ...DEFAULT_PREFERENCES, ...(stored ?? {}) };
  merged.three3D = { ...DEFAULT_PREFERENCES.three3D, ...(stored?.three3D ?? {}) };
  return merged;
}

export function setPreferences(prefs: EditorPreferences): void {
  writeJson(PREFS_KEY, prefs);
}

// ── Autosave / crash recovery slots ──

export function setAutosaveSlot(slot: AutosaveSlot): void {
  try { localStorage.setItem(AUTOSAVE_PREFIX + slot.docId, JSON.stringify(slot)); } catch { /* noop */ }
}

export function getAutosaveSlot(docId: string): AutosaveSlot | null {
  return readJson<AutosaveSlot>(AUTOSAVE_PREFIX + docId);
}

export function deleteAutosaveSlot(docId: string): void {
  try { localStorage.removeItem(AUTOSAVE_PREFIX + docId); } catch { /* noop */ }
}

export function listAutosaveSlots(exceptDocIds: string[] = []): AutosaveSlot[] {
  const exclude = new Set(exceptDocIds);
  const out: AutosaveSlot[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(AUTOSAVE_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const slot = JSON.parse(raw) as AutosaveSlot;
        if (slot && typeof slot.docId === "string" && !exclude.has(slot.docId) && typeof slot.bytes === "string" && slot.bytes.length > 0) {
          out.push(slot);
        }
      } catch { /* skip corrupt slot */ }
    }
  } catch { /* noop */ }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export function autosaveSlotSize(slot: AutosaveSlot): number {
  try {
    return new Blob([slot.bytes]).size;
  } catch {
    return slot.bytes.length;
  }
}

// ── Saving project text to a user-visible file ──

export interface WriteResult {
  ok: boolean;
  name: string | null;
  path: string | null;
  cancelled: boolean;
  error: string | null;
}

interface FileSystemFileHandle {
  createWritable(): Promise<{
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
  }>;
  getFile(): Promise<File>;
  name: string;
}

let savedHandle: FileSystemFileHandle | null = null;

function supportsFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

/**
 * Persist serialized project text.
 * - With File System Access: asks for a location once, then silently rewrites
 *   the same file on subsequent "Save" calls.
 * - Without it: triggers a download (still correct, keeps dirty=false).
 */
export async function writeProjectText(
  bytes: string,
  suggestedName: string,
  mode: "save" | "saveAs",
  options?: { rememberHandle?: boolean }
): Promise<WriteResult> {
  const rememberHandle = options?.rememberHandle !== false;
  const fallbackPath = `${suggestedName}.${EXT}`;
  if (supportsFileSystemAccess() && typeof (window as never as { showSaveFilePicker?: unknown }).showSaveFilePicker === "function") {
    try {
      const handle =
        mode === "saveAs" || !savedHandle
          ? await (window as never as { showSaveFilePicker(options?: unknown): Promise<FileSystemFileHandle> })
              .showSaveFilePicker({
                suggestedName: fallbackPath,
                types: [{ description: "Vision Studio Project", accept: { "application/json": [`.${EXT}`] } }],
              })
          : savedHandle;
      const writable = await handle.createWritable();
      await writable.write(new Blob([bytes], { type: "application/json" }));
      await writable.close();
      if (rememberHandle) savedHandle = handle;
      return { ok: true, name: handle.name, path: handle.name, cancelled: false, error: null };
    } catch (err) {
      const e = err as Error;
      if (e && e.name === "AbortError") {
        return { ok: false, name: null, path: null, cancelled: true, error: null };
      }
      // Fall through to download if the picker failed.
    }
  }

  try {
    const blob = new Blob([bytes], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fallbackPath;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { ok: true, name: fallbackPath, path: fallbackPath, cancelled: false, error: null };
  } catch (err) {
    return { ok: false, name: null, path: null, cancelled: false, error: `Save failed: ${(err as Error).message}` };
  }
}

/**
 * Open a project file through the native picker.
 */
export function pickProjectFile(): Promise<{ file: File; fileName: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = PROJECT_COMPAT_EXTS.join(",");
    input.onchange = () => {
      if (input.files?.[0]) {
        const file = input.files[0];
        resolve({ file, fileName: file.name });
      } else {
        resolve(null);
      }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function pickImageFile(): Promise<{ file: File; fileName: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = importAcceptString();
    input.onchange = () => {
      if (input.files?.[0]) {
        const file = input.files[0];
        resolve({ file, fileName: file.name });
      } else {
        resolve(null);
      }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function projectBytesForTest(file: ProjectFile): string {
  return stringifyProject(file);
}

export { stringifyProject };