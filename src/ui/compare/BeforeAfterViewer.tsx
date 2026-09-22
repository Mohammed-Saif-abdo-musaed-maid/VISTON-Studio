import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import { t, getDirection } from "../../i18n";
import {
  CompareMode,
  CompareCamera,
  compareFitForMode,
  zoomCompareCamera,
  panCompareCamera,
  clampSplitPercent,
  splitPaneFraction,
  clampOverlayOpacity,
  effectiveMode,
  drawCompareFrame,
} from "../../editor/compare/compareModel";

type ModeOpt = { id: CompareMode; key: string; label: string };

export function BeforeAfterViewer() {
  const compare = useEditorStore((s) => s.compare);
  const doc = useEditorStore((s) => s.doc);

  const [mode, setMode] = useState<CompareMode>("split");
  const [splitValue, setSplitValue] = useState(50);
  const [opacity, setOpacity] = useState(50);
  const [beforeUnavailable, setBeforeUnavailable] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<CompareCamera>({ x: 0, y: 0, zoom: 1 });
  const beforeRef = useRef<HTMLCanvasElement | null>(null);
  const beforeSizeRef = useRef<{ w: number; h: number } | null>(null);
  const afterRef = useRef<HTMLCanvasElement | null>(null);
  const lastDocRef = useRef<typeof doc>(null);
  const fittedRef = useRef<typeof doc>(null);
  const lastVersionRef = useRef(-1);
  const panningRef = useRef<{ startX: number; startY: number; cam: CompareCamera } | null>(null);
  const lastAvailRef = useRef<boolean | null>(null);
  const retryAtRef = useRef(0);

  const modeRef = useRef<CompareMode>(mode);
  modeRef.current = mode;

  const splitPctRef = useRef(clampSplitPercent(splitValue));
  splitPctRef.current = clampSplitPercent(splitValue);

  const setModeRef = (m: CompareMode) => {
    setMode(m);
    requestAnimationFrame(() => requestRefit());
  };

  const modeOpts: ModeOpt[] = [
    { id: "sbs", key: "beforeAfterModeSbs", label: t("beforeAfterModeSbs") },
    { id: "split", key: "beforeAfterModeSplit", label: t("beforeAfterModeSplit") },
    { id: "overlay", key: "beforeAfterModeOverlay", label: t("beforeAfterModeOverlay") },
  ];

  const fitNow = useCallback(() => {
    const currentDoc = useEditorStore.getState().doc;
    const container = containerRef.current;
    if (!currentDoc || !container) return;
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    cameraRef.current = compareFitForMode(modeRef.current, currentDoc.width, currentDoc.height, width, height, 48, splitPctRef.current);
    fittedRef.current = currentDoc;
  }, []);

  const requestRefit = useCallback(() => {
    fitNow();
  }, [fitNow]);

  function containerSize(): { w: number; h: number } {
    const container = containerRef.current;
    const rect = container?.getBoundingClientRect();
    return { w: Math.max(1, Math.floor(rect?.width ?? 1)), h: Math.max(1, Math.floor(rect?.height ?? 1)) };
  }

  function drawFrame(): void {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const { w, h } = containerSize();
    const bw = Math.max(1, Math.round(w * dpr));
    const bh = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const currentDoc = useEditorStore.getState().doc;
    if (!currentDoc) {
      ctx.fillStyle = "#1b1e24";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const beforeSize = beforeSizeRef.current;
    drawCompareFrame(ctx, {
      before: beforeRef.current,
      after: afterRef.current,
      camera: cameraRef.current,
      docW: currentDoc.width,
      docH: currentDoc.height,
      beforeW: beforeSize?.w ?? currentDoc.width,
      beforeH: beforeSize?.h ?? currentDoc.height,
      mode,
      splitValue,
      overlayOpacity: opacity,
      viewW: w,
      viewH: h,
      dpr,
    });
    const handle = handleRef.current;
    if (handle) handle.style.left = `${(splitPctRef.current / 100) * w}px`;
  }

  // Keep the render loop pinned to the freshest draw closure (mode/slider/opacity).
  const drawFrameRef = useRef<() => void>(drawFrame);
  drawFrameRef.current = drawFrame;

  // ── render loop: resize backing canvas, refit on doc/size change, live After via version ──
  useEffect(() => {
    if (!compare) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const canvas = canvasRef.current;
      const currentDoc = useEditorStore.getState().doc;
      const engine = runtime.engine;
      if (!canvas || !engine || !currentDoc) return;

      if (currentDoc !== fittedRef.current) {
        fitNow();
      }

      const now = performance.now();
      const docChanged = currentDoc !== lastDocRef.current;
      const versionChanged = engine.version !== lastVersionRef.current;
      const refresh = docChanged || versionChanged;
      const retryDue = now >= retryAtRef.current;
      if (refresh || retryDue) {
        if (refresh) {
          if (docChanged) {
            beforeRef.current = null;
            beforeSizeRef.current = null;
          }
          lastDocRef.current = currentDoc;
          lastVersionRef.current = engine.version;
          afterRef.current = engine.getComposite();
        }
        const info = engine.getBeforeRefInfo();
        if (info?.canvas) {
          beforeRef.current = info.canvas;
          beforeSizeRef.current = { w: info.docW, h: info.docH };
        }
        const avail = !!info?.canvas;
        retryAtRef.current = now + (avail ? 500 : 1000);
        if (lastAvailRef.current !== avail) {
          lastAvailRef.current = avail;
          setBeforeUnavailable(!avail);
        }
      }
      drawFrameRef.current();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [compare, fitNow]);

  // ── refit after container resize ──
  useEffect(() => {
    if (!compare) return;
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      fitNow();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [compare, fitNow]);

  // ── pointer interaction (pan + wheel zoom), same transform for both images ──
  function effectiveViewWidth(w: number): number {
    const eff = effectiveMode(modeRef.current, w);
    if (eff === "sbs") return w / 2;
    if (eff === "split") return w * splitPaneFraction(splitPctRef.current);
    return w;
  }

  const onCanvasPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    panningRef.current = {
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      cam: { ...cameraRef.current },
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onCanvasPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const pan = panningRef.current;
    if (!pan) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - rect.left - pan.startX;
    const dy = e.clientY - rect.top - pan.startY;
    const currentDoc = useEditorStore.getState().doc;
    if (!currentDoc) return;
    const { w, h } = containerSize();
    const effW = effectiveViewWidth(w);
    cameraRef.current = panCompareCamera(pan.cam, dx, dy, currentDoc.width, currentDoc.height, effW, h);
  };

  const onCanvasPointerUp = () => {
    panningRef.current = null;
  };

  const onCanvasWheel = (e: ReactWheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const currentDoc = useEditorStore.getState().doc;
    if (!currentDoc) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const { w, h } = containerSize();
    const effW = effectiveViewWidth(w);
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    cameraRef.current = zoomCompareCamera(
      cameraRef.current,
      currentDoc.width,
      currentDoc.height,
      effW,
      h,
      e.clientX - rect.left,
      e.clientY - rect.top,
      factor
    );
  };

  // ── split divider drag + keyboard ──
  const onHandlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      splitPctRef.current = clampSplitPercent(((ev.clientX - rect.left) / rect.width) * 100);
      setSplitValue(splitPctRef.current);
      fitNow();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onHandleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next = splitPctRef.current;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      next = clampSplitPercent(next + (e.key === "ArrowRight" ? 5 : -5));
    } else if (e.key === "Home") {
      e.preventDefault();
      next = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      next = 100;
    } else {
      return;
    }
    splitPctRef.current = next;
    setSplitValue(next);
    fitNow();
  };

  if (!compare || !doc) return null;

  const splitPct = clampSplitPercent(splitValue);
  const handlePx = (splitPct / 100) * containerSize().w;
  const effective = effectiveMode(mode, containerSize().w);
  const dir = getDirection();

  return (
    <div
      ref={containerRef}
      className="vs-compare-overlay"
      role="region"
      aria-label={t("beforeAfter")}
      dir={dir}
    >
      <canvas
        ref={canvasRef}
        className="vs-compare-canvas"
        role="application"
        aria-label={t("beforeAfter")}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onPointerCancel={onCanvasPointerUp}
        onWheel={onCanvasWheel}
      />

      <span className="vs-compare-badge vs-compare-badge-before">{t("beforeAfterBefore")}</span>
      <span className="vs-compare-badge vs-compare-badge-after">{t("beforeAfterAfter")}</span>

      {beforeUnavailable && (
        <div className="vs-compare-unavailable" role="status">
          {t("beforeAfterUnavailable")}
        </div>
      )}

      <div className="vs-compare-controls" role="toolbar" aria-label={t("beforeAfter")}>
        <div className="vs-compare-modes" role="group" aria-label={t("beforeAfterToggle")}>
          {modeOpts.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`vs-compare-mode-btn ${mode === opt.id ? "active" : ""}`}
              aria-pressed={mode === opt.id}
              aria-label={t(opt.key)}
              title={t(opt.key)}
              onClick={() => setModeRef(opt.id)}
            >
              {t(opt.key)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="vs-compare-fit-btn"
          aria-label={t("beforeAfterFit")}
          title={t("beforeAfterFit")}
          onClick={() => fitNow()}
        >
          ⌂
        </button>
        <button
          type="button"
          className="vs-compare-close-btn"
          aria-label={t("beforeAfterClose")}
          title={t("beforeAfterClose")}
          onClick={() => useEditorStore.getState().setCompare(false)}
        >
          ✕
        </button>
      </div>

      {effective === "split" && (
        <div
          className="vs-compare-handle"
          ref={handleRef}
          role="slider"
          tabIndex={0}
          aria-label={t("beforeAfterSplitValue")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(splitPct)}
          aria-valuetext={`${Math.round(splitPct)}%`}
          style={{ left: `${handlePx}px` }}
          onPointerDown={onHandlePointerDown}
          onKeyDown={onHandleKey}
        >
          <span className="vs-compare-handle-knob" aria-hidden="true" />
        </div>
      )}

      {effective === "overlay" && (
        <div className="vs-compare-opacity-bar">
          <label className="vs-compare-opacity-label" htmlFor="vs-compare-opacity">
            {t("beforeAfterOpacity")}
          </label>
          <input
            id="vs-compare-opacity"
            type="range"
            min={0}
            max={100}
            step={1}
            value={opacity}
            aria-label={t("beforeAfterOpacity")}
            onChange={(e) => setOpacity(clampOverlayOpacity(Number(e.target.value)))}
          />
          <span className="vs-compare-opacity-value">{Math.round(opacity)}%</span>
        </div>
      )}
    </div>
  );
}