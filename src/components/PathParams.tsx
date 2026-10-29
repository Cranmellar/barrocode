import React, { useRef, useState } from 'react';
import type { PrintParams } from '../types';
import { NumInput } from './NumInput';
import { CenterScaleParams } from './CenterScaleParams';
import { Icon, type IconName } from './icons';
import { MAX_LAYERS, SAMPLES_PER_CYCLE, layerCount, suggestedSpacingMM } from '../lib/waveGenerator';

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
    <div className="param-row" title={hint}>
      <label>{icon && <Icon name={icon} />}{label}{unit && <span className="unit"> {unit}</span>}</label>
      <NumInput value={value} min={min} max={max} step={step} onChange={onChange} />
    </div>
  );
}

function Check({ label, icon, checked, hint, onChange }: {
  label: string; icon?: IconName; checked: boolean; hint?: string; onChange: (v: boolean) => void;
}) {
  return (
    <div className="param-row param-check" title={hint}>
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
        hint={`Distancia entre los puntos que se toman del trazo. Más fino: curvas más suaves, pero más líneas de G-code y cada cambio tarda más en recalcularse. Lo justo son unos ${SAMPLES_PER_CYCLE} puntos por ciclo de la onda más corta. Mínimo 0,1.`}
        onChange={onSpacing} />
      <div className={`resolution resolution--${verdict}`}>
        <div className="resolution-facts">
          {sf !== 1 && <span>{fmt(mm)} mm reales</span>}
          {perCycle === null
            ? <span>sin onda: entre 1 y 2 mm basta</span>
            : <span>{fmt(Math.round(perCycle * 10) / 10)} puntos por ciclo (λ {fmt(shortestWl!)} mm)</span>}
        </div>
        <p>
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

type GroupId = 'pieza' | 'trayecto' | 'maquina';

const TAB_KEY = 'barrocode.leftTab';
const TABS: { id: GroupId; title: string; icon: IconName }[] = [
  { id: 'pieza', title: 'Pieza', icon: 'pieza' },
  { id: 'trayecto', title: 'Trayecto', icon: 'trayecto' },
  { id: 'maquina', title: 'Máquina', icon: 'maquina' },
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
    maquina: `${params.printSpeed} mm/min${params.generateE ? ` · E ×${params.extrusionMultiplier}` : ' · sin E'}`,
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
                hint={`Máximo ${MAX_LAYERS} capas`}
                onChange={v => set('numLayers', Math.max(1, Math.round(v)))} />
            : <>
                <Num label="Altura total" icon="escalaY" value={params.totalHeight}
                  min={0.1} step={1} unit="mm"
                  onChange={v => set('totalHeight', v)} />
                <div className="param-info">
                  → {effLayers} capas{effLayers === MAX_LAYERS && ` (máximo)`}
                </div>
              </>}
        </Sec>

        <Resolution params={params} shortestWl={shortestWl} onSpacing={v => set('sampleSpacing', v)} />

        <Sec title="Escala y posición" icon="escala">
          <Num label="Factor de escala" value={params.scaleFactor}
            min={0.001} step={0.1} unit="SVG→mm"
            hint="Multiplica todas las coordenadas SVG para obtener milímetros."
            onChange={v => set('scaleFactor', v)} />
          {svgMmPerUnit !== null && (params.scaleFactor === svgMmPerUnit
            ? <div className="param-info">→ tamaño real del SVG</div>
            : <div className="param-info">
                <button className="btn-small" onClick={() => set('scaleFactor', svgMmPerUnit)}
                  title="El SVG declara su tamaño en unidades físicas">
                  Usar tamaño real (×{svgMmPerUnit})
                </button>
              </div>)}
          <Num label="Posición X" icon="mover" value={params.originX} step={1} unit="mm"
            hint="Dónde queda el centro de la pieza en la cama; 0, 0 es el origen de la impresora" onChange={v => set('originX', v)} />
          <Num label="Posición Y" icon="mover" value={params.originY} step={1} unit="mm"
            hint="Dónde queda el centro de la pieza en la cama; 0, 0 es el origen de la impresora" onChange={v => set('originY', v)} />
          <Check label="Invertir eje Y" icon="reflejar" checked={params.flipY}
            hint="El eje Y del SVG crece hacia abajo; actívalo si la impresora usa Y hacia arriba"
            onChange={v => set('flipY', v)} />
        </Sec>

        <CenterScaleParams params={params} onChange={onChange} />
      </>)}

      {tab === 'trayecto' && (<>
        <Sec title="Dirección" icon="direccion">
          <Check label="Invertir dirección" checked={params.reversePath}
            onChange={v => set('reversePath', v)} />
          <Check label="Alternar por capa" checked={params.alternateDirection}
            hint="Las capas impares se recorren en sentido contrario"
            onChange={v => set('alternateDirection', v)} />
          <Check label="Cerrar trayecto" checked={params.closePath}
            hint="Añade un movimiento de regreso al inicio de cada ruta"
            onChange={v => set('closePath', v)} />
        </Sec>

        <Sec title="Unión de capas" icon="union">
          <Check label="Transición Z suave" checked={params.softJoin}
            hint="Extruye de forma continua entre capas sin retracción ni elevación"
            onChange={v => set('softJoin', v)} />
          {params.softJoin &&
            <Num label="Arco de transición" value={params.transitionLength}
              min={1} step={1} unit="mm"
              hint="Tramo final de cada ruta cerrada en el que la Z sube hasta la capa siguiente. Si supera el perímetro, la subida ocupa toda la vuelta"
              onChange={v => set('transitionLength', v)} />}
        </Sec>

        <Sec title="Z-hop en cruces" icon="zhop">
          <Num label="Altura de salto" value={params.zHopHeight}
            min={0} max={10} step={0.1} unit="mm"
            hint="La boquilla se eleva al pasar sobre un cruce del propio trayecto. 0 = desactivado"
            onChange={v => set('zHopHeight', v)} />
          <Num label="Radio de cruce" value={params.hopRadius}
            min={0.5} max={5} step={0.1} unit="mm"
            hint="Distancia a cada lado del cruce en la que sube y baja la boquilla. Menor = salto más abrupto"
            onChange={v => set('hopRadius', v)} />
        </Sec>

        <Sec title="Desplazamientos" icon="desplazamiento">
          <Num label="Umbral arco desvío" value={params.skirtThreshold}
            min={1} max={200} step={1} unit="mm"
            hint="Desplazamientos más largos que este valor siguen un arco concéntrico alrededor del centroide de la capa en lugar de ir en línea recta"
            onChange={v => set('skirtThreshold', v)} />
        </Sec>

      </>)}

      {tab === 'maquina' && (<>
        <Sec title="Velocidades" icon="velocidad">
          <Num label="Vel. impresión" value={params.printSpeed}
            min={1} step={50} unit="mm/min"
            onChange={v => set('printSpeed', v)} />
          <Num label="Vel. desplazamiento" value={params.travelSpeed}
            min={1} step={100} unit="mm/min"
            onChange={v => set('travelSpeed', v)} />
        </Sec>

        <Sec title="Extrusión" icon="extrusion">
          <Check label="Generar valores E" checked={params.generateE}
            hint="Incluye la columna E en el G-code. Desactívalo para salida solo de movimiento."
            onChange={v => set('generateE', v)} />
          {params.generateE &&
            <Num label="Multiplicador" value={params.extrusionMultiplier}
              min={0} step={0.005} unit="E/mm"
              hint="Unidades E por mm de desplazamiento — ajústalo a tu sistema de bomba/tornillo"
              onChange={v => set('extrusionMultiplier', v)} />}
        </Sec>

        <Sec title="Calibración Z" icon="calibracion">
          <Num label="Desplazamiento Z" value={params.nozzleHeightOffset}
            step={0.1} unit="mm"
            hint="Se suma a la Z de cada capa — útil para calibración de primera capa"
            onChange={v => set('nozzleHeightOffset', v)} />
          <Num label="Z de seguridad" icon="zSeguridad" value={params.safeZ}
            min={0} step={1} unit="mm"
            hint="Altura de los desplazamientos al inicio y durante el cebado. Al terminar, la boquilla sube 10 mm sobre esta altura o sobre la pieza, la que sea mayor"
            onChange={v => set('safeZ', v)} />
        </Sec>

        <Sec title="Arcilla" icon="arcilla">
          <Num label="Pausa al inicio" icon="reloj" value={params.dwellAtStart}
            min={0} step={100} unit="ms"
            hint="G4 al inicio del primer trayecto — deja estabilizarse el flujo"
            onChange={v => set('dwellAtStart', v)} />
          <Check label="Cebado de boquilla" icon="cebado" checked={params.primingMove}
            hint="Extruye una línea corta para cebar la boquilla antes de imprimir"
            onChange={v => set('primingMove', v)} />
          {params.primingMove &&
            <Num label="Longitud de cebado" value={params.primingLength}
              min={1} step={5} unit="mm"
              onChange={v => set('primingLength', v)} />}
        </Sec>
      </>)}
      </div>
    </div>
  );
}
