import React, { useRef, useState } from 'react';
import type { PrintParams } from '../types';
import { NumInput } from './NumInput';
import { CenterScaleParams } from './CenterScaleParams';
import { Icon, type IconName } from './icons';
import { MAX_LAYERS, SAMPLES_PER_CYCLE, layerCount, suggestedSpacingMM } from '../lib/waveGenerator';
import { wrapHint } from '../lib/wrapHint';

interface Props {
  params: PrintParams;
  onChange: (p: PrintParams) => void;
  svgMmPerUnit: number | null;
  shortestWl: number | null;  // mm, from shortestWavelength
}

function Num({ label, icon, value, min, max, step, unit, hint, onChange }: {
  label: string; icon?: IconName; value: number; min?: number; max?: number;
  step?: number; unit?: string; hint?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="param-row" title={wrapHint(hint)}>
      <label>{icon && <Icon name={icon} />}{label}{unit && <span className="unit"> {unit}</span>}</label>
      <NumInput value={value} min={min} max={max} step={step} onChange={onChange} />
    </div>
  );
}

function Check({ label, icon, checked, hint, onChange }: {
  label: string; icon?: IconName; checked: boolean; hint?: string; onChange: (v: boolean) => void;
}) {
  return (
    <div className="param-row param-check" title={wrapHint(hint)}>
      <label>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        {icon && <Icon name={icon} />}{label}
      </label>
    </div>
  );
}

function Sec({ title, icon, children }: { title: string; icon?: IconName; children: React.ReactNode }) {
  return (
    <div className="section">
      <div className="section-title">{icon && <Icon name={icon} />}{title}</div>
      {children}
    </div>
  );
}

const fmt = (v: number) => v.toLocaleString('es', { maximumFractionDigits: 2 });

// Sample spacing with what it means for the current wave: real mm, samples
// per cycle of the shortest wave, and a suggested value when it is off.
function Resolution({ params, shortestWl, onSpacing }: {
  params: PrintParams; shortestWl: number | null; onSpacing: (v: number) => void;
}) {
  const sf = params.scaleFactor;
  const mm = params.sampleSpacing * sf;
  const perCycle = shortestWl === null ? null : shortestWl / mm;
  const suggested = suggestedSpacingMM(shortestWl);
  const suggestedSvg = Math.round(suggested / sf * 100) / 100;
  const verdict = perCycle === null
    ? (mm > 2.5 ? 'coarse' : 'ok')
    : perCycle < 0.8 * SAMPLES_PER_CYCLE ? 'coarse' : perCycle > 4 * SAMPLES_PER_CYCLE ? 'fine' : 'ok';
  return (
    <Sec title="Resolución" icon="resolucion">
      <Num label="Espaciado de muestra" icon="espaciado" value={params.sampleSpacing}
        min={0.1} step={0.1} unit={sf === 1 ? 'mm' : 'u. SVG'}
        hint={`Distancia, a lo largo del trazo, entre los puntos que se toman de él. Más fino, curvas más suaves, pero más líneas de G-code y cada cambio tarda más en recalcularse. Lo justo son unos ${SAMPLES_PER_CYCLE} puntos por onda de la más corta: debajo se indica si sobra o falta, con un valor sugerido. Mínimo 0,1.`}
        onChange={onSpacing} />
      <div className={`resolution resolution--${verdict}`}>
        <div className="resolution-facts">
          {sf !== 1 && <span>{fmt(mm)} mm reales</span>}
          {perCycle === null
            ? <span>sin onda: entre 1 y 2 mm basta</span>
            : <span>{fmt(Math.round(perCycle * 10) / 10)} puntos por ciclo (λ {fmt(shortestWl!)} mm)</span>}
        </div>
        <p className="state-line">
          <Icon name={verdict === 'ok' ? 'ok' : verdict === 'coarse' ? 'aviso' : 'info'} />
          {verdict === 'ok' && 'Bien: la onda sale suave sin cargar el G-code.'}
          {verdict === 'coarse' && 'Pocos puntos: la onda sale quebrada, como un polígono.'}
          {verdict === 'fine' && 'Más fino de lo necesario: más G-code y recálculo lento, sin ganar forma.'}
        </p>
        {verdict !== 'ok' && Math.abs(suggestedSvg - params.sampleSpacing) > 1e-9 && (
          <button className="btn-small" onClick={() => onSpacing(suggestedSvg)}>
            Usar {fmt(suggestedSvg)}{sf === 1 ? ' mm' : ''} (sugerido)
          </button>
        )}
      </div>
    </Sec>
  );
}

type GroupId = 'pieza' | 'trayecto';

const TAB_KEY = 'barrocode.leftTab';
const TABS: { id: GroupId; title: string; icon: IconName }[] = [
  { id: 'pieza', title: 'Pieza', icon: 'pieza' },
  { id: 'trayecto', title: 'Trayecto', icon: 'trayecto' },
];

function loadTab(): GroupId {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    return TABS.some(t => t.id === saved) ? saved as GroupId : 'pieza';
  } catch {
    return 'pieza';
  }
}

export function PathParams({ params, onChange, svgMmPerUnit, shortestWl }: Props) {
  const [tab, setTab] = useState(loadTab);
  // The new tab's content slides in from the side of the tab that was clicked.
  const dirRef = useRef<'next' | 'prev'>('next');
  const tabIdx = TABS.findIndex(t => t.id === tab);

  function set<K extends keyof PrintParams>(k: K, v: PrintParams[K]) {
    onChange({ ...params, [k]: v });
  }

  function selectTab(id: GroupId) {
    if (id === tab) return;
    dirRef.current = TABS.findIndex(t => t.id === id) > tabIdx ? 'next' : 'prev';
    setTab(id);
    try { localStorage.setItem(TAB_KEY, id); } catch { /* storage unavailable */ }
  }

  const effLayers = layerCount(params);
  const height = +(effLayers * params.layerHeight).toFixed(1);

  const summaries: Record<GroupId, string> = {
    pieza: `${effLayers} capas · ${height} mm`,
    trayecto: [
      params.softJoin ? 'unión suave' : 'sin unión',
      params.zHopHeight > 0 ? `z-hop ${params.zHopHeight} mm` : 'sin z-hop',
    ].join(' · '),
  };

  return (
    <div className="path-params">
      <div className="panel-tabs" role="tablist" aria-label="Parámetros">
        <span className="panel-tabs-ind" aria-hidden="true"
          style={{ transform: `translateX(calc(${tabIdx} * (100% + 2px)))` }} />
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
            className={`panel-tab${tab === t.id ? ' panel-tab--on' : ''}`}
            onClick={() => selectTab(t.id)} title={summaries[t.id]}>
            <Icon name={t.icon} />{t.title}
          </button>
        ))}
      </div>
      <div key={tab} className={`tab-pane tab-pane--${dirRef.current}`} role="tabpanel">
      {tab === 'pieza' && (<>
        <Sec title="Capas" icon="capas">
          <Num label="Altura de capa" icon="alturaCapa" value={params.layerHeight}
            min={0.1} step={0.1} unit="mm"
            hint={'Cuánto sube la boquilla de una capa a la siguiente. En arcilla suele ir entre el 40 y el 70\u00a0% de la boquilla; la revisión de Máquina avisa si queda muy alta o muy fina para ella.'}
            onChange={v => set('layerHeight', v)} />
          <div className="param-row param-check">
            <label>
              <input type="radio" checked={params.useNumLayers}
                onChange={() => set('useNumLayers', true)} />
              Núm. de capas
            </label>
            <label>
              <input type="radio" checked={!params.useNumLayers}
                onChange={() => set('useNumLayers', false)} />
              Altura total
            </label>
          </div>
          {params.useNumLayers
            ? <Num label="Núm. de capas" icon="capas" value={params.numLayers} min={1} max={MAX_LAYERS} step={1}
                hint={`Cuántas capas se apilan. La altura de la pieza es este número por la altura de capa. Máximo ${MAX_LAYERS}.`}
                onChange={v => set('numLayers', Math.max(1, Math.round(v)))} />
            : <>
                <Num label="Altura total" icon="escalaY" value={params.totalHeight}
                  min={0.1} step={1} unit="mm"
                  hint="La altura que quieres para la pieza. El número de capas sale de dividirla por la altura de capa, redondeado hacia arriba."
                  onChange={v => set('totalHeight', v)} />
                <div className="param-info">
                  → {effLayers} capas{effLayers === MAX_LAYERS && ` (máximo)`}
                </div>
              </>}
        </Sec>

        <Resolution params={params} shortestWl={shortestWl} onSpacing={v => set('sampleSpacing', v)} />

        <Sec title="Escala" icon="escala">
          <Num label="Factor de escala" value={params.scaleFactor}
            min={0.001} step={0.1} unit="SVG→mm"
            hint={'Cuántos milímetros mide una unidad del SVG: 1\u00a0=\u00a0una unidad, un milímetro. Si el SVG declara su tamaño (en mm, cm, pulgadas…), se adopta solo al cargarlo.'}
            onChange={v => set('scaleFactor', v)} />
          {svgMmPerUnit !== null && (params.scaleFactor === svgMmPerUnit
            ? <div className="param-info">→ tamaño real del SVG</div>
            : <div className="param-info">
                <button className="btn-small" onClick={() => set('scaleFactor', svgMmPerUnit)}
                  title={wrapHint('El SVG declara su tamaño en unidades físicas. Vuelve a ese tamaño.')}>
                  Usar tamaño real (×{svgMmPerUnit})
                </button>
              </div>)}
          <div className="param-info">→ la posición en la cama se elige en <i>Máquina</i></div>
          <Check label="Invertir eje Y" icon="reflejar" checked={params.flipY}
            hint="El SVG cuenta Y hacia abajo y casi todas las impresoras hacia arriba. Activado, la pieza sale en la cama como se ve en el dibujo; desactivado, sale reflejada de adelante hacia atrás."
            onChange={v => set('flipY', v)} />
        </Sec>

        <CenterScaleParams params={params} onChange={onChange} />
      </>)}

      {tab === 'trayecto' && (<>
        <Sec title="Dirección" icon="direccion">
          <Check label="Invertir dirección" checked={params.reversePath}
            hint="La boquilla recorre cada trayecto en sentido contrario."
            onChange={v => set('reversePath', v)} />
          <Check label="Alternar por capa" checked={params.alternateDirection}
            hint="Una capa en un sentido y la siguiente en el otro, así cada capa empieza donde terminó la anterior. La costura no lleva rampa: la subida a la capa siguiente es vertical."
            onChange={v => set('alternateDirection', v)} />
          <Check label="Cerrar trayecto" checked={params.closePath}
            hint="Si un trayecto no termina donde empezó, agrega el tramo que lo cierra: un trazo abierto se imprime como un contorno cerrado."
            onChange={v => set('closePath', v)} />
        </Sec>

        <Sec title="Unión de capas" icon="union">
          <Check label="Transición Z suave" checked={params.softJoin}
            hint={'La boquilla sigue extruyendo al pasar de una capa a la siguiente, sin levantarse. En un contorno cerrado sube como una rampa al final de la vuelta; en un trazo abierto, solo si la capa siguiente empieza cerca. Desactivada, la boquilla se levanta 2\u00a0mm y vuelve a bajar en cada cambio de capa.'}
            onChange={v => set('softJoin', v)} />
          {params.softJoin &&
            <Num label="Arco de transición" value={params.transitionLength}
              min={1} step={1} unit="mm"
              hint="Largo del tramo final de cada contorno cerrado en que la boquilla sube hasta la capa siguiente, mientras imprime. Más largo, rampa más suave. Si supera el perímetro, la subida ocupa toda la vuelta. En un trazo abierto es la distancia máxima a la que puede empezar la capa siguiente para unirlas sin levantar."
              onChange={v => set('transitionLength', v)} />}
        </Sec>

        <Sec title="Z-hop en cruces" icon="zhop">
          <Num label="Altura de salto" value={params.zHopHeight}
            min={0} max={10} step={0.1} unit="mm"
            hint={'Cuánto se levanta la boquilla al pasar por donde el trayecto se cruza a sí mismo, para no aplastar el cordón que ya está. Solo salta la segunda pasada.\n0\u00a0=\u00a0sin saltos.'}
            onChange={v => set('zHopHeight', v)} />
          <Num label="Radio de cruce" value={params.hopRadius}
            min={0.5} max={5} step={0.1} unit="mm"
            hint="Distancia a cada lado del cruce en que la boquilla sube y vuelve a bajar, en un arco de parábola. Menor, salto más corto y brusco; mayor, más suave, pero levanta más trazo."
            onChange={v => set('hopRadius', v)} />
        </Sec>

        <Sec title="Desplazamientos" icon="desplazamiento">
          <Num label="Umbral arco desvío" value={params.skirtThreshold}
            min={1} max={200} step={1} unit="mm"
            hint={'Los desplazamientos entre trayectos más largos que esto rodean la pieza en un arco alrededor del centro de la capa, en vez de cruzarla en línea recta. Siempre van 2\u00a0mm por encima de lo más alto ya impreso.'}
            onChange={v => set('skirtThreshold', v)} />
        </Sec>

      </>)}

      </div>
    </div>
  );
}
