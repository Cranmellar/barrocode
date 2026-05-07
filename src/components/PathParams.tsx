import React from 'react';
import type { PrintParams } from '../types';
import { NumInput } from './NumInput';

interface Props { params: PrintParams; onChange: (p: PrintParams) => void }

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

export function PathParams({ params, onChange }: Props) {
  function set<K extends keyof PrintParams>(k: K, v: PrintParams[K]) {
    onChange({ ...params, [k]: v });
  }

  const effLayers = params.useNumLayers
    ? params.numLayers
    : Math.max(1, Math.ceil(params.totalHeight / params.layerHeight));

  return (
    <div className="path-params">
      <Sec title="Muestreo">
        <Num label="Espaciado de muestra" value={params.sampleSpacing}
          min={0.1} step={0.5} unit="u. SVG"
          hint="Distancia entre puntos de muestra sobre el trayecto (unidades SVG)"
          onChange={v => set('sampleSpacing', v)} />
      </Sec>

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
        <Num label="Desplazamiento Z" value={params.nozzleHeightOffset}
          step={0.1} unit="mm"
          hint="Se suma a la Z de cada capa — útil para calibración de primera capa"
          onChange={v => set('nozzleHeightOffset', v)} />
      </Sec>

      <Sec title="Unión de capas">
        <Check label="Transición Z suave" checked={params.softJoin}
          hint="Extruye de forma continua entre capas sin retracción ni elevación"
          onChange={v => set('softJoin', v)} />
        {params.softJoin
          ? <Num label="Arco de transición" value={params.transitionLength}
              min={1} step={1} unit="mm"
              hint="Longitud del arco durante el cual sube la Z al pasar de capa"
              onChange={v => set('transitionLength', v)} />
          : <Num label="Z de seguridad" value={params.safeZ}
              min={0} step={1} unit="mm"
              onChange={v => set('safeZ', v)} />}
      </Sec>

      <Sec title="Escala y posición">
        <Num label="Factor de escala" value={params.scaleFactor}
          min={0.001} step={0.1} unit="SVG→mm"
          hint="Multiplica todas las coordenadas SVG para obtener milímetros."
          onChange={v => set('scaleFactor', v)} />
        <Num label="Origen X" value={params.originX} step={1} unit="mm"
          onChange={v => set('originX', v)} />
        <Num label="Origen Y" value={params.originY} step={1} unit="mm"
          onChange={v => set('originY', v)} />
        <Check label="Invertir eje Y" checked={params.flipY}
          hint="El eje Y del SVG crece hacia abajo; actívalo si la impresora usa Y hacia arriba"
          onChange={v => set('flipY', v)} />
      </Sec>

      <Sec title="Velocidades">
        <Num label="Vel. impresión" value={params.printSpeed}
          min={1} step={50} unit="mm/min"
          onChange={v => set('printSpeed', v)} />
        <Num label="Vel. desplazamiento" value={params.travelSpeed}
          min={1} step={100} unit="mm/min"
          onChange={v => set('travelSpeed', v)} />
      </Sec>

      <Sec title="Opciones de trayecto">
        <Check label="Invertir dirección" checked={params.reversePath}
          onChange={v => set('reversePath', v)} />
        <Check label="Alternar por capa" checked={params.alternateDirection}
          hint="Las capas impares se recorren en sentido contrario"
          onChange={v => set('alternateDirection', v)} />
        <Check label="Cerrar trayecto" checked={params.closePath}
          hint="Añade un movimiento de regreso al inicio de cada ruta"
          onChange={v => set('closePath', v)} />
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
    </div>
  );
}
