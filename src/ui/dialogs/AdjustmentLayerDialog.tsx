import { useState, useEffect, useMemo, useCallback } from "react";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import {
  AdjustmentKind,
  AdjustmentParams,
  ADJUSTMENT_KINDS,
  ADJUSTMENT_LABELS,
} from "../../editor/core/types";
import { adjustmentLayerPreview } from "./adjustmentLayerPreview";

interface CurveRow { x: number; y: number; }

const AMOUNT_KINDS: ReadonlySet<AdjustmentKind> = new Set<AdjustmentKind>([
  "brightness", "contrast", "saturation", "hue", "temperature", "vibrance", "shadows", "highlights", "tint",
]);
const SPECIAL_AMOUNT: Partial<Record<AdjustmentKind, { min: number; max: number; step: number; unit: string }>> = {
  gamma: { min: 0.1, max: 5, step: 0.05, unit: "" },
  exposure: { min: -5, max: 5, step: 0.1, unit: " EV" },
  hue: { min: -180, max: 180, step: 1, unit: "°" },
};

const COLOR_LOOKUP_PRESETS = ["identity", "grayscale", "invert", "sepia"] as const;

const DEFAULT_CURVE: CurveRow[] = [
  { x: 0, y: 0 },
  { x: 64, y: 64 },
  { x: 128, y: 128 },
  { x: 192, y: 192 },
  { x: 255, y: 255 },
];

function defaultKindParams(kind: AdjustmentKind): AdjustmentParams {
  switch (kind) {
    case "levels": return { levels: { black: 0, mid: 1, white: 255 } };
    case "curves": return { curves: DEFAULT_CURVE.map((p) => [p.x, p.y]) };
    case "colorBalance": return { colorBalance: { shadows: 0, midtones: 0, highlights: 0 } };
    case "blackWhite": return { blackWhite: { red: 1, green: 1, blue: 1 } };
    case "channelMixer":
      return {
        channelMixer: {
          red: { r: 1, g: 0, b: 0 },
          green: { r: 0, g: 1, b: 0 },
          blue: { r: 0, g: 0, b: 1 },
        },
      };
    case "selectiveColor":
      return {
        selectiveColor: {
          reds: 0, yellows: 0, greens: 0, cyans: 0, blues: 0, magentas: 0, whites: 0, neutrals: 0, blacks: 0,
        },
      };
    case "gradientMap":
      return { gradientMap: { stops: [
        { pos: 0, color: "#000000" },
        { pos: 0.5, color: "#7f7f7f" },
        { pos: 1, color: "#ffffff" },
      ] } };
    case "colorLookup": return { colorLookup: { lut: "identity" } };
    default: return {};
  }
}

function kindNeedsParams(kind: AdjustmentKind): boolean {
  return kind === "levels" || kind === "curves" || kind === "colorBalance" || kind === "blackWhite"
    || kind === "channelMixer" || kind === "selectiveColor" || kind === "gradientMap" || kind === "colorLookup";
}

function SliderRow(props: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <div className="slider-row">
      <label style={{ minWidth: 78 }}>{props.label}</label>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value}
        onChange={(e) => props.onChange(+e.target.value)} />
      <span className="value">{props.unit ? `${Number(props.value.toFixed(2))}${props.unit}` : Number(props.value.toFixed(2))}</span>
    </div>
  );
}

export function AdjustmentLayerDialog() {
  const dialog = useEditorStore((s) => s.dialog);
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const engine = runtime.engine;

  const existingLayerId = (dialog?.payload?.layerId as string) ?? null;
  const existing = (() => {
    if (!existingLayerId) return null;
    const d = useEditorStore.getState().doc;
    const l = d?.getLayer(existingLayerId);
    return l && l.type === "adjustment" ? l : null;
  })();

  const [kind, setKind] = useState<AdjustmentKind>(existing?.adjustment ?? "levels");
  const [amount, setAmount] = useState<number>(existing?.amount ?? 1);
  const [params, setParams] = useState<AdjustmentParams>(existing?.params ?? defaultKindParams(existing?.adjustment ?? "levels"));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const resolvedParams = useMemo(() => (kindNeedsParams(kind) ? params : null), [kind, params]);
  const resolvedAmount = useMemo(() => (AMOUNT_KINDS.has(kind) || kind === "gamma" || kind === "exposure") ? amount : 1, [kind, amount]);

  useEffect(() => {
    const t = setTimeout(() => {
      const c = adjustmentLayerPreview(kind, resolvedParams, resolvedAmount);
      setPreviewUrl(c ? c.toDataURL() : null);
    }, 90);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, paramDigest(resolvedParams), resolvedAmount, existingLayerId]);

  const commit = useCallback(() => {
    if (!engine) return;
    if (existingLayerId && existing) {
      if (kindNeedsParams(kind)) engine.updateAdjustmentParams(existingLayerId, resolvedParams ?? {});
      else engine.setAdjustmentAmount(existingLayerId, resolvedAmount);
    } else {
      engine.addAdjustmentLayer(kind, resolvedParams, undefined, resolvedAmount);
    }
    closeDialog();
  }, [engine, existingLayerId, existing, kind, resolvedParams, resolvedAmount, closeDialog]);

  const bump = (n: CurveRow[], i: number, patch: Partial<CurveRow>): CurveRow[] => {
    const next = n.map((row, idx) => (idx === i ? { ...row, ...patch } : row));
    if (patch.x !== undefined) {
      for (let j = 1; j < next.length; j++) {
        const prev = next[j - 1]!;
        const cur = next[j]!;
        if (cur.x <= prev.x) cur.x = prev.x + 1;
      }
    }
    return next;
  };

  const setCurvePoint = (i: number) => (row: CurveRow) => {
    const pts = ((params.curves ?? []) as number[][]).map(([x, y]) => ({ x, y }));
    while (pts.length <= i) pts.push({ x: i * 64, y: i * 64 });
    const next = bump(pts, i, row);
    setParams((p) => ({ ...p, curves: next.map((r) => [Math.round(r.x), Math.round(r.y)]) }));
  };

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal vs-dialog-filter">
        <div className="vs-modal-header">
          <span>Adjustment Layer {existing ? "· Edit" : ""}</span>
          <button className="vs-btn" style={{ padding: "2px 8px", fontSize: 14 }} onClick={closeDialog}>×</button>
        </div>
        <div className="vs-modal-body">
          <div className="preview-area" style={{ minHeight: 120 }}>
            {previewUrl ? <img src={previewUrl} alt="Preview" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <div className="vs-spinner" />}
          </div>
          <div className="controls">
            <div className="slider-row">
              <label style={{ minWidth: 78 }}>Type</label>
              <select value={kind} onChange={(e) => {
                const k = e.target.value as AdjustmentKind;
                setKind(k);
                setParams(defaultKindParams(k));
              }} style={{ flex: 1 }}>
                {ADJUSTMENT_KINDS.map((k) => (
                  <option key={k} value={k}>{ADJUSTMENT_LABELS[k]}</option>
                ))}
              </select>
            </div>

            {(AMOUNT_KINDS.has(kind) || kind === "gamma" || kind === "exposure") && (
              <SliderRow
                label="Amount"
                value={amount}
                min={SPECIAL_AMOUNT[kind]?.min ?? -100}
                max={SPECIAL_AMOUNT[kind]?.max ?? 100}
                step={SPECIAL_AMOUNT[kind]?.step ?? 1}
                unit={SPECIAL_AMOUNT[kind]?.unit}
                onChange={setAmount}
              />
            )}

            {kind === "levels" && (
              <LevelsEditor params={params} setParams={setParams} />
            )}
            {kind === "colorBalance" && (
              <ColorBalanceEditor params={params} setParams={setParams} />
            )}
            {kind === "curves" && (
              <CurvesEditor row={(params.curves ?? DEFAULT_CURVE.map((p) => [p.x, p.y])) as number[][]} setRow={setCurvePoint} />
            )}
            {kind === "blackWhite" && (
              <BlackWhiteEditor params={params} setParams={setParams} />
            )}
            {kind === "channelMixer" && (
              <ChannelMixerEditor params={params} setParams={setParams} />
            )}
            {kind === "selectiveColor" && (
              <SelectiveColorEditor params={params} setParams={setParams} />
            )}
            {kind === "gradientMap" && (
              <GradientMapEditor params={params} setParams={setParams} />
            )}
            {kind === "colorLookup" && (
              <ColorLookupEditor params={params} setParams={setParams} />
            )}
          </div>
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn" onClick={closeDialog}>Cancel</button>
          <button className="vs-btn primary" onClick={commit}>
            {existing ? "Update" : "Add Layer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function paramDigest(p: AdjustmentParams | null): string {
  return JSON.stringify(p ?? {});
}

function LevelsEditor(props: { params: AdjustmentParams; setParams: (u: (p: AdjustmentParams) => AdjustmentParams) => void }) {
  const lv = props.params.levels ?? { black: 0, mid: 1, white: 255 };
  const set = (patch: Partial<typeof lv>) => props.setParams((p) => ({ ...p, levels: { ...lv, ...patch } }));
  return (
    <>
      <SliderRow label="Black" value={lv.black} min={0} max={255} step={1} onChange={(v) => set({ black: Math.min(v, lv.white - 1) })} />
      <SliderRow label="Mid" value={lv.mid} min={0.1} max={9.9} step={0.01} onChange={(v) => set({ mid: v })} />
      <SliderRow label="White" value={lv.white} min={0} max={255} step={1} onChange={(v) => set({ white: Math.max(v, lv.black + 1) })} />
    </>
  );
}

function ColorBalanceEditor(props: { params: AdjustmentParams; setParams: (u: (p: AdjustmentParams) => AdjustmentParams) => void }) {
  const cb = props.params.colorBalance ?? { shadows: 0, midtones: 0, highlights: 0 };
  const set = (patch: Partial<typeof cb>) => props.setParams((p) => ({ ...p, colorBalance: { ...cb, ...patch } }));
  return (
    <>
      <SliderRow label="Shadows" value={cb.shadows} min={-100} max={100} step={1} onChange={(v) => set({ shadows: v })} />
      <SliderRow label="Midtones" value={cb.midtones} min={-100} max={100} step={1} onChange={(v) => set({ midtones: v })} />
      <SliderRow label="Highlights" value={cb.highlights} min={-100} max={100} step={1} onChange={(v) => set({ highlights: v })} />
    </>
  );
}

function CurvesEditor(props: { row: number[][]; setRow: (i: number) => (row: CurveRow) => void }) {
  const rows: CurveRow[] = props.row.map(([x, y]) => ({ x, y }));
  return (
    <>
      {rows.map((row, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ minWidth: 20, fontSize: 11, color: "var(--text-dim)" }}>P{i + 1}</span>
          <SliderRow label="x" value={row.x} min={0} max={255} step={1} onChange={(v) => props.setRow(i)({ ...row, x: v })} />
          <SliderRow label="y" value={row.y} min={0} max={255} step={1} onChange={(v) => props.setRow(i)({ ...row, y: v })} />
        </div>
      ))}
    </>
  );
}

function BlackWhiteEditor(props: { params: AdjustmentParams; setParams: (u: (p: AdjustmentParams) => AdjustmentParams) => void }) {
  const bw = props.params.blackWhite ?? { red: 1, green: 1, blue: 1 };
  const set = (patch: Partial<typeof bw>) => props.setParams((p) => ({ ...p, blackWhite: { ...bw, ...patch } }));
  return (
    <>
      <SliderRow label="Reds" value={bw.red} min={0} max={3} step={0.05} onChange={(v) => set({ red: v })} />
      <SliderRow label="Greens" value={bw.green} min={0} max={3} step={0.05} onChange={(v) => set({ green: v })} />
      <SliderRow label="Blues" value={bw.blue} min={0} max={3} step={0.05} onChange={(v) => set({ blue: v })} />
    </>
  );
}

function ChannelMixerEditor(props: { params: AdjustmentParams; setParams: (u: (p: AdjustmentParams) => AdjustmentParams) => void }) {
  const cm = props.params.channelMixer ?? { red: { r: 1, g: 0, b: 0 }, green: { r: 0, g: 1, b: 0 }, blue: { r: 0, g: 0, b: 1 } };
  const rows = ["red", "green", "blue"] as const;
  const cols: Record<string, keyof typeof cm.red> = { r: "r", g: "g", b: "b" };
  return (
    <>
      {rows.map((row) => (
        <div key={row} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ minWidth: 34, fontSize: 11, textTransform: "capitalize", color: "var(--text-dim)" }}>{row}</span>
          {(["r", "g", "b"] as const).map((col) => (
            <SliderRow
              key={col}
              label={col.toUpperCase()}
              value={cm[row][cols[col]]}
              min={-1}
              max={1}
              step={0.01}
              onChange={(v) => props.setParams((p) => ({
                ...p,
                channelMixer: { ...cm, [row]: { ...cm[row], [col]: v } },
              }))}
            />
          ))}
        </div>
      ))}
    </>
  );
}

function SelectiveColorEditor(props: { params: AdjustmentParams; setParams: (u: (p: AdjustmentParams) => AdjustmentParams) => void }) {
  const sc = props.params.selectiveColor ?? {
    reds: 0, yellows: 0, greens: 0, cyans: 0, blues: 0, magentas: 0, whites: 0, neutrals: 0, blacks: 0,
  };
  const keys = Object.keys(sc) as (keyof typeof sc)[];
  const set = (patch: Partial<typeof sc>) => props.setParams((p) => ({ ...p, selectiveColor: { ...sc, ...patch } }));
  return (
    <>
      {keys.map((k) => (
        <SliderRow key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} value={sc[k]} min={-100} max={100} step={1} onChange={(v) => set({ [k]: v } as Partial<typeof sc>)} />
      ))}
    </>
  );
}

function GradientMapEditor(props: { params: AdjustmentParams; setParams: (u: (p: AdjustmentParams) => AdjustmentParams) => void }) {
  const stops = props.params.gradientMap?.stops ?? [
    { pos: 0, color: "#000000" },
    { pos: 0.5, color: "#7f7f7f" },
    { pos: 1, color: "#ffffff" },
  ];
  const setStop = (i: number, patch: Partial<{ pos: number; color: string }>) => {
    const next = stops.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    props.setParams((p) => ({ ...p, gradientMap: { stops: next } }));
  };
  return (
    <>
      {stops.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <SliderRow label="Pos" value={s.pos} min={0} max={1} step={0.05} onChange={(v) => setStop(i, { pos: v })} />
          <input type="color" value={s.color} onChange={(e) => setStop(i, { color: e.target.value })} />
        </div>
      ))}
    </>
  );
}

function ColorLookupEditor(props: { params: AdjustmentParams; setParams: (u: (p: AdjustmentParams) => AdjustmentParams) => void }) {
  const lut = props.params.colorLookup?.lut ?? "identity";
  return (
    <div className="slider-row">
      <label style={{ minWidth: 78 }}>Preset</label>
      <select value={lut} onChange={(e) => {
        const v = e.target.value as (typeof COLOR_LOOKUP_PRESETS)[number];
        props.setParams((p) => ({ ...p, colorLookup: { lut: v } }));
      }} style={{ flex: 1 }}>
        {COLOR_LOOKUP_PRESETS.map((p) => (
          <option key={p} value={p}>{p === "identity" ? "Identity (no change)" : p.charAt(0).toUpperCase() + p.slice(1)}</option>
        ))}
      </select>
    </div>
  );
}