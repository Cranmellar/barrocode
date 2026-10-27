import React, { useState } from 'react';
import type { PrintParams } from '../types';
import { NumInput } from './NumInput';
import { CenterScaleParams } from './CenterScaleParams';

interface Props { params: PrintParams; onChange: (p: PrintParams) => void; svgMmPerUnit: number | null }

function Num({ label, value, min, max, step, unit, hint, onChange }: {
  label: string; value: number; min?: number; max?: number;
  step?: number; unit?: string; hint?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="param-row" title={hint}>
      <label>{label}{unit && <span className="unit"> {unit}</span>}</label>
      <NumInput value={value} min={min} max={max} step={step} onChange={onChange} />
    </div>
  );
}

function Check({ label, checked, hint, onChange }: {
  label: string; checked: boolean; hint?: string; onChange: (v: boolean) => void;
}) {
  return (
    <div className="param-row param-check" title={hint}>
      <label>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        {label}
      </label>
    </div>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="section">
      <div className="section-title">{title}</div>
      {children}
    </div>
  );
}

type GroupId = 'pieza' | 'trayecto' | 'maquina';

const GROUPS_KEY = 'barrocode.leftGroups';
const ALL_OPEN: Record<GroupId, boolean> = { pieza: true, trayecto: true, maquina: true };

function loadGroups(): Record<GroupId, boolean> {
  try {
    const saved = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? 'null');
    return saved ? { ...ALL_OPEN, ...saved } : ALL_OPEN;
  } catch {
    return ALL_OPEN;
  }
}

function Group({ title, summary, open, onToggle, children }: {
  title: string; summary: string; open: boolean;
  onToggle: (open: boolean) => void; children: React.ReactNode;
}) {
  return (
    <details className="param-group" open={open}
      onToggle={e => onToggle((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="param-group-head">
        <span className="param-group-title">{title}</span>
        <span className="param-group-summary">{summary}</span>
      </summary>
      {children}
    </details>
  );
}

export function PathParams({ params, onChange, svgMmPerUnit }: Props) {
  const [groups, setGroups] = useState(loadGroups);

  function set<K extends keyof PrintParams>(k: K, v: PrintParams[K]) {
    onChange({ ...params, [k]: v });
  }

  function toggleGroup(id: GroupId, open: boolean) {
    if (groups[id] === open) return;
    const next = { ...groups, [id]: open };
    setGroups(next);
    try { localStorage.setItem(GROUPS_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  }

  const effLayers = params.useNumLayers
    ? params.numLayers
    : Math.max(1, Math.ceil(params.totalHeight / params.layerHeight));
  const height = +(effLayers * params.layerHeight).toFixed(1);

  return (
    <div className="path-params">
      <Group title="Pieza" open={groups.pieza} onToggle={v => toggleGroup('pieza', v)}
        summary={`${effLayers} capas · ${height} mm`}>
        <Sec title="Capas">
          <Num label="Altura de capa" value={params.layerHeight}
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
            ? <Num label="Núm. de capas" value={params.numLayers} min={1} step={1}
                onChange={v => set('numLayers', Math.max(1, Math.round(v)))} />
            : <>
                <Num label="Altura total" value={params.totalHeight}
                  min={0.1} step={1} unit="mm"
                  onChange={v => set('totalHeight', v)} />
                <div className="param-info">→ {effLayers} capas</div>
              </>}
        </Sec>

        <Sec title="Escala y posición">
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
          <Num label="Origen X" value={params.originX} step={1} unit="mm"
            onChange={v => set('originX', v)} />
          <Num label="Origen Y" value={params.originY} step={1} unit="mm"
            onChange={v => set('originY', v)} />
          <Check label="Invertir eje Y" checked={params.flipY}
            hint="El eje Y del SVG crece hacia abajo; actívalo si la impresora usa Y hacia arriba"
            onChange={v => set('flipY', v)} />
        </Sec>

        <CenterScaleParams params={params} onChange={onChange} />
      </Group>

      <Group title="Trayecto" open={groups.trayecto} onToggle={v => toggleGroup('trayecto', v)}
        summary={[
          params.softJoin ? 'unión suave' : 'sin unión',
          params.zHopHeight > 0 ? `z-hop ${params.zHopHeight} mm` : 'sin z-hop',
        ].join(' · ')}>
        <Sec title="Dirección">
          <Check label="Invertir dirección" checked={params.reversePath}
            onChange={v => set('reversePath', v)} />
          <Check label="Alternar por capa" checked={params.alternateDirection}
            hint="Las capas impares se recorren en sentido contrario"
            onChange={v => set('alternateDirection', v)} />
          <Check label="Cerrar trayecto" checked={params.closePath}
            hint="Añade un movimiento de regreso al inicio de cada ruta"
            onChange={v => set('closePath', v)} />
        </Sec>

        <Sec title="Unión de capas">
          <Check label="Transición Z suave" checked={params.softJoin}
            hint="Extruye de forma continua entre capas sin retracción ni elevación"
            onChange={v => set('softJoin', v)} />
          {params.softJoin &&
            <Num label="Arco de transición" value={params.transitionLength}
              min={1} step={1} unit="mm"
              hint="Distancia máxima de la transición entre capas; si la capa siguiente empieza más lejos (trayectos abiertos), se viaja elevado sin extruir"
              onChange={v => set('transitionLength', v)} />}
        </Sec>

        <Sec title="Z-hop en cruces">
          <Num label="Altura de salto" value={params.zHopHeight}
            min={0} max={10} step={0.1} unit="mm"
            hint="La boquilla se eleva al pasar sobre un cruce del propio trayecto. 0 = desactivado"
            onChange={v => set('zHopHeight', v)} />
          <Num label="Radio de cruce" value={params.hopRadius}
            min={0.5} max={5} step={0.1} unit="mm"
            hint="Distancia a cada lado del cruce en la que sube y baja la boquilla. Menor = salto más abrupto"
            onChange={v => set('hopRadius', v)} />
        </Sec>

        <Sec title="Desplazamientos">
          <Num label="Umbral arco desvío" value={params.skirtThreshold}
            min={1} max={200} step={1} unit="mm"
            hint="Desplazamientos más largos que este valor siguen un arco concéntrico alrededor del centroide de la capa en lugar de ir en línea recta"
            onChange={v => set('skirtThreshold', v)} />
        </Sec>

        <Sec title="Muestreo">
          <Num label="Espaciado de muestra" value={params.sampleSpacing}
            min={0.1} step={0.5} unit="u. SVG"
            hint="Distancia entre puntos de muestra sobre el trayecto (unidades SVG)"
            onChange={v => set('sampleSpacing', v)} />
        </Sec>
      </Group>

      <Group title="Máquina" open={groups.maquina} onToggle={v => toggleGroup('maquina', v)}
        summary={`${params.printSpeed} mm/min${params.generateE ? ` · E ×${params.extrusionMultiplier}` : ' · sin E'}`}>
        <Sec title="Velocidades">
          <Num label="Vel. impresión" value={params.printSpeed}
            min={1} step={50} unit="mm/min"
            onChange={v => set('printSpeed', v)} />
          <Num label="Vel. desplazamiento" value={params.travelSpeed}
            min={1} step={100} unit="mm/min"
            onChange={v => set('travelSpeed', v)} />
        </Sec>

        <Sec title="Extrusión">
          <Check label="Generar valores E" checked={params.generateE}
            hint="Incluye la columna E en el G-code. Desactívalo para salida solo de movimiento."
            onChange={v => set('generateE', v)} />
          {params.generateE &&
            <Num label="Multiplicador" value={params.extrusionMultiplier}
              min={0} step={0.005} unit="E/mm"
              hint="Unidades E por mm de desplazamiento — ajústalo a tu sistema de bomba/tornillo"
              onChange={v => set('extrusionMultiplier', v)} />}
        </Sec>

        <Sec title="Calibración Z">
          <Num label="Desplazamiento Z" value={params.nozzleHeightOffset}
            step={0.1} unit="mm"
            hint="Se suma a la Z de cada capa — útil para calibración de primera capa"
            onChange={v => set('nozzleHeightOffset', v)} />
          <Num label="Z de seguridad" value={params.safeZ}
            min={0} step={1} unit="mm"
            hint="Altura de los desplazamientos al inicio y durante el cebado. Al terminar, la boquilla sube 10 mm sobre esta altura o sobre la pieza, la que sea mayor"
            onChange={v => set('safeZ', v)} />
        </Sec>

        <Sec title="Arcilla">
          <Num label="Pausa al inicio" value={params.dwellAtStart}
            min={0} step={100} unit="ms"
            hint="G4 al inicio del primer trayecto — deja estabilizarse el flujo"
            onChange={v => set('dwellAtStart', v)} />
          <Check label="Cebado de boquilla" checked={params.primingMove}
            hint="Extruye una línea corta para cebar la boquilla antes de imprimir"
            onChange={v => set('primingMove', v)} />
          {params.primingMove &&
            <Num label="Longitud de cebado" value={params.primingLength}
              min={1} step={5} unit="mm"
              onChange={v => set('primingLength', v)} />}
        </Sec>
      </Group>
    </div>
  );
}
