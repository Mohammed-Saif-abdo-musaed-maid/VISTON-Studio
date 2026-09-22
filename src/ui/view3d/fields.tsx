import { useRef, type ReactNode } from "react";
import { beginSceneGesture, commitSceneGesture } from "../../3d/core/sceneDataStore";

export function NumField({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  max,
  historyName = "Edit 3D Value",
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  historyName?: string;
  disabled?: boolean;
}) {
  const before = useRef<string | null>(null);
  return (
    <label className="vs-field vs-3d-field">
      <span>{label}</span>
      <input
        className="vs-input"
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onFocus={() => { before.current = beginSceneGesture(); }}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        onBlur={() => {
          if (before.current) {
            commitSceneGesture(historyName, before.current);
            before.current = null;
          }
        }}
      />
    </label>
  );
}

export function Vec3Field({
  label,
  value,
  onChange,
  step = 0.1,
  historyName = "Edit 3D Transform",
}: {
  label: string;
  value: [number, number, number];
  onChange: (v: [number, number, number]) => void;
  step?: number;
  historyName?: string;
}) {
  const before = useRef<string | null>(null);
  const set = (i: number, v: number) => {
    const next: [number, number, number] = [value[0], value[1], value[2]];
    next[i] = v;
    onChange(next);
  };
  return (
    <div className="vs-field vs-3d-field">
      <span>{label}</span>
      <div className="vs-3d-vec3">
        {[0, 1, 2].map((i) => (
          <input
            key={i}
            className="vs-input"
            type="number"
            step={step}
            value={Number.isFinite(value[i]) ? value[i] : 0}
            onFocus={() => { if (!before.current) before.current = beginSceneGesture(); }}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v)) set(i, v);
            }}
            onBlur={() => {
              if (before.current) {
                commitSceneGesture(historyName, before.current);
                before.current = null;
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="vs-field vs-3d-field">
      <span>{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="vs-field vs-3d-field" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="vs-field vs-3d-field">
      <span>{label}</span>
      <select className="vs-input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="vs-3d-section">
      <div className="vs-3d-section-title">{title}</div>
      {children}
    </div>
  );
}
