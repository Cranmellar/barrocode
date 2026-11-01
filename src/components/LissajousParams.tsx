import React, { useEffect, useRef, useState } from 'react';
import type { PrintParams } from '../types';
import { NumInput } from './NumInput';
import { Icon, type IconName } from './icons';
import { wrapHint } from '../lib/wrapHint';

interface Props {
  params: PrintParams;
  // `morph` marks a preset: the figure animates and the changed numbers flash.
  onChange: (p: PrintParams, morph?: boolean) => void;
  onReset: () => void;
  // Bumped by every preset or reset (see LissajousPreview).
  morph: number;
  // Default values: sliders mark them and snap to them.
  defaults: PrintParams;
  editingKf: { number: number; label: string; color: string; smooth: boolean; onDone: () => void } | null;
  // Keyframes exist but none is selected: the panel shows the wave at the
  // extruder (this position), and editing it creates a keyframe there.
  autoKeyAt: string | null;
  // Small figure of the wave, shown under the header.
  figure?: React.ReactNode;
  headerExtra?: React.ReactNode;
}

// Within this fraction of the range, dragging snaps to the default value.
const SNAP = 0.015;

function Slider({ label, icon, value, min, max, step, unit, hint, def, morph, onChange }: {
  label: string; icon?: IconName; value: number; min: number; max: number;
  step: number; unit?: string; hint?: string; def: number; morph: number;
  onChange: (v: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    const end = () => setDragging(false);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [dragging]);
  // Thumb centre at fraction f of the track (the thumb is 14 px wide).
  const at = (f: number) => `calc(7px + (100% - 14px) * ${Math.max(0, Math.min(1, f))})`;
  // A preset that changes this value flashes the number. Two class names
  // that alternate restart the animation on consecutive presets.
  const [flashes, setFlashes] = useState(0);
  const prevRef = useRef({ morph, value });
  useEffect(() => {
    const prev = prevRef.current;
    if (morph !== prev.morph && value !== prev.value) setFlashes(n => n + 1);
    prevRef.current = { morph, value };
  }, [morph, value]);
  const decimals = String(step).split('.')[1]?.length ?? 0;
  const fill     = at((value - min) / (max - min));
  const trackBg  = `linear-gradient(to right,var(--accent) 0%,var(--accent) ${fill},var(--control-edge) ${fill},var(--control-edge) 100%)`;
  return (
    <div className="slider-row" title={wrapHint(hint)}>
      <div className="slider-header">
        <span className="slider-label">{icon && <Icon name={icon} />}{label}</span>
        <span className={`slider-num${flashes ? ` num-flash-${flashes % 2 ? 'a' : 'b'}` : ''}`}>
          <NumInput value={parseFloat(value.toFixed(decimals))} step={step} onChange={onChange} />
          {unit && <span className="slider-value-unit">{unit}</span>}
        </span>
      </div>
      <div className="slider-track">
        {def >= min && def <= max && (
          <span className={`slider-notch${value === def ? ' slider-notch--on' : ''}`}
            style={{ left: at((def - min) / (max - min)) }} aria-hidden="true" />
        )}
        {dragging && (
          <span className="slider-bubble" style={{ left: at((value - min) / (max - min)) }} aria-hidden="true">
            {value.toFixed(decimals)}{unit && ` ${unit}`}
          </span>
        )}
        <input type="range" min={min} max={max} step={step} value={value}
          style={{ background: trackBg }}
          onPointerDown={() => setDragging(true)}
          onChange={e => {
            const v = parseFloat(e.target.value);
            // Only a drag snaps; arrow keys must be able to step off the default.
            onChange(dragging && Math.abs(v - def) <= (max - min) * SNAP ? def : v);
          }} />
      </div>
    </div>
  );
}

function Sec({ title, icon, axis, children, accentColor }: {
  title: string; icon?: IconName; axis?: 'N' | 'T' | 'Z'; children: React.ReactNode; accentColor?: string;
}) {
  return (
    <div className="section" style={accentColor
      ? { borderLeft: `3px solid ${accentColor}`, paddingLeft: 2 }
      : {}}>
      <div className="section-title">
        {icon && <Icon name={icon} />}
        {axis && <span className={`axis-chip axis-chip--${axis.toLowerCase()}`}>{axis}</span>}
        {title}
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
  const W = 56, H = 30;
  const pad = 3;
  const drawW = W - pad * 2, drawH = H - pad * 2;

  // The bead as it is laid along a straight stretch of path: arc length
  // runs left to right, T pushes it along, N swings it sideways.
  const totalArc = Math.max(wlN, wlT) * 2;
  const nPts = 280;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= nPts; i++) {
    const s = (i / nPts) * totalArc;
    xs.push(s + (ampT > 0 ? ampT * Math.sin(TWO_PI * s / wlT) : 0));
    ys.push(ampN * Math.sin(TWO_PI * s / wlN + delta));
  }

  let minX = Infinity, maxX = -Infinity;
  for (const x of xs) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
  const rangeX = maxX - minX || 1;
  const halfH = drawH * 0.5;
  const px = (x: number) => pad + ((x - minX) / rangeX) * drawW;
  const py = (y: number) => H / 2 - (ampN > 0 ? (y / ampN) * halfH : 0);

  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${px(x).toFixed(1)},${py(ys[i]).toFixed(1)}`).join(' ');

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none">
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

export function LissajousParams({ params, onChange, onReset, morph, defaults, editingKf, autoKeyAt, figure, headerExtra }: Props) {
  function set<K extends keyof PrintParams>(k: K, v: PrintParams[K]) {
    onChange({ ...params, [k]: v });
  }

  const deg = (r: number) => r * (180 / Math.PI);
  const rad = (d: number) => d * (Math.PI / 180);

  return (
    <div className="lissajous-params">
      <div className="panel-header">
        <span className="panel-title"><Icon name="onda" size={16} />Onda</span>
        <span className="panel-header-actions">
          <button className="btn-reset" onClick={onReset} disabled={autoKeyAt !== null}
            title={editingKf
              ? 'Restablece la onda de este keyframe y la fase'
              : autoKeyAt !== null
                ? 'Selecciona un keyframe para restablecer su onda'
                : 'Restablece solo los parámetros de la onda'}>Restablecer</button>
          {headerExtra}
        </span>
      </div>
      {figure}
      {editingKf ? (
        <div className="liss-context liss-context--kf">
          <span className={`kf-badge${editingKf.smooth ? ' kf-smooth' : ''}`} style={{ '--kf-c': editingKf.color } as React.CSSProperties}>
            {editingKf.number}
          </span>
          <span className="liss-context-text">Editando {editingKf.label}</span>
          <button className="btn-small liss-context-done" onClick={editingKf.onDone}
            title="Terminar de editar el keyframe (Esc)">OK</button>
        </div>
      ) : autoKeyAt !== null ? (
        <div className="liss-context liss-context--live">
          <Icon name="keyframe" />
          Onda en el extrusor ({autoKeyAt}). Al cambiar un valor se crea un keyframe aquí.
        </div>
      ) : (
        <div className="liss-context"><Icon name="global" />Onda global: se aplica a toda la pieza</div>
      )}

      {/* ── Preajustes ── */}
      <Sec title="Preajustes" icon="preajustes">
        <div className="preset-grid">
          {PRESETS.map(p => {
            const on = params.lissAmpN === p.ampN && params.lissAmpT === p.ampT
              && params.lissWlN === p.wlN && params.lissWlT === p.wlT
              && Math.abs(params.lissDelta - rad(p.d)) < 1e-9;
            return (
            <button key={p.label} className={`btn-preset${on ? ' btn-preset--on' : ''}`} aria-pressed={on}
              onClick={() =>
              onChange({ ...params,
                lissAmpN: p.ampN, lissAmpT: p.ampT,
                lissWlN: p.wlN,  lissWlT: p.wlT,
                lissDelta: rad(p.d),
              }, true)
            }>
              <LissajousMini
                ampN={p.ampN} ampT={p.ampT}
                wlN={p.wlN}   wlT={p.wlT}
                delta={rad(p.d)}
              />
              {p.label}
            </button>
            );
          })}
        </div>
      </Sec>

      {/* ── Eje N ── */}
      <Sec axis="N" title="Normal (lateral)">
        <Slider morph={morph} def={defaults.lissAmpN} icon="amplitud" label="Amplitud N" value={params.lissAmpN}
          min={0} max={30} step={0.1} unit="mm"
          hint={'Cuánto se aparta la boquilla hacia cada lado del trazo. El ancho total de la onda es el doble. Con más amplitud, las esquinas del trazo se redondean más para que la onda no se pliegue sobre sí misma.\n0\u00a0=\u00a0sin onda lateral.'}
          onChange={v => set('lissAmpN', v)} />
        <Slider morph={morph} def={defaults.lissWlN} icon="longitud" label="Longitud de onda N" value={params.lissWlN}
          min={1} max={200} step={1} unit="mm"
          hint={'Distancia, medida a lo largo del trazo, en que la onda lateral va de un lado al otro y vuelve. Más corta, ondas más apretadas. En un contorno cerrado se ajusta un poco para que quepa un número entero de ondas y la costura cierre.'}
          onChange={v => set('lissWlN', v)} />
      </Sec>

      {/* ── Eje T ── */}
      <Sec axis="T" title="Tangente (avance)">
        <Slider morph={morph} def={defaults.lissAmpT} icon="amplitud" label="Amplitud T" value={params.lissAmpT}
          min={0} max={30} step={0.1} unit="mm"
          hint={'Cuánto se adelanta y se atrasa la boquilla a lo largo del trazo. Sola no cambia la línea, sino su ritmo: el cordón se junta y se estira. Junto con N dibuja elipses, ochos y bucles. Por encima de λT\u00a0÷\u00a06,3 la boquilla llega a retroceder sobre su propio cordón.'}
          onChange={v => set('lissAmpT', v)} />
        <Slider morph={morph} def={defaults.lissWlT} icon="longitud" label="Longitud de onda T" value={params.lissWlT}
          min={1} max={200} step={1} unit="mm"
          hint={'Distancia a lo largo del trazo en que la boquilla se adelanta, se atrasa y vuelve. Igual a λN: líneas o elipses, según Delta. La mitad de λN: ochos.'}
          onChange={v => set('lissWlT', v)} />
      </Sec>

      {/* ── Eje Z ── */}
      <Sec axis="Z" title="Vertical">
        {params.lissAmpZ > params.layerHeight && (
          <div className="warn-note">
            <Icon name="aviso" />
            Amplitud Z ({params.lissAmpZ.toFixed(1)} mm) mayor que la altura de capa ({params.layerHeight} mm):
            los valles se recortan para no chocar con la capa anterior.
          </div>
        )}
        <Slider morph={morph} def={defaults.lissAmpZ} icon="amplitud" label="Amplitud Z" value={params.lissAmpZ}
          min={0} max={20} step={0.1} unit="mm"
          hint={'Cuánto sube y baja la boquilla sobre la altura de su capa. La primera capa nunca baja de su altura, y cada punto queda al menos media capa por encima de la capa de abajo: con amplitudes grandes los valles se aplanan.'}
          onChange={v => set('lissAmpZ', v)} />
        {params.lissAmpZ > 0 && <>
          <Slider morph={morph} def={defaults.lissWlZ} icon="longitud" label="Longitud de onda Z" value={params.lissWlZ}
            min={1} max={200} step={1} unit="mm"
            hint={'Distancia a lo largo del trazo en que la boquilla sube, baja y vuelve. Igual a λN: sube y baja al mismo ritmo con que oscila a los lados.'}
            onChange={v => set('lissWlZ', v)} />
          <Slider morph={morph} def={deg(defaults.lissPhaseZ)} icon="fase" label="Fase Z" value={deg(params.lissPhaseZ)}
            min={-180} max={180} step={1} unit="°"
            hint={'Corre la onda vertical a lo largo del trazo, en grados de una onda. Con Delta\u00a00° y λZ igual a λN: con 0° el punto más alto cae en el extremo de un lado; con 90°, donde la onda cruza el trazo.'}
            onChange={v => set('lissPhaseZ', rad(v))} />
        </>}
      </Sec>

      {/* ── Acoplamiento N/T ── */}
      <Sec title="Acoplamiento N / T" icon="acople">
        <Slider morph={morph} def={deg(defaults.lissDelta)} label="Delta  (N respecto a T)" value={deg(params.lissDelta)}
          min={-180} max={180} step={1} unit="°"
          hint={'Desfase entre la onda lateral (N) y la de avance (T): decide la figura que dibuja la boquilla. Con λN igual a λT: 0° y 180° dan un vaivén en línea, inclinado hacia un lado o el otro; 90° da una elipse, que es un círculo si las dos amplitudes son iguales.'}
          onChange={v => set('lissDelta', rad(v))} />
      </Sec>

      {/* ── Fase ── */}
      <Sec title="Fase" icon="fase">
        <Slider morph={morph} def={deg(defaults.lissPhaseOffset)} icon="fase" label="Desfase inicial" value={deg(params.lissPhaseOffset)}
          min={-180} max={180} step={1} unit="°"
          hint={'Corre toda la onda (N, T y Z juntas) a lo largo del trazo, en grados de una onda: elige en qué punto de la onda empieza cada trayecto, donde está la costura. 180° la invierte: lo que iba hacia un lado va hacia el otro.'}
          onChange={v => set('lissPhaseOffset', rad(v))} />
        <Slider morph={morph} def={deg(defaults.phaseShiftPerLayer)} icon="desfaseCapa" label="Desfase por capa" value={deg(params.phaseShiftPerLayer)}
          min={-360} max={360} step={1} unit="°"
          hint={'Cuánto se corre la onda de una capa a la siguiente, en grados de una onda. Las crestas suben en diagonal y la pared se ve torcida, en espiral. 180° alterna crestas sobre valles, como un tejido. 360° es una onda entera: igual que 0°. Cuanto más cerca de 180°, más corrido queda cada cordón respecto del de abajo y menos se apoya en él.'}
          onChange={v => set('phaseShiftPerLayer', rad(v))} />
      </Sec>
    </div>
  );
}
