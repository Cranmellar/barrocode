import React from 'react';
import type { PrintParams } from '../types';
import { NumInput } from './NumInput';

interface Props {
  params: PrintParams;
  onChange: (p: PrintParams) => void;
  onReset: () => void;
  editingKf: { label: string; onDone: () => void } | null;
  // Keyframes exist but none is selected: the wave fields have no effect.
  waveLocked: boolean;
}

function Slider({ label, value, min, max, step, unit, hint, onChange }: {
  label: string; value: number; min: number; max: number;
  step: number; unit?: string; hint?: string;
  onChange: (v: number) => void;
}) {
  const decimals = String(step).split('.')[1]?.length ?? 0;
  const fillPct  = ((value - min) / (max - min)) * 100;
  const trackBg  = `linear-gradient(to right,var(--accent) 0%,var(--accent) ${fillPct}%,var(--border) ${fillPct}%,var(--border) 100%)`;
  return (
    <div className="slider-row" title={hint}>
      <div className="slider-header">
        <span className="slider-label">{label}</span>
        <span className="slider-num">
          <NumInput value={parseFloat(value.toFixed(decimals))} step={step} onChange={onChange} />
          {unit && <span className="slider-value-unit">{unit}</span>}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        style={{ background: trackBg }}
        onChange={e => onChange(parseFloat(e.target.value))} />
    </div>
  );
}

function Sec({ title, children, accentColor, badge }: {
  title: string; children: React.ReactNode; accentColor?: string; badge?: string;
}) {
  return (
    <div className="section" style={accentColor
      ? { borderLeft: `3px solid ${accentColor}`, paddingLeft: 2 }
      : {}}>
      <div className="section-title">
        {title}
        {badge && <span className="section-badge">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Miniatura Lissajous para cada preajuste ─────────────────────────────────

const TWO_PI = Math.PI * 2;

const LissajousMini = React.memo(function LissajousMini({
  ampN, ampT, wlN, wlT, delta, color = 'currentColor',
}: {
  ampN: number; ampT: number; wlN: number; wlT: number; delta: number; color?: string;
}) {
  const S = 38;   // viewBox size
  const pad = 4;
  const draw = S - pad * 2;

  if (ampN === 0 && ampT === 0) {
    // Plano: dot + tiny horizontal line
    return (
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} fill="none">
        <line x1={S * 0.25} y1={S / 2} x2={S * 0.75} y2={S / 2}
          stroke={color} strokeWidth="2" strokeLinecap="round" />
        <circle cx={S / 2} cy={S / 2} r="1.5" fill={color} />
      </svg>
    );
  }

  // Sample the Lissajous figure over 2 full cycles of the longer wavelength
  const totalArc = Math.max(wlN, wlT) * 2.5;
  const nPts = 280;
  const xs: number[] = [];
  const ys: number[] = [];

  for (let i = 0; i <= nPts; i++) {
    const s = (i / nPts) * totalArc;
    xs.push(ampT > 0 ? ampT * Math.sin(TWO_PI * s / wlT) : 0);
    ys.push(ampN * Math.sin(TWO_PI * s / wlN + delta));
  }

  // Normalise to [0, draw] inside viewBox — keep zero-amplitude axes centred
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] < minX) minX = xs[i]; if (xs[i] > maxX) maxX = xs[i];
    if (ys[i] < minY) minY = ys[i]; if (ys[i] > maxY) maxY = ys[i];
  }
  const rangeX = maxX - minX;
  const rangeY = maxY - minY;

  const px = (x: number) =>
    rangeX > 0.001 ? pad + ((x - minX) / rangeX) * draw : S / 2;
  const py = (y: number) =>
    rangeY > 0.001 ? pad + (1 - (y - minY) / rangeY) * draw : S / 2;

  // Build SVG path
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${px(x).toFixed(1)},${py(ys[i]).toFixed(1)}`).join(' ');

  return (
    <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} fill="none">
      <path d={d} stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
});

// ── Preajustes ──────────────────────────────────────────────────────────────

const PRESETS = [
  { label: 'Sinusoide', ampN: 3,  ampT: 0, wlN: 20, wlT: 20, d: 0   },
  { label: 'Elipse',    ampN: 3,  ampT: 3, wlN: 20, wlT: 20, d: 90  },
  { label: 'Figura 8',  ampN: 3,  ampT: 3, wlN: 20, wlT: 10, d: 0   },
  { label: 'Espiral',   ampN: 3,  ampT: 2, wlN: 15, wlT: 20, d: 60  },
  { label: 'Trébol',    ampN: 3,  ampT: 3, wlN: 20, wlT: 15, d: 45  },
  { label: 'Plano',     ampN: 0,  ampT: 0, wlN: 20, wlT: 20, d: 0   },
];

// ── Main component ──────────────────────────────────────────────────────────

export function LissajousParams({ params, onChange, onReset, editingKf, waveLocked }: Props) {
  function set<K extends keyof PrintParams>(k: K, v: PrintParams[K]) {
    onChange({ ...params, [k]: v });
  }

  const deg = (r: number) => r * (180 / Math.PI);
  const rad = (d: number) => d * (Math.PI / 180);

  return (
    <div className="lissajous-params">
      <div className="panel-header">
        <span>Lissajous</span>
        <button className="btn-reset" onClick={onReset}>Reiniciar</button>
      </div>
      {editingKf ? (
        <div className="liss-context liss-context--kf">
          <span className="kf-chip" />
          <span className="liss-context-text">Editando {editingKf.label}</span>
          <button className="btn-small liss-context-done" onClick={editingKf.onDone}
            title="Terminar de editar el keyframe (Esc)">OK</button>
        </div>
      ) : waveLocked ? (
        <div className="liss-context liss-context--locked">
          La onda la definen los keyframes. Selecciona uno en la línea de tiempo para editarla.
        </div>
      ) : (
        <div className="liss-context">Onda global · se aplica a toda la pieza</div>
      )}

      <fieldset className="liss-fieldset" disabled={waveLocked}>
        {/* ── Preajustes ── */}
        <Sec title="Preajustes">
          <div className="preset-grid">
            {PRESETS.map(p => (
              <button key={p.label} className="btn-preset" onClick={() =>
                onChange({ ...params,
                  lissAmpN: p.ampN, lissAmpT: p.ampT,
                  lissWlN: p.wlN,  lissWlT: p.wlT,
                  lissDelta: rad(p.d),
                })
              }>
                <LissajousMini
                  ampN={p.ampN} ampT={p.ampT}
                  wlN={p.wlN}   wlT={p.wlT}
                  delta={rad(p.d)}
                />
                {p.label}
              </button>
            ))}
          </div>
        </Sec>

        {/* ── Eje N ── */}
        <Sec title="N · Normal (lateral)">
          <Slider label="Amplitud N" value={params.lissAmpN}
            min={0} max={30} step={0.1} unit="mm"
            hint="Desplazamiento máximo a izquierda/derecha de la línea central"
            onChange={v => set('lissAmpN', v)} />
          <Slider label="Longitud de onda N" value={params.lissWlN}
            min={1} max={200} step={1} unit="mm"
            hint="Longitud de arco por ciclo completo en dirección normal"
            onChange={v => set('lissWlN', v)} />
        </Sec>

        {/* ── Eje T ── */}
        <Sec title="T · Tangente (avance)">
          <Slider label="Amplitud T" value={params.lissAmpT}
            min={0} max={30} step={0.1} unit="mm"
            hint="Desplazamiento máximo en la dirección de avance del trayecto"
            onChange={v => set('lissAmpT', v)} />
          <Slider label="Longitud de onda T" value={params.lissWlT}
            min={1} max={200} step={1} unit="mm"
            hint="Longitud de arco por ciclo completo en dirección tangente"
            onChange={v => set('lissWlT', v)} />
        </Sec>

        {/* ── Eje Z ── */}
        <Sec title="Z · Vertical">
          {params.lissAmpZ > params.layerHeight && (
            <div style={{ fontSize: 9, color: '#c0392b', marginBottom: 4, lineHeight: 1.3 }}>
              ⚠ Amplitud Z ({params.lissAmpZ.toFixed(1)} mm) supera la altura de capa
              ({params.layerHeight} mm) — los valles se recortan para no chocar con la capa anterior
            </div>
          )}
          <Slider label="Amplitud Z" value={params.lissAmpZ}
            min={0} max={20} step={0.1} unit="mm"
            hint="Desplazamiento máximo vertical. La primera capa no baja de su altura y cada punto queda al menos media capa sobre la capa anterior; con amplitudes grandes los valles se aplanan."
            onChange={v => set('lissAmpZ', v)} />
          {params.lissAmpZ > 0 && <>
            <Slider label="Longitud de onda Z" value={params.lissWlZ}
              min={1} max={200} step={1} unit="mm"
              hint="Longitud de arco por ciclo completo en dirección vertical"
              onChange={v => set('lissWlZ', v)} />
            <Slider label="Fase Z" value={deg(params.lissPhaseZ)}
              min={-180} max={180} step={1} unit="°"
              hint="Desfase de la oscilación Z respecto a la fase base"
              onChange={v => set('lissPhaseZ', rad(v))} />
          </>}
        </Sec>

        {/* ── Acoplamiento N/T ── */}
        <Sec title="Acoplamiento N / T">
          <Slider label="Delta  (N respecto a T)" value={deg(params.lissDelta)}
            min={-180} max={180} step={1} unit="°"
            hint="Desfase entre N y T. 0°=línea  90°=elipse (si λN=λT)  180°=línea cruzada"
            onChange={v => set('lissDelta', rad(v))} />
        </Sec>
      </fieldset>

      {/* ── Fase ── */}
      <Sec title="Fase" badge={editingKf || waveLocked ? 'Global' : undefined}>
        <Slider label="Desfase inicial" value={deg(params.lissPhaseOffset)}
          min={-180} max={180} step={1} unit="°"
          hint="Fase global al inicio del arco (s=0)"
          onChange={v => set('lissPhaseOffset', rad(v))} />
        <Slider label="Desfase por capa" value={deg(params.phaseShiftPerLayer)}
          min={-360} max={360} step={1} unit="°"
          hint="Fase extra añadida en cada capa — crea efecto de torsión/espiral"
          onChange={v => set('phaseShiftPerLayer', rad(v))} />
      </Sec>
    </div>
  );
}
