import { useEditorStore } from "../state/store";
import { runtime } from "../editor/core/runtime";
import { createBlankImageLayer } from "../editor/layers/layerFactory";
import { pickImageFile } from "../editor/project/projectStorage";
import { importAcceptString } from "../editor/import/importFormats";
import { runAiCommand } from "../ai/commands/aiCommands";

export interface ShortcutSpec {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface Command {
  id: string;
  label: string;
  /** displayed in menus, e.g. "Ctrl+Shift+S" */
  shortcutText?: string;
  shortcut?: ShortcutSpec;
  /** additional alternative key bindings (matched like `shortcut`); the
   *  primary binding stays in `shortcut` so menus/`shortcutText` are unchanged. */
  shortcuts?: ShortcutSpec[];
  enabled?: () => boolean;
  run: () => void;
}

const hasDoc = () => !!useEditorStore.getState().doc;
const engine = () => runtime.engine;

const zoomToPoint = (factor: number) => () => runtime.canvas?.zoomAtVP({ x: 400, y: 300 }, factor);

export const TOOL_SHORTCUTS: Command[] = [
  { id: "tool.move", label: "Move Tool", shortcutText: "V", shortcut: { key: "v" }, run: () => useEditorStore.setState({ tool: "move" }) },
  { id: "tool.selection", label: "Selection Tool", shortcutText: "M", shortcut: { key: "m" }, run: () => useEditorStore.setState({ tool: "selection" }) },
  { id: "tool.crop", label: "Crop Tool", shortcutText: "C", shortcut: { key: "c" }, run: () => useEditorStore.setState({ tool: "crop" }) },
  { id: "tool.pencil", label: "Pencil Tool", shortcutText: "N", shortcut: { key: "n" }, run: () => useEditorStore.setState({ tool: "pencil" }) },
  { id: "tool.brush", label: "Brush Tool", shortcutText: "B", shortcut: { key: "b" }, run: () => useEditorStore.setState({ tool: "brush" }) },
  { id: "tool.eraser", label: "Eraser Tool", shortcutText: "E", shortcut: { key: "e" }, run: () => useEditorStore.setState({ tool: "eraser" }) },
  { id: "tool.eyedropper", label: "Eyedropper Tool", shortcutText: "I", shortcut: { key: "i" }, run: () => useEditorStore.setState({ tool: "eyedropper" }) },
  { id: "tool.bucket", label: "Paint Bucket Tool", shortcutText: "K", shortcut: { key: "k" }, run: () => useEditorStore.setState({ tool: "bucket" }) },
  { id: "tool.clone", label: "Clone Stamp Tool", shortcutText: "S", shortcut: { key: "s" }, run: () => useEditorStore.setState({ tool: "clone" }) },
  { id: "tool.heal", label: "Healing Brush Tool", shortcutText: "J", shortcut: { key: "j" }, run: () => useEditorStore.setState({ tool: "heal" }) },
  { id: "tool.dodge", label: "Dodge Tool", shortcutText: "O", shortcut: { key: "o" }, run: () => useEditorStore.setState({ tool: "dodge" }) },
  { id: "tool.burn", label: "Burn Tool", run: () => useEditorStore.setState({ tool: "burn" }) },
  { id: "tool.smudge", label: "Smudge Tool", run: () => useEditorStore.setState({ tool: "smudge" }) },
  { id: "tool.pen", label: "Pen Tool", shortcutText: "P", shortcut: { key: "p" }, run: () => useEditorStore.setState({ tool: "pen" }) },
  { id: "tool.text", label: "Text Tool", shortcutText: "T", shortcut: { key: "t" }, run: () => useEditorStore.setState({ tool: "text" }) },
  { id: "tool.shape", label: "Shape Tool", shortcutText: "U", shortcut: { key: "u" }, run: () => useEditorStore.setState({ tool: "shape" }) },
  { id: "tool.gradient", label: "Gradient Tool", shortcutText: "G", shortcut: { key: "g" }, run: () => useEditorStore.setState({ tool: "gradient" }) },
  { id: "tool.hand", label: "Hand Tool", shortcutText: "H", shortcut: { key: "h" }, run: () => useEditorStore.setState({ tool: "hand" }) },
  { id: "tool.zoom", label: "Zoom Tool", shortcutText: "Z", shortcut: { key: "z" }, run: () => useEditorStore.setState({ tool: "zoom" }) },
];

export const COMMANDS: Command[] = [
  // File
  { id: "newProject", label: "New Document…", shortcutText: "Ctrl+N", shortcut: { key: "n", ctrl: true }, run: () => engine()?.requestNewDocument() },
  { id: "openProject", label: "Open Project…", shortcutText: "Ctrl+O", shortcut: { key: "o", ctrl: true }, run: () => void engine()?.openProject() },
  { id: "save", label: "Save", shortcutText: "Ctrl+S", shortcut: { key: "s", ctrl: true }, enabled: hasDoc, run: () => void engine()?.saveProject() },
  { id: "saveAs", label: "Save As…", shortcutText: "Ctrl+Shift+S", shortcut: { key: "s", ctrl: true, shift: true }, enabled: hasDoc, run: () => void engine()?.saveProject({ asNew: true }) },
  { id: "importImage", label: "Import Image…", shortcutText: "Ctrl+Shift+I", shortcut: { key: "i", ctrl: true, shift: true }, run: () => { const input = document.createElement("input"); input.type = "file"; input.accept = importAcceptString(); input.onchange = () => { if (input.files?.[0]) void engine()?.importImageFile(input.files[0]); }; input.click(); } },
  { id: "export", label: "Export…", shortcutText: "Ctrl+Shift+E", shortcut: { key: "e", ctrl: true, shift: true }, enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "export" }) },
  { id: "closeDocument", label: "Close", shortcutText: "Ctrl+W", shortcut: { key: "w", ctrl: true }, enabled: hasDoc, run: () => void engine()?.closeDocument() },
  { id: "preferences", label: "Preferences…", run: () => useEditorStore.getState().openDialog({ name: "preferences" }) },
  { id: "recovery", label: "Recover Documents…", run: () => useEditorStore.getState().openDialog({ name: "recovery" }) },

  // File menu upgrade — primary `file.*` command ids used by the File menu.
  // Keyboard bindings stay on the legacy File commands above (which are the
  // tested, conflict-free shortcuts) so this registry introduces no duplicate
  // key bindings; `shortcutText` keeps the menu labels sourced from here.
  { id: "file.new", label: "New Project…", shortcutText: "Ctrl+N", run: () => engine()?.requestNewDocument() },
  { id: "file.open", label: "Open…", shortcutText: "Ctrl+O", run: () => void engine()?.openProject() },
  { id: "file.openRecent", label: "Open Recent", enabled: () => useEditorStore.getState().recentProjects.length > 0, run: () => { const r = useEditorStore.getState().recentProjects[0]; if (r) engine()?.openFromRecent(r.path); } },
  { id: "file.import", label: "Import Image…", shortcutText: "Ctrl+Shift+I", run: () => { void (async () => { const p = await pickImageFile(); if (p) await engine()?.importImageFile(p.file); })(); } },
  { id: "file.importClipboard", label: "Import from Clipboard", enabled: hasDoc, run: () => engine()?.pasteClipboard() },
  { id: "file.importPlace", label: "Place as Layer…", enabled: hasDoc, run: () => { void (async () => { const p = await pickImageFile(); if (p) await engine()?.placeImageFile(p.file); })(); } },
  { id: "file.save", label: "Save", shortcutText: "Ctrl+S", enabled: hasDoc, run: () => void engine()?.saveProject() },
  { id: "file.saveAs", label: "Save As…", shortcutText: "Ctrl+Shift+S", enabled: hasDoc, run: () => void engine()?.saveProject({ asNew: true }) },
  { id: "file.saveCopy", label: "Save a Copy…", enabled: hasDoc, run: () => void engine()?.saveCopyProject() },
  { id: "file.exportPng", label: "Export as PNG", enabled: hasDoc, run: () => void engine()?.exportComposite({ format: "png" }) },
  { id: "file.exportJpeg", label: "Export as JPEG", enabled: hasDoc, run: () => void engine()?.exportComposite({ format: "jpeg", quality: 92 }) },
  { id: "file.exportWebp", label: "Export as WebP", enabled: hasDoc, run: () => void engine()?.exportComposite({ format: "webp", quality: 92 }) },
  { id: "file.exportBmp", label: "Export as BMP", enabled: hasDoc, run: () => void engine()?.exportComposite({ format: "bmp" }) },
  { id: "file.exportSelected", label: "Export Selected…", enabled: hasDoc, run: () => void engine()?.exportSelection({ format: "png" }) },
  { id: "file.exportLayer", label: "Export Layer…", enabled: hasDoc, run: () => void engine()?.exportLayer({ format: "png" }) },
  { id: "file.exportArtboard", label: "Export Artboard…", enabled: hasDoc, run: () => void engine()?.exportArtboard({ format: "png" }) },
  { id: "file.newArtboard", label: "New Artboard…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "artboard" }) },
  { id: "file.gridSettings", label: "Grid Settings…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "gridSettings" }) },
  { id: "file.exportAs", label: "Export As…", shortcutText: "Ctrl+Shift+E", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "export" }) },
  { id: "file.close", label: "Close", shortcutText: "Ctrl+W", enabled: hasDoc, run: () => void engine()?.closeDocument() },
  { id: "file.closeAll", label: "Close All", enabled: hasDoc, run: () => engine()?.closeAllDocuments() },
  { id: "file.documentInfo", label: "Document Info…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "documentInfo" }) },
  { id: "file.print", label: "Print…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "printNotice" }) },
  { id: "file.preferences", label: "Preferences…", run: () => useEditorStore.getState().openDialog({ name: "preferences" }) },
  { id: "file.recovery", label: "Recover Documents…", run: () => useEditorStore.getState().openDialog({ name: "recovery" }) },
  { id: "file.exit", label: "Exit", enabled: () => typeof window !== "undefined" && (window as unknown as { __VISTON_DESKTOP__?: boolean }).__VISTON_DESKTOP__ === true, run: () => useEditorStore.getState().openDialog({ name: "exitNotice" }) },

  // Edit
  { id: "undo", label: "Undo", shortcutText: "Ctrl+Z", shortcut: { key: "z", ctrl: true }, enabled: () => engine()?.canUndo() ?? false, run: () => engine()?.undo() },
  { id: "redo", label: "Redo", shortcutText: "Ctrl+Shift+Z", shortcut: { key: "z", ctrl: true, shift: true }, shortcuts: [{ key: "y", ctrl: true }], enabled: () => engine()?.canRedo() ?? false, run: () => engine()?.redo() },
  { id: "cut", label: "Cut", shortcutText: "Ctrl+X", shortcut: { key: "x", ctrl: true }, enabled: hasDoc, run: () => engine()?.cutSelection() },
  { id: "copy", label: "Copy", shortcutText: "Ctrl+C", shortcut: { key: "c", ctrl: true }, enabled: hasDoc, run: () => engine()?.copySelection() },
  { id: "paste", label: "Paste", shortcutText: "Ctrl+V", shortcut: { key: "v", ctrl: true }, enabled: hasDoc, run: () => engine()?.pasteClipboard() },
  { id: "delete", label: "Delete", shortcutText: "Del", shortcut: { key: "Delete" }, enabled: hasDoc, run: () => engine()?.deleteSelection() },
  { id: "selectAll", label: "Select All", shortcutText: "Ctrl+A", shortcut: { key: "a", ctrl: true }, enabled: hasDoc, run: () => engine()?.selectAll() },
  { id: "deselect", label: "Deselect", shortcutText: "Ctrl+D", shortcut: { key: "d", ctrl: true }, enabled: hasDoc, run: () => engine()?.deselect() },
  { id: "fill", label: "Fill…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "fill" }) },
  { id: "duplicate", label: "Duplicate Layer", shortcutText: "Ctrl+J", shortcut: { key: "j", ctrl: true }, enabled: () => useEditorStore.getState().selectedIds.length > 0, run: () => engine()?.duplicateSelected() },
  { id: "group", label: "Group Layers", shortcutText: "Ctrl+G", shortcut: { key: "g", ctrl: true }, enabled: () => useEditorStore.getState().selectedIds.length >= 2, run: () => engine()?.groupSelected() },
  { id: "ungroup", label: "Ungroup", shortcutText: "Ctrl+Shift+G", shortcut: { key: "g", ctrl: true, shift: true }, enabled: () => { const d = engine()?.doc(); const sel = useEditorStore.getState().selectedIds; return !!d && sel.some((id) => d.getLayer(id)?.type === "group"); }, run: () => engine()?.ungroupSelected() },
  { id: "mergeDown", label: "Merge Down", shortcutText: "Ctrl+E", shortcut: { key: "e", ctrl: true }, enabled: () => useEditorStore.getState().selectedIds.length > 0, run: () => engine()?.mergeDown() },
  { id: "deleteLayers", label: "Delete Layer", shortcutText: "Ctrl+Shift+D", shortcut: { key: "d", ctrl: true, shift: true }, enabled: () => useEditorStore.getState().selectedIds.length > 0, run: () => { const sel = useEditorStore.getState().selectedIds; if (sel.length) engine()?.deleteLayers(sel); } },

  // Select
  { id: "invertSelection", label: "Invert Selection", enabled: hasDoc, run: () => engine()?.invertSelection() },
  { id: "growSelection", label: "Grow Selection", enabled: hasDoc, run: () => engine()?.growSelection() },
  { id: "contractSelection", label: "Contract Selection", enabled: hasDoc, run: () => engine()?.contractSelection() },
  { id: "featherSelection", label: "Feather Selection", enabled: hasDoc, run: () => engine()?.featherSelection() },

  // Adjust
  { id: "adjustments", label: "Adjustments…", shortcutText: "Ctrl+Alt+A", shortcut: { key: "a", ctrl: true, alt: true }, enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "adjustments" }) },
  { id: "levels", label: "Levels…", shortcutText: "Ctrl+L", shortcut: { key: "l", ctrl: true }, enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "levels" }) },
  { id: "curves", label: "Curves…", shortcutText: "Ctrl+M", shortcut: { key: "m", ctrl: true }, enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "curves" }) },
  { id: "brightness", label: "Brightness…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "brightness", label: "Brightness" } }) },
  { id: "contrast", label: "Contrast…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "contrast", label: "Contrast" } }) },
  { id: "gamma", label: "Gamma…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "gamma", label: "Gamma" } }) },
  { id: "saturation", label: "Saturation…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "saturation", label: "Saturation" } }) },
  { id: "exposure", label: "Exposure…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "exposure", label: "Exposure" } }) },
  { id: "hue", label: "Hue…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "hue", label: "Hue" } }) },
  { id: "temperature", label: "Temperature…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "temperature", label: "Temperature" } }) },

  // Filter
  { id: "gaussianBlur", label: "Gaussian Blur…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "gaussianBlur", label: "Gaussian Blur" } }) },
  { id: "meanBlur", label: "Mean Blur…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "meanBlur", label: "Mean Blur" } }) },
  { id: "medianFilter", label: "Median Filter…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "medianFilter", label: "Median Filter" } }) },
  { id: "sharpen", label: "Sharpen…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "sharpen", label: "Sharpen" } }) },
  { id: "laplacian", label: "Laplacian…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "laplacian", label: "Laplacian" } }) },
  { id: "sobel", label: "Sobel…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "sobel", label: "Sobel" } }) },
  { id: "prewitt", label: "Prewitt…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "prewitt", label: "Prewitt" } }) },
  { id: "gaussianNoise", label: "Gaussian Noise…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "noiseGeneration", label: "Noise Generation", values: { noiseType: 0, amount: 15, variance: 25, seed: 0 } } }) },
  { id: "uniformNoise", label: "Uniform Noise…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "noiseGeneration", label: "Noise Generation", values: { noiseType: 1, amount: 25, variance: 25, seed: 0 } } }) },
  { id: "saltPepperNoise", label: "Salt & Pepper Noise…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "noiseGeneration", label: "Noise Generation", values: { noiseType: 2, saltProb: 3, pepperProb: 3, seed: 0 } } }) },
  { id: "arithmeticMean", label: "Arithmetic Mean…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "arithmeticMean", label: "Arithmetic Mean" } }) },
  { id: "geometricMean", label: "Geometric Mean…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "geometricMean", label: "Geometric Mean" } }) },
  { id: "contraHarmonicMean", label: "Contra-Harmonic Mean…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "contraHarmonicMean", label: "Contra-Harmonic Mean" } }) },
  { id: "alphaTrimmedMean", label: "Alpha-Trimmed Mean…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "alphaTrimmedMean", label: "Alpha-Trimmed Mean" } }) },
  { id: "wienerFilter", label: "Wiener Filter…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "wienerFilter", label: "Wiener Filter" } }) },

  // View
  { id: "zoomIn", label: "Zoom In", shortcutText: "Ctrl+=", shortcut: { key: "=", ctrl: true }, run: zoomToPoint(1.3) },
  { id: "zoomOut", label: "Zoom Out", shortcutText: "Ctrl+-", shortcut: { key: "-", ctrl: true }, run: zoomToPoint(1 / 1.3) },
  { id: "fitToScreen", label: "Fit to Screen", shortcutText: "Ctrl+0", shortcut: { key: "0", ctrl: true }, run: () => runtime.canvas?.fitToScreen() },
  { id: "actualSize", label: "100%", shortcutText: "Ctrl+1", shortcut: { key: "1", ctrl: true }, run: () => runtime.canvas?.zoom100() },
  { id: "compare.toggle", label: "Toggle Before/After", shortcutText: "Ctrl+Alt+B", shortcut: { key: "b", ctrl: true, alt: true }, enabled: () => !!useEditorStore.getState().doc && !useEditorStore.getState().view3d, run: () => useEditorStore.getState().setCompare(!useEditorStore.getState().compare) },

  // Layer
  { id: "newLayer", label: "New Image Layer", enabled: hasDoc, run: () => { const e = engine(); const d = e?.doc(); if (!e || !d) return; e.addLayer(createBlankImageLayer("Layer", d.width, d.height, "transparent"), "New Layer"); } },
  { id: "flattenImage", label: "Flatten Image", enabled: hasDoc, run: () => engine()?.flattenImage() },
  { id: "imageSize", label: "Image Size…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "imageSize" }) },
  { id: "canvasSize", label: "Canvas Size…", enabled: hasDoc, run: () => useEditorStore.getState().openDialog({ name: "canvasSize" }) },
  { id: "cropApply", label: "Crop", enabled: () => !!engine()?.getCropRect(), run: () => engine()?.applyCropFromTool() },
  { id: "rasterize", label: "Rasterize Layer", enabled: () => { const d = engine()?.doc(); return !!d && useEditorStore.getState().selectedIds.some((id) => d.getLayer(id)?.type !== "image"); }, run: () => engine()?.rasterizeSelected() },
  { id: "alignLeft", label: "Align Left", enabled: () => useEditorStore.getState().selectedIds.length > 0, run: () => engine()?.alignLayers("left") },
  { id: "alignHCenter", label: "Align Horizontal Centers", enabled: () => useEditorStore.getState().selectedIds.length > 0, run: () => engine()?.alignLayers("hcenter") },
  { id: "alignRight", label: "Align Right", enabled: () => useEditorStore.getState().selectedIds.length > 0, run: () => engine()?.alignLayers("right") },
  { id: "alignTop", label: "Align Top", enabled: () => useEditorStore.getState().selectedIds.length > 0, run: () => engine()?.alignLayers("top") },
  { id: "alignVCenter", label: "Align Vertical Centers", enabled: () => useEditorStore.getState().selectedIds.length > 0, run: () => engine()?.alignLayers("vcenter") },
  { id: "alignBottom", label: "Align Bottom", enabled: () => useEditorStore.getState().selectedIds.length > 0, run: () => engine()?.alignLayers("bottom") },
  { id: "distributeH", label: "Distribute Horizontally", enabled: () => useEditorStore.getState().selectedIds.length > 0, run: () => engine()?.distributeLayers("h") },
  { id: "distributeV", label: "Distribute Vertically", enabled: () => useEditorStore.getState().selectedIds.length > 0, run: () => engine()?.distributeLayers("v") },
  { id: "rotateCW", label: "Rotate 90° CW", enabled: hasDoc, run: () => engine()?.rotateDocument90(true) },
  { id: "rotateCCW", label: "Rotate 90° CCW", enabled: hasDoc, run: () => engine()?.rotateDocument90(false) },
  { id: "flipH", label: "Flip Horizontal", enabled: hasDoc, run: () => engine()?.flipDocument(true) },
  { id: "flipV", label: "Flip Vertical", enabled: hasDoc, run: () => engine()?.flipDocument(false) },

  // AI
  { id: "ai.togglePanel", label: "Toggle AI Panel", shortcutText: "Ctrl+Shift+A", shortcut: { key: "a", ctrl: true, shift: true }, run: () => useEditorStore.getState().togglePanel("ai") },
  { id: "ai.analyzeImage", label: "AI Analysis (local)", enabled: hasDoc, run: () => { void runAiCommand("analyzeImage"); } },
  { id: "ai.removeBackground", label: "AI Remove Background", enabled: hasDoc, run: () => { void runAiCommand("removeBackground"); } },
  { id: "ai.selectSubject", label: "AI Select Subject", enabled: hasDoc, run: () => { void runAiCommand("selectSubject"); } },
  { id: "ai.upscale", label: "AI Upscale 2x", enabled: hasDoc, run: () => { void runAiCommand("upscale"); } },
  { id: "ai.denoise", label: "AI Denoise", enabled: hasDoc, run: () => { void runAiCommand("denoise"); } },
  { id: "ai.sharpen", label: "AI Sharpen", enabled: hasDoc, run: () => { void runAiCommand("sharpen"); } },
  { id: "ai.generate", label: "AI Generate Image", enabled: hasDoc, run: () => { void runAiCommand("generateImage"); } },
  { id: "product.togglePanel", label: "Toggle Product Panel", run: () => useEditorStore.getState().togglePanel("product") },
  { id: "product.importImage", label: "Import Product Image…", enabled: hasDoc, run: () => { const input = document.createElement("input"); input.type = "file"; input.accept = "image/png,image/jpeg,image/webp"; input.onchange = () => { if (input.files?.[0]) void engine()?.importProductFile(input.files[0]); }; input.click(); } },
];

export function findCommand(id: string): Command | undefined {
  return COMMANDS.find((c) => c.id === id) ?? TOOL_SHORTCUTS.find((c) => c.id === id);
}

export function shortcutTextFor(id: string): string | undefined {
  return findCommand(id)?.shortcutText;
}

export function commandEnabled(id: string): boolean {
  const c = findCommand(id);
  if (!c || !c.enabled) return true;
  return c.enabled();
}