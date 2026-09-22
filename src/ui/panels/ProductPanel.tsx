import { useCallback, useEffect, useRef, useState } from "react";
import { PanelShell } from "./PanelShell";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import { pixelStore } from "../../editor/core/document";
import type { ImageLayer, ProductLightingValues, LayerTransform } from "../../editor/core/types";
import { emptyProductLighting } from "../../editor/core/types";
import type { AIImageData, AIOperation } from "../../ai/types";
import { aiService, AI_PROVIDER_LABELS } from "../../ai/services/AIService";
import { AIError } from "../../ai/core/AIError";
import { paramsForOp } from "../../ai/commands/aiCommands";
import { analyzeBackgroundLocal, suggestColorMatch } from "../../editor/product/productPipeline";
import type { ContactShadowSettings, ReflectionSettings, MaskRefineSettings } from "../../editor/product/productPipeline";
import { t } from "../../i18n";

const DEFAULT_SHADOW: ContactShadowSettings = { opacity: 0.5, blur: 8, distance: 24, angle: 90, spread: 0, tinted: 0.15 };
const DEFAULT_REFLECTION: ReflectionSettings = { opacity: 0.45, blur: 4, offset: 8, fade: 0.35, perspective: 1 };

export function ProductPanel() {
  const hasDoc = useEditorStore((s) => !!s.doc);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const aiJobs = useEditorStore((s) => s.aiJobs);
  const [, force] = useState(0);
  const engine = runtime.engine;

  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [lighting, setLighting] = useState<ProductLightingValues>(emptyProductLighting());
  const [refine, setRefine] = useState<MaskRefineSettings>({ feather: 0, smooth: 0, spread: 0 });
  const [shadow, setShadow] = useState<ContactShadowSettings>({ ...DEFAULT_SHADOW });
  const [refl, setRefl] = useState<ReflectionSettings>({ ...DEFAULT_REFLECTION });
  const fileRef = useRef<HTMLInputElement>(null);

  const isMock = aiService.activeProviderId() === "mock" && aiService.providerAvailable();
  const providerReason = aiService.providerReason();
  const supportsOp = useCallback(
    (op: AIOperation) => aiService.supports(op),
    [aiJobs]
  );

  const syncFromProduct = useCallback((product: ImageLayer | undefined) => {
    if (product?.product?.lighting) setLighting({ ...product.product.lighting });
    else setLighting(emptyProductLighting());
  }, []);
  void force;

  const products: ImageLayer[] = engine.productLayers();
  const selProductId = selectedIds.find((id) => engine.isProductLayer(id));
  const product: ImageLayer | undefined =
    (selProductId ? engine.doc()?.getLayer(selProductId) : products[products.length - 1]) as ImageLayer | undefined;

  const shadowLayer: ImageLayer | undefined = (() => {
    if (!engine.doc()) return undefined;
    return engine
      .doc()!
      .layers.find((l) => l.type === "image" && (l as ImageLayer).shadow?.productLayerId === product?.id && (l as ImageLayer).shadow?.mode === "shadow") as ImageLayer | undefined;
  })();
  const reflLayer: ImageLayer | undefined = (() => {
    if (!engine.doc()) return undefined;
    return engine
      .doc()!
      .layers.find((l) => l.type === "image" && (l as ImageLayer).shadow?.productLayerId === product?.id && (l as ImageLayer).shadow?.mode === "reflection") as ImageLayer | undefined;
  })();

  useEffect(() => {
    syncFromProduct(product);
    if (shadowLayer?.shadow) setShadow({ opacity: shadowLayer.shadow.opacity, blur: shadowLayer.shadow.blur, distance: shadowLayer.shadow.distance, angle: shadowLayer.shadow.angle, spread: shadowLayer.shadow.spread, tinted: shadowLayer.shadow.tinted });
    if (reflLayer?.shadow) setRefl({ opacity: reflLayer.shadow.opacity, blur: reflLayer.shadow.blur, offset: reflLayer.shadow.distance, fade: 0.35, perspective: 1 });
  }, [product?.id, shadowLayer?.id, reflLayer?.id, syncFromProduct]);

  const scene = (): HTMLCanvasElement | null => {
    const c = engine.getComposite();
    return c && c.width > 0 && c.height > 0 ? c : null;
  };

  const runSceneOp = useCallback(
    async (op: AIOperation) => {
      setError(null);
      setStatus(null);
      const img = scene();
      if (!img) {
        setError("No image available.");
        return;
      }
      setBusy(true);
      try {
        const sceneCanvas = scene();
        if (!sceneCanvas) {
          setError("No image available.");
          return;
        }
        const img: AIImageData = { canvas: sceneCanvas, name: "Composite", width: sceneCanvas.width, height: sceneCanvas.height };
        const result = await aiService.run({ operation: op, image: img, selection: null, params: paramsForOp(op, "") });
        applyStructured(op, result);
      } catch (err) {
        setError(AIError.userSafe(err));
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [product?.id]
  );

  const applyStructured = useCallback(
    (op: AIOperation, result: { structured: Record<string, unknown> | null }) => {
      const s = result.structured as Partial<{ lighting: Partial<ProductLightingValues>; background: { floorYRatio?: number; suggestedShadow?: Partial<ContactShadowSettings> }; surface: { floorYRatio?: number }; shadow: Partial<ContactShadowSettings>; perspective: { skewX?: number; skewY?: number }; explanation?: string | null }> | null;
      switch (op) {
        case "estimateLighting":
        case "matchLighting": {
          if (s?.lighting) {
            setLighting((prev) => ({ ...prev, ...s.lighting! }));
            setStatus("Lighting suggested by AI — review and press Apply.");
          } else setStatus("AI returned no lighting values.");
          break;
        }
        case "analyzeBackground": {
          if (s?.background?.floorYRatio !== undefined || s?.background?.suggestedShadow) {
            setStatus("Background analyzed — shadow suggestion available.");
          }
          if (s?.background?.suggestedShadow) setShadow((prev) => ({ ...prev, ...(s!.background!.suggestedShadow ?? {}) }));
          if (s?.explanation) setStatus(s.explanation);
          break;
        }
        case "detectSurface": {
          if (s?.surface?.floorYRatio !== undefined) setStatus(`Surface floor line ≈ ${Math.round((s.surface.floorYRatio ?? 0.8) * 100)}% of height.`);
          break;
        }
        case "generateShadow": {
          if (s?.shadow) {
            setShadow((prev) => ({ ...prev, ...s.shadow! }));
            setStatus("Shadow suggested by AI — press Add Contact Shadow.");
          } else setStatus("AI returned no shadow values.");
          break;
        }
        case "matchPerspective": {
          if (product && (s?.perspective?.skewX !== undefined || s?.perspective?.skewY !== undefined)) {
            engine.applyProductPerspectiveSkew(
              product.id,
              s.perspective?.skewX ?? 0,
              s.perspective?.skewY ?? 0,
              { ai: true, operation: "matchPerspective", provider: aiService.activeProviderId() }
            );
            setStatus("Perspective keystone applied from AI suggestion.");
          } else setStatus("AI returned no perspective values.");
          break;
        }
        default:
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [product?.id]
  );

  const runProductCutout = useCallback(async () => {
    if (!product) return;
    setError(null);
    const pixels = pixelStore.get(product.imageId);
    if (!pixels) {
      setError("Product pixels missing.");
      return;
    }
    const img: AIImageData = { canvas: pixels, layerId: product.id, name: product.name, width: pixels.width, height: pixels.height };
    setBusy(true);
    try {
      const result = await aiService.run({ operation: "segmentProduct", image: img, selection: null, params: paramsForOp("segmentProduct", "") });
      if (result.selection) {
        engine.setProductMaskFromAiSelection(product.id, result.selection, {
          operation: "segmentProduct",
          provider: result.origin === "mock" ? "mock" : result.provider,
          model: result.model,
          prompt: null,
        });
        setStatus("Product mask generated and applied. Refine it below.");
      } else setStatus("AI produced no mask — use Manual fallback.");
    } catch (err) {
      setError(AIError.userSafe(err));
    } finally {
      setBusy(false);
    }
  }, [product?.id]);

  const smartPlace = useCallback(() => {
    if (!product) return;
    const bg = scene();
    if (!bg) return;
    const analysis = analyzeBackgroundLocal(bg);
    const floorRatio = analysis.background.floorYRatio;
    const d = engine.doc();
    if (!d) return;
    const floorY = d.height * floorRatio;
    const w = product.transform.width;
    const h = product.transform.height;
    const scale = Math.max(0.3, Math.min(1.5, (d.height * (1 - floorRatio) * 0.7) / h));
    const plan = { x: (d.width - w * scale) / 2, y: floorY - h * scale, width: w * scale, height: h * scale, rotation: 0 };
    engine.autoPlaceProduct(product.id, plan, { ai: false, operation: null, provider: "local" });
    setStatus("Smart placement applied from local scene analysis.");
  }, [product?.id]);

  const aiPlace = useCallback(async () => {
    await runSceneOp("analyzeBackground");
  }, [runSceneOp]);

  const autoMatchColor = useCallback(() => {
    if (!product) return;
    const bg = scene();
    const pixels = pixelStore.get(product.imageId);
    if (!bg || !pixels) return;
    const values = suggestColorMatch(bg, pixels);
    engine.applyProductColorMatch(product.id, values);
    setStatus("Color matched to scene statistics (local, non-AI).");
  }, [product?.id]);

  const updateTransform = useCallback(
    (patch: Partial<LayerTransform>) => {
      if (!product) return;
      engine.applyProductPlacement(product.id, { ...product.transform, ...patch }, "Transform Product");
    },
    [product?.id]
  );

  const aiBusy = busy || aiJobs.some((j) => j.status === "queued" || j.status === "running");

  return (
    <PanelShell id="product" title={t("panelProduct")} right={<span className={`vs-ai-dot ${aiService.providerAvailable() ? "on" : "off"}`} title={providerReason} />}>
      <div className="vs-product">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f || !hasDoc) return;
            setImporting(true);
            setError(null);
            const id = await engine.importProductFile(f);
            if (id) {
              useEditorStore.getState().setSelected([id]);
              setStatus("Product imported.");
            }
            setImporting(false);
            e.target.value = "";
          }}
        />
        <button className="vs-btn primary" disabled={!hasDoc || importing} onClick={() => fileRef.current?.click()}>
          {importing ? t("productImporting") : t("productImport")}
        </button>
        {!hasDoc && <div className="vs-product-hint">{t("productNoDoc")}</div>}
        {hasDoc && !product && <div className="vs-product-hint">{t("productNoProduct")}</div>}
        {product && (
          <div className="vs-product-layerinfo">
            {t("productProductLayer")}: <strong>{product.name}</strong>
          </div>
        )}

        {isMock && <div className="vs-ai-mock-badge">{t("productAiMockBadge")}</div>}

        {product && (
          <>
            <div className="vs-product-section-title">{t("productAiBanner")}</div>
            <div className="vs-ai-status">
              <strong>{AI_PROVIDER_LABELS[aiService.activeProviderId()] ?? aiService.activeProviderId()}</strong>
              <span className={`vs-ai-status-pill ${aiService.providerAvailable() ? "ok" : "bad"}`}>
                {aiService.providerAvailable() ? t("aiAvailable") : t("aiUnavailable")}
              </span>
            </div>
            {!aiService.providerAvailable() && <div className="vs-product-hint">{t("productAiUnavailable")} — {providerReason}</div>}

            <div className="vs-product-section-title">{t("productMaskTitle")}</div>
            <div className="vs-product-stack">
              <button className="vs-btn primary" disabled={!supportsOp("segmentProduct") || aiBusy} onClick={() => void runProductCutout()}>
                {t("productRemoveBg")}
              </button>
              <button
                className="vs-btn"
                title={t("productMaskFromSelectionHint")}
                onClick={() => engine.setProductMaskFromEditorSelection(product.id)}
              >
                {t("productMaskFromSelection")} (manual)
              </button>
              {product.mask && (
                <button className="vs-btn" onClick={() => engine.clearProductMask(product.id)}>
                  {t("productClearMask")}
                </button>
              )}
            </div>
            {!supportsOp("segmentProduct") && <div className="vs-product-hint">{t("productAiCapabilityMissing")} · {t("productAiManualFallback")}</div>}

            {product.mask && (
              <>
                <div className="vs-product-section-title">{t("productRefineTitle")}</div>
                <SliderRow label={t("productFeather")} value={refine.feather} min={0} max={100} onChange={(v) => setRefine({ ...refine, feather: v })} />
                <SliderRow label={t("productSmooth")} value={refine.smooth} min={0} max={24} onChange={(v) => setRefine({ ...refine, smooth: v })} />
                <SliderRow label={t("productSpread")} value={refine.spread} min={-24} max={24} onChange={(v) => setRefine({ ...refine, spread: v })} />
                <button className="vs-btn" onClick={() => engine.refineProductMask(product.id, refine)}>
                  {t("productRefineApply")}
                </button>
                <button className="vs-btn danger" onClick={() => engine.burnProductCutoutToPixels(product.id)}>
                  {t("productBurnCutout")}
                </button>
              </>
            )}

            <div className="vs-product-section-title">{t("productPlacementTitle")}</div>
            <div className="vs-product-grid">
              <NumRow label={t("productPosX")} value={Math.round(product.transform.x)} onChange={(v) => updateTransform({ x: v })} />
              <NumRow label={t("productPosY")} value={Math.round(product.transform.y)} onChange={(v) => updateTransform({ y: v })} />
              <NumRow label={t("productWidth")} value={Math.round(product.transform.width)} onChange={(v) => updateTransform({ width: Math.max(1, v) })} />
              <NumRow label={t("productHeight")} value={Math.round(product.transform.height)} onChange={(v) => updateTransform({ height: Math.max(1, v) })} />
            </div>
            <SliderRow label={t("productRotation")} value={product.transform.rotation} min={-180} max={180} onChange={(v) => updateTransform({ rotation: v })} />
            <SliderRow label={t("productPerspectiveX")} value={product.transform.skewX} min={-60} max={60} onChange={(v) => updateTransform({ skewX: v })} />
            <SliderRow label={t("productPerspectiveY")} value={product.transform.skewY} min={-60} max={60} onChange={(v) => updateTransform({ skewY: v })} />
            <div className="vs-product-stack row">
              <button className="vs-btn" onClick={() => engine.flipLayer(product.id, true)}>{t("productFlipH")}</button>
              <button className="vs-btn" onClick={() => engine.flipLayer(product.id, false)}>{t("productFlipV")}</button>
            </div>
            <div className="vs-product-stack row">
              <button className="vs-btn" onClick={smartPlace}>{t("productSmartPlace")}</button>
              <button className="vs-btn" disabled={!supportsOp("analyzeBackground") || aiBusy} onClick={() => void aiPlace()}>
                {t("productAiPlace")}
              </button>
            </div>

            <div className="vs-product-section-title">{t("productLightingTitle")}</div>
            <SliderRow label={t("productExposure")} value={lighting.exposure} min={-1} max={1} step={0.05} onChange={(v) => setLighting({ ...lighting, exposure: v })} />
            <SliderRow label={t("productBrightness")} value={lighting.brightness} min={-100} max={100} onChange={(v) => setLighting({ ...lighting, brightness: v })} />
            <SliderRow label={t("productContrast")} value={lighting.contrast} min={-100} max={100} onChange={(v) => setLighting({ ...lighting, contrast: v })} />
            <SliderRow label={t("productTemperature")} value={lighting.temperature} min={-100} max={100} onChange={(v) => setLighting({ ...lighting, temperature: v })} />
            <SliderRow label={t("productTint")} value={lighting.tint} min={-100} max={100} onChange={(v) => setLighting({ ...lighting, tint: v })} />
            <SliderRow label={t("productSaturation")} value={lighting.saturation} min={-100} max={100} onChange={(v) => setLighting({ ...lighting, saturation: v })} />
            <SliderRow label={t("productHighlights")} value={lighting.highlights} min={-100} max={100} onChange={(v) => setLighting({ ...lighting, highlights: v })} />
            <SliderRow label={t("productShadows")} value={lighting.shadows} min={-100} max={100} onChange={(v) => setLighting({ ...lighting, shadows: v })} />
            <div className="vs-product-stack row">
              <button className="vs-btn primary" onClick={() => engine.applyProductLighting(product.id, lighting)}>{t("productApply")}</button>
              <button className="vs-btn" disabled={!product.product?.sourceImageId} onClick={() => engine.resetProductLighting(product.id)}>{t("productReset")}</button>
            </div>
            <div className="vs-product-stack row">
              <button className="vs-btn" disabled={!supportsOp("estimateLighting") || aiBusy} onClick={() => void runSceneOp("estimateLighting")}>
                {t("productAiSuggest")}
              </button>
              <button className="vs-btn" disabled={!supportsOp("matchLighting") || aiBusy} onClick={() => void runSceneOp("matchLighting")}>
                {t("productAiMatchLighting")}
              </button>
            </div>

            <div className="vs-product-section-title">{t("productColorTitle")}</div>
            <div className="vs-product-stack">
              <button className="vs-btn" onClick={autoMatchColor}>{t("productAutoMatch")}</button>
            </div>

            <div className="vs-product-section-title">{t("productShadowTitle")}</div>
            {shadowLayer?.name && <div className="vs-product-layerinfo">{t("productProductLayer")}: {shadowLayer.name}</div>}
            <SliderRow label={t("productShadowOpacity")} value={shadow.opacity} min={0} max={1} step={0.05} onChange={(v) => setShadow({ ...shadow, opacity: v })} />
            <SliderRow label={t("productShadowBlur")} value={shadow.blur} min={0} max={60} onChange={(v) => setShadow({ ...shadow, blur: v })} />
            <SliderRow label={t("productShadowDistance")} value={shadow.distance} min={0} max={200} onChange={(v) => setShadow({ ...shadow, distance: v })} />
            <SliderRow label={t("productShadowAngle")} value={shadow.angle} min={0} max={359} onChange={(v) => setShadow({ ...shadow, angle: v })} />
            <SliderRow label={t("productSpread")} value={shadow.spread} min={-50} max={50} onChange={(v) => setShadow({ ...shadow, spread: v })} />
            <SliderRow label={t("productShadowTinted")} value={shadow.tinted} min={0} max={1} step={0.05} onChange={(v) => setShadow({ ...shadow, tinted: v })} />
            <div className="vs-product-stack row">
              <button className="vs-btn primary" onClick={() => engine.addContactShadow(product.id, shadow)}>{t("productAddShadow")}</button>
              {shadowLayer && <button className="vs-btn" onClick={() => engine.updateContactShadow(shadowLayer.id, shadow)}>{t("productShadowUpdate")}</button>}
            </div>
            <button className="vs-btn" disabled={!supportsOp("generateShadow") || aiBusy} onClick={() => void runSceneOp("generateShadow")}>
              {t("productAiShadow")}
            </button>

            <div className="vs-product-section-title">{t("productReflectionTitle")}</div>
            <SliderRow label={t("productReflectionOpacity")} value={refl.opacity} min={0} max={1} step={0.05} onChange={(v) => setRefl({ ...refl, opacity: v })} />
            <SliderRow label={t("productReflectionBlur")} value={refl.blur} min={0} max={60} onChange={(v) => setRefl({ ...refl, blur: v })} />
            <SliderRow label={t("productReflectionOffset")} value={refl.offset} min={0} max={200} onChange={(v) => setRefl({ ...refl, offset: v })} />
            <SliderRow label={t("productReflectionFade")} value={refl.fade} min={0.05} max={1} step={0.05} onChange={(v) => setRefl({ ...refl, fade: v })} />
            <SliderRow label={t("productReflectionPerspective")} value={refl.perspective} min={0.5} max={1} step={0.05} onChange={(v) => setRefl({ ...refl, perspective: v })} />
            <div className="vs-product-stack row">
              <button className="vs-btn primary" onClick={() => engine.addReflection(product.id, refl)}>{t("productAddReflection")}</button>
              {reflLayer && <button className="vs-btn" onClick={() => engine.updateContactShadow(reflLayer.id, { opacity: refl.opacity, blur: refl.blur, distance: refl.offset })}>{t("productReflectionUpdate")}</button>}
            </div>

            <div className="vs-product-section-title">{t("productPerspectiveTitle")}</div>
            <button className="vs-btn" disabled={!supportsOp("matchPerspective") || aiBusy} onClick={() => void runSceneOp("matchPerspective")}>
              {t("productMatchPerspective")}
            </button>
          </>
        )}

        {error && <div className="vs-ai-error">{error}</div>}
        {status && <div className="vs-ai-result-text">{status}</div>}
      </div>
    </PanelShell>
  );
}

function SliderRow(props: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  const num = Number.isFinite(props.value) ? props.value : props.min;
  return (
    <div className="vs-product-slider">
      <span className="vs-product-slider-label">{props.label}</span>
      <input
        type="range"
        className="vs-input"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={num}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span className="vs-product-slider-value">{Math.round(num * 1000) / 1000}</span>
    </div>
  );
}

function NumRow(props: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="vs-product-num">
      <span>{props.label}</span>
      <input
        type="number"
        className="vs-input"
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value) || 0)}
      />
    </label>
  );
}