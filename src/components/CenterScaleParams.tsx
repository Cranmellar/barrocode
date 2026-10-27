/**
 * Panel de escala, giro y centro — permite escalar y girar el trayecto
 * alrededor de un punto de pivote en mm, con escala independiente por eje o
 * uniforme.
 *
 * La escala se aplica después de la conversión SVG → mm, por lo que el
 * centro se especifica en coordenadas del lecho de impresión.
 */

import type { PrintParams } from '../types';
import { NumInput } from './NumInput';

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
        <div className="section-title">Centro de pivote (mm)</div>

        <div className="param-row">
          <label>X<span className="unit"> mm</span></label>
          <NumInput
            value={params.centerX}
            step={1}
            onChange={v => setVal('centerX', v)}
          />
        </div>
        <div className="param-row">
          <label>Y<span className="unit"> mm</span></label>
          <NumInput
            value={params.centerY}
            step={1}
            onChange={v => setVal('centerY', v)}
          />
        </div>

        <button
          className="btn-reset"
          style={{ margin: '4px 12px' }}
          onClick={() => onChange({ ...params, centerX: 0, centerY: 0 })}
        >
          Resetear centro
        </button>
      </div>

      {/* ── Escala ── */}
      <div className="section">
        <div className="section-title">Escala</div>

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

        <div className="param-row">
          <label>{params.scaleUniform ? 'Escala' : 'Escala X'}</label>
          <NumInput
            value={params.scaleX}
            min={SCALE_MIN}
            max={SCALE_MAX}
            step={0.05}
            onChange={setScaleX}
          />
        </div>

        {!params.scaleUniform && (
          <div className="param-row">
            <label>Escala Y</label>
            <NumInput
              value={params.scaleY}
              min={SCALE_MIN}
              max={SCALE_MAX}
              step={0.05}
              onChange={setScaleY}
            />
          </div>
        )}

        {/* Quick-access scale slider */}
        <div className="slider-row">
          <div className="slider-header">
            <span className="slider-label">
              {params.scaleUniform ? 'Escala' : 'Escala X'}
            </span>
            <span className="slider-value" style={{ fontSize: 16 }}>
              {params.scaleX.toFixed(2)}
              <span className="slider-value-unit">×</span>
            </span>
          </div>
          <input
            type="range"
            min={SCALE_MIN}
            max={SCALE_MAX}
            step={0.01}
            value={params.scaleX}
            onChange={e => setScaleX(parseFloat(e.target.value))}
          />
        </div>

        {!params.scaleUniform && (
          <div className="slider-row">
            <div className="slider-header">
              <span className="slider-label">Escala Y</span>
              <span className="slider-value" style={{ fontSize: 16 }}>
                {params.scaleY.toFixed(2)}
                <span className="slider-value-unit">×</span>
              </span>
            </div>
            <input
              type="range"
              min={SCALE_MIN}
              max={SCALE_MAX}
              step={0.01}
              value={params.scaleY}
              onChange={e => setScaleY(parseFloat(e.target.value))}
            />
          </div>
        )}

        <button
          className="btn-reset"
          style={{ margin: '4px 12px 8px' }}
          onClick={() => onChange({ ...params, scaleX: 1, scaleY: 1 })}
        >
          Resetear escala
        </button>
      </div>

      {/* ── Giro ── */}
      <div className="section">
        <div className="section-title">Giro</div>

        <div className="param-row" title="Antihorario visto desde arriba, alrededor del centro de pivote. Se aplica después de la escala.">
          <label>Ángulo<span className="unit"> °</span></label>
          <NumInput
            value={params.rotation}
            step={1}
            onChange={v => setVal('rotation', v)}
          />
        </div>

        <button
          className="btn-reset"
          style={{ margin: '4px 12px 8px' }}
          onClick={() => setVal('rotation', 0)}
        >
          Resetear giro
        </button>
      </div>
    </>
  );
}
