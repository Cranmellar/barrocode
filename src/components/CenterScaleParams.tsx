/**
 * Panel de escala, giro y centro — permite escalar y girar el trayecto
 * alrededor de un punto de pivote en mm, con escala independiente por eje o
 * uniforme.
 *
 * The pivot is a mm offset from the centre of the part's bounding box, so
 * 0, 0 is always the part's geometric centre, wherever the SVG placed it on
 * its artboard.
 */

import { useEffect, useState } from 'react';
import type { PrintParams } from '../types';
import { NumInput } from './NumInput';
import { Icon } from './icons';

interface Props {
  params: PrintParams;
  onChange: (p: PrintParams) => void;
}

function set<K extends keyof PrintParams>(
  params: PrintParams,
  onChange: (p: PrintParams) => void,
  k: K,
  v: PrintParams[K],
) {
  onChange({ ...params, [k]: v });
}

const SCALE_MIN = 0.1;
const SCALE_MAX = 3.0;
// A drag within this fraction of the range snaps to 1×, as on the wave sliders.
const SNAP = 0.015;

// Icon button at the end of a section title; disabled while already at the default.
function ResetBtn({ label, atDefault, onClick }: { label: string; atDefault: boolean; onClick: () => void }) {
  return (
    <button className="section-reset" title={label} aria-label={label} disabled={atDefault} onClick={onClick}>
      <Icon name="reset" />
    </button>
  );
}

// One control per axis: the number field and the slider edit the same value.
function ScaleSlider({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
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
  const at = (f: number) => `calc(7px + (100% - 14px) * ${Math.max(0, Math.min(1, f))})`;
  const frac = (v: number) => (v - SCALE_MIN) / (SCALE_MAX - SCALE_MIN);
  const fill = at(frac(value));
  return (
    <div className="slider-row">
      <div className="slider-header">
        <span className="slider-label">{label}</span>
        <span className="slider-num">
          <NumInput value={value} min={SCALE_MIN} max={SCALE_MAX} step={0.01} fineStep={0.01} onChange={onChange} />
          <span className="slider-value-unit">×</span>
        </span>
      </div>
      <div className="slider-track">
        <span className={`slider-notch${value === 1 ? ' slider-notch--on' : ''}`}
          style={{ left: at(frac(1)) }} aria-hidden="true" />
        <input type="range" min={SCALE_MIN} max={SCALE_MAX} step={0.01} value={value}
          aria-label={label}
          style={{ background: `linear-gradient(to right,var(--accent) 0%,var(--accent) ${fill},var(--control-edge) ${fill},var(--control-edge) 100%)` }}
          onPointerDown={() => setDragging(true)}
          onChange={e => {
            const v = parseFloat(e.target.value);
            onChange(dragging && Math.abs(v - 1) <= (SCALE_MAX - SCALE_MIN) * SNAP ? 1 : v);
          }} />
      </div>
    </div>
  );
}

export function CenterScaleParams({ params, onChange }: Props) {
  function setVal<K extends keyof PrintParams>(k: K, v: PrintParams[K]) {
    set(params, onChange, k, v);
  }

  function setScaleX(v: number) {
    if (params.scaleUniform) {
      onChange({ ...params, scaleX: v, scaleY: v });
    } else {
      setVal('scaleX', v);
    }
  }

  function setScaleY(v: number) {
    if (params.scaleUniform) {
      onChange({ ...params, scaleX: v, scaleY: v });
    } else {
      setVal('scaleY', v);
    }
  }

  function toggleUniform(checked: boolean) {
    if (checked) {
      // Lock Y to current X value when enabling uniform
      onChange({ ...params, scaleUniform: true, scaleY: params.scaleX });
    } else {
      setVal('scaleUniform', false);
    }
  }

  return (
    <>
      {/* ── Centro de pivote ── */}
      <div className="section">
        <div className="section-title" title="Desplazamiento desde el centro geométrico de la pieza. 0, 0 = centro de la pieza.">
          <Icon name="centro" />Centro de pivote
          <ResetBtn label="Centrar en la pieza" atDefault={params.centerX === 0 && params.centerY === 0}
            onClick={() => onChange({ ...params, centerX: 0, centerY: 0 })} />
        </div>

        <div className="param-row">
          <label title="Desde el centro de la pieza">X<span className="unit"> mm</span></label>
          <NumInput
            value={params.centerX}
            step={5}
            fineStep={1}
            onChange={v => setVal('centerX', v)}
          />
        </div>
        <div className="param-row">
          <label title="Desde el centro de la pieza">Y<span className="unit"> mm</span></label>
          <NumInput
            value={params.centerY}
            step={5}
            fineStep={1}
            onChange={v => setVal('centerY', v)}
          />
        </div>
      </div>

      {/* ── Escala ── */}
      <div className="section">
        <div className="section-title">
          <Icon name="escalaX" />Escala
          <ResetBtn label="Restablecer escala (1×)" atDefault={params.scaleX === 1 && params.scaleY === 1}
            onClick={() => onChange({ ...params, scaleX: 1, scaleY: 1 })} />
        </div>

        <div className="param-row param-check" style={{ paddingBottom: 6 }}>
          <label>
            <input
              type="checkbox"
              checked={params.scaleUniform}
              onChange={e => toggleUniform(e.target.checked)}
            />
            Uniforme (X = Y)
          </label>
        </div>

        <ScaleSlider label={params.scaleUniform ? 'Escala' : 'Escala X'} value={params.scaleX} onChange={setScaleX} />
        {!params.scaleUniform && (
          <ScaleSlider label="Escala Y" value={params.scaleY} onChange={setScaleY} />
        )}
      </div>

      {/* ── Giro ── */}
      <div className="section">
        <div className="section-title">
          <Icon name="giro" />Giro
          <ResetBtn label="Restablecer giro (0°)" atDefault={params.rotation === 0}
            onClick={() => setVal('rotation', 0)} />
        </div>

        <div className="param-row" title="Antihorario visto desde arriba, alrededor del centro de pivote. Se aplica después de la escala.">
          <label>Ángulo<span className="unit"> °</span></label>
          <NumInput
            value={params.rotation}
            step={1}
            onChange={v => setVal('rotation', v)}
          />
        </div>
      </div>
    </>
  );
}
