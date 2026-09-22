import { useRef, useEffect, type ReactNode } from "react";
import { createCanvasEngine } from "../../editor/canvas/canvasEngine";
import { runtime } from "../../editor/core/runtime";

const RASTER_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;

function findImageFile(files: FileList | readonly File[]): File | null {
  for (const f of files) {
    if (f.type.startsWith("image/") || RASTER_EXT_RE.test(f.name)) return f;
  }
  return null;
}

export function CanvasHost({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ReturnType<typeof createCanvasEngine> | null>(null);

  useEffect(() => {
    if (!ref.current || engineRef.current) return;
    engineRef.current = createCanvasEngine(ref.current);
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  return (
    <div
      className="vs-canvas-area"
      ref={ref}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const file = findImageFile(e.dataTransfer.files);
        if (file) void runtime.engine?.importImageFile(file);
      }}
    >
      {children}
    </div>
  );
}