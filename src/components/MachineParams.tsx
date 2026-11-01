import React from 'react';
import type { Firmware, PrintParams } from '../types';
import { NumInput } from './NumInput';
import { Icon, type IconName } from './icons';
import { FIRMWARE_LABEL, MACHINE_PROFILES, applyProfile, bedCentre, findProfile } from '../lib/machineProfiles';
import { TEMPLATE_VARS } from '../lib/gcodeGenerator';
import { wrapHint } from '../lib/wrapHint';

interface Props {
  params: PrintParams;
  onChange: (p: PrintParams) => void;
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

function Choice<T extends string>({ label, value, options, hint, onChange }: {
  label: string; value: T; options: [T, string][]; hint?: string; onChange: (v: T) => void;
}) {
  return (
    <>
      <div className="param-row" title={wrapHint(hint)}><label>{label}</label></div>
      <div className="param-row param-check param-choice" title={wrapHint(hint)}>
        {options.map(([v, text]) => (
          <label key={v}>
            <input type="radio" checked={value === v} onChange={() => onChange(v)} />
            {text}
          </label>
        ))}
      </div>
    </>
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

// Placing the part is not a property of the machine: editing it keeps the profile.
const PLACEMENT: (keyof PrintParams)[] = ['gcodeOrigin', 'originX', 'originY', 'marginX', 'marginY'];

export function MachineParams({ params, onChange }: Props) {
  const filament = params.material === 'filament';
  const profile = findProfile(params.machineProfile);

  function set<K extends keyof PrintParams>(k: K, v: PrintParams[K]) {
    onChange({ ...params, [k]: v, ...(PLACEMENT.includes(k) ? {} : { machineProfile: 'custom' }) });
  }

  // Filament speeds read in mm/s, as slicers show them; PrintParams keeps mm/min.
  const speedUnit = filament ? 'mm/s' : 'mm/min';
  const toShown = (v: number) => filament ? +(v / 60).toFixed(1) : v;
  const fromShown = (v: number) => filament ? Math.round(v * 60) : v;
  const speed = (label: string, k: 'printSpeed' | 'travelSpeed' | 'firstLayerSpeed', min = 1, hint?: string) => (
    <Num label={label} value={toShown(params[k])} min={min} step={filament ? 5 : 50} unit={speedUnit} hint={hint}
      onChange={v => set(k, Math.max(min, fromShown(v)))} />
  );

  const centre = bedCentre(params);
  const centred = params.gcodeOrigin === 'centre' && params.originX === centre.x && params.originY === centre.y;

  return (
    <div className="machine-params">
      <Sec title="Perfil" icon="maquina">
        <div className="param-row">
          <select className="machine-select" aria-label="Perfil de impresora" value={profile ? params.machineProfile : 'custom'}
            onChange={e => {
              const pr = findProfile(e.target.value);
              if (pr) onChange(applyProfile(params, pr));
            }}>
            <optgroup label="Arcilla">
              {MACHINE_PROFILES.filter(p => p.values.material === 'clay').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </optgroup>
            <optgroup label="Filamento">
              {MACHINE_PROFILES.filter(p => p.values.material === 'filament').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </optgroup>
            <option value="custom">Personalizado</option>
          </select>
        </div>
        <p className="machine-note">
          {profile
            ? <>{profile.note} Cifras de catálogo, sin verificar en máquina: revisa la cama y las plantillas antes de imprimir.</>
            : 'Valores propios. Elegir un perfil reemplaza la máquina y centra la pieza en su cama.'}
        </p>
        <Choice label="Material" value={params.material} options={[['clay', 'Arcilla'], ['filament', 'Filamento']]}
          hint="Cambia cómo se calcula la extrusión (E). Arcilla: E por mm recorrido según el multiplicador, sin retracción. Filamento: E sale del volumen del cordón, y se suman retracción, ventilador y temperaturas."
          onChange={v => set('material', v)} />
        <div className="param-row" title={wrapHint('Decide cómo se escribe la aceleración (M204, o SET_VELOCITY_LIMIT en Klipper) y qué avisos da la revisión: cuántos segmentos por segundo aguanta y las comprobaciones propias de Prusa, Bambu Lab y Klipper.')}>
          <label>Firmware</label>
          <select className="machine-select machine-select--short" value={params.firmware}
            onChange={e => set('firmware', e.target.value as Firmware)}>
            {(Object.keys(FIRMWARE_LABEL) as Firmware[]).map(f => <option key={f} value={f}>{FIRMWARE_LABEL[f]}</option>)}
          </select>
        </div>
      </Sec>

      <Sec title="Cama y origen" icon="escala">
        <Choice label="Forma de la cama" value={params.bedShape} options={[['rect', 'Rectangular'], ['circle', 'Redonda']]}
          hint="Rectangular: ancho por fondo. Redonda: un diámetro, como en las deltas."
          onChange={v => set('bedShape', v)} />
        <Num label={params.bedShape === 'circle' ? 'Diámetro' : 'Ancho X'} value={params.bedX} min={10} step={10} unit="mm"
          hint="Medida útil de la cama. Se dibuja bajo la pieza, y la revisión avisa si la pieza se sale."
          onChange={v => set('bedX', Math.max(10, v))} />
        {params.bedShape === 'rect' &&
          <Num label="Fondo Y" value={params.bedY} min={10} step={10} unit="mm"
            hint="Medida útil de la cama. Se dibuja bajo la pieza, y la revisión avisa si la pieza se sale." onChange={v => set('bedY', Math.max(10, v))} />}
        <Num label="Altura Z" value={params.bedZ} min={10} step={10} unit="mm"
          hint="La Z más alta a la que llega la máquina. La revisión avisa si la pieza no cabe, y la subida final no pasa de aquí."
          onChange={v => set('bedZ', Math.max(10, v))} />
        <Choice label="Origen de la máquina (X0 Y0)" value={params.bedOrigin}
          options={[['corner', 'Esquina delantera izq.'], ['centre', 'Centro']]}
          hint="Dónde está X0 Y0 en esta impresora: en la esquina delantera izquierda (casi todas las cartesianas) o en el centro (deltas). No mueve la pieza: sirve para dibujar la cama, revisar y centrar."
          onChange={v => set('bedOrigin', v)} />
        <Choice label="Colocar la pieza por" value={params.gcodeOrigin}
          options={[['centre', 'Su centro'], ['corner', 'Su esquina inf. izq.']]}
          hint="Qué punto de la pieza se coloca en la cama. Su centro: el centro de la pieza va a Posición X / Y. Su esquina: la esquina inferior izquierda de la caja de todo lo impreso va a Margen X / Y."
          onChange={v => set('gcodeOrigin', v)} />
        {params.gcodeOrigin === 'corner'
          ? <>
              <Num label="Margen X" icon="mover" value={params.marginX} min={0} step={1} unit="mm"
                hint="Distancia de X0 al borde izquierdo de todo lo impreso." onChange={v => set('marginX', Math.max(0, v))} />
              <Num label="Margen Y" icon="mover" value={params.marginY} min={0} step={1} unit="mm"
                hint="Distancia de Y0 al borde delantero de todo lo impreso." onChange={v => set('marginY', Math.max(0, v))} />
            </>
          : <>
              <Num label="Posición X" icon="mover" value={params.originX} step={1} unit="mm"
                hint="Dónde cae el centro de la pieza, en coordenadas de la máquina. Con el origen en el centro, 0 es el medio de la cama." onChange={v => set('originX', v)} />
              <Num label="Posición Y" icon="mover" value={params.originY} step={1} unit="mm"
                hint="Dónde cae el centro de la pieza, en coordenadas de la máquina. Con el origen en el centro, 0 es el medio de la cama." onChange={v => set('originY', v)} />
            </>}
        <div className="param-info">
          {centred
            ? `→ centrada en la cama (${fmt(centre.x)}, ${fmt(centre.y)})`
            : <button className="btn-small" onClick={() => onChange({ ...params, gcodeOrigin: 'centre', originX: centre.x, originY: centre.y })}>
                Centrar en la cama ({fmt(centre.x)}, {fmt(centre.y)})
              </button>}
        </div>
      </Sec>

      <Sec title="Boquilla y extrusión" icon="extrusion">
        <Num label="Boquilla" value={params.nozzleDiameter} min={0.1} step={filament ? 0.1 : 0.5} unit="mm"
          hint="Diámetro de la boquilla. La revisión lo usa para juzgar la altura de capa y el ancho de cordón, y «Adaptar a la boquilla» ajusta capa, cordón y onda a partir de él."
          onChange={v => set('nozzleDiameter', Math.max(0.1, v))} />
        <Num label="Ancho de cordón" value={params.lineWidth} min={0.1} step={filament ? 0.05 : 0.5} unit="mm"
          hint={filament
            ? 'Ancho del cordón impreso. Con la altura de capa da su volumen, y de ahí E. Lo habitual es entre 1 y 2 veces la boquilla.'
            : 'Ancho del cordón aplastado. En arcilla no cambia el G-code: solo estima el volumen de material y sirve a la revisión.'}
          onChange={v => set('lineWidth', Math.max(0.1, v))} />
        <Check label="Generar valores E" checked={params.generateE}
          hint="Escribe en cada línea cuánto extruir (E). Desactivado, el G-code solo mueve la boquilla: sirve para probar el recorrido en vacío o si la bomba se controla aparte."
          onChange={v => set('generateE', v)} />
        {filament
          ? <>
              <Num label="Diámetro de filamento" value={params.filamentDiameter} min={1} step={0.05} unit="mm"
                hint={'Casi siempre 1,75 o 2,85\u00a0mm. Con el ancho de cordón y la altura de capa da cuánto filamento empujar (E).'}
                onChange={v => set('filamentDiameter', Math.max(1, v))} />
              <Num label="Flujo" value={params.flowRatio} min={10} max={200} step={1} unit="%"
                hint={'Corrige E: con más de 100\u00a0% sale más filamento del calculado, con menos, menos.'}
                onChange={v => set('flowRatio', v)} />
              <Num label="Caudal máximo" value={params.maxVolumetricFlow} min={0} step={1} unit="mm³/s"
                hint={'Volumen que el fusor alcanza a fundir por segundo. La revisión avisa si la velocidad de impresión pide más, y sugiere una velocidad.\n0\u00a0=\u00a0no revisar.'}
                onChange={v => set('maxVolumetricFlow', Math.max(0, v))} />
            </>
          : params.generateE &&
            <Num label="Multiplicador" value={params.extrusionMultiplier} min={0} step={0.005} unit="E/mm"
              hint="Unidades de E por cada mm que recorre la boquilla imprimiendo. Depende de la bomba o el tornillo: súbelo si el cordón sale delgado, bájalo si sale grueso."
              onChange={v => set('extrusionMultiplier', v)} />}
      </Sec>

      {filament && (
        <Sec title="Temperatura y ventilador" icon="calibracion">
          <Num label="Boquilla" value={params.nozzleTemp} min={0} step={5} unit="°C" hint="Temperatura de la boquilla. Entra en el G-code de inicio donde la plantilla dice {nozzleTemp}."
            onChange={v => set('nozzleTemp', v)} />
          <Num label="Cama" value={params.bedTemp} min={0} step={5} unit="°C" hint="Temperatura de la cama. Entra en el G-code de inicio donde la plantilla dice {bedTemp}."
            onChange={v => set('bedTemp', v)} />
          <Num label="Ventilador" value={params.fanSpeed} min={0} max={100} step={5} unit="%"
            hint={'Velocidad del ventilador de capa (M106).\n0\u00a0=\u00a0apagado.'}
            onChange={v => set('fanSpeed', Math.min(100, Math.max(0, v)))} />
          <Num label="Ventilador desde la capa" value={params.fanFromLayer} min={1} step={1}
            hint="Capa en que se enciende el ventilador. Antes queda apagado (M107), para que las primeras capas se peguen a la cama."
            onChange={v => set('fanFromLayer', Math.max(1, Math.round(v)))} />
        </Sec>
      )}

      <Sec title="Movimiento" icon="velocidad">
        {speed('Vel. impresión', 'printSpeed', 1, 'Velocidad de la boquilla mientras extruye. El tiempo estimado sale de aquí.')}
        {speed('Primera capa', 'firstLayerSpeed', 0, 'Velocidad de la primera capa, más lenta para que se pegue a la cama.\n0\u00a0=\u00a0la velocidad de impresión.')}
        {speed('Vel. desplazamiento', 'travelSpeed', 1, 'Velocidad de los movimientos sin extruir: subidas, arcos entre trayectos y bajadas.')}
        <Num label="Tiempo mín. por capa" value={params.minLayerTime} min={0} step={1} unit="s"
          hint={`Si una capa tardaría menos que esto, se imprime más despacio, para que ${filament ? 'se enfríe' : 'se asiente'} antes de la siguiente.\n0\u00a0=\u00a0desactivado.`}
          onChange={v => set('minLayerTime', Math.max(0, v))} />
        <Num label="Aceleración" value={params.accel} min={0} step={500} unit="mm/s²"
          hint={`Se escribe al inicio del G-code (${params.firmware === 'klipper' ? 'SET_VELOCITY_LIMIT' : 'M204'}).\n0\u00a0=\u00a0no se escribe y vale la de la máquina.`}
          onChange={v => set('accel', Math.max(0, v))} />
        {filament && <>
          <Num label="Retracción" value={params.retractLength} min={0} step={0.1} unit="mm"
            hint={'Filamento que se recoge antes de cada desplazamiento entre trayectos y se devuelve al llegar, para que no gotee. Un jarrón de una sola pared casi no tiene desplazamientos.\n0\u00a0=\u00a0sin retracción.'}
            onChange={v => set('retractLength', Math.max(0, v))} />
          {params.retractLength > 0 &&
            <Num label="Vel. retracción" value={toShown(params.retractSpeed)} min={1} step={5} unit={speedUnit}
              hint="Velocidad a la que se recoge y se devuelve el filamento."
              onChange={v => set('retractSpeed', Math.max(1, fromShown(v)))} />}
        </>}
      </Sec>

      <Sec title="Calibración Z" icon="calibracion">
        <Num label="Desplazamiento Z" value={params.nozzleHeightOffset} step={0.1} unit="mm"
          hint="Altura de la primera capa sobre la cama; cada capa siguiente sube una altura de capa. Ajústalo hasta que la primera capa se aplaste lo justo."
          onChange={v => set('nozzleHeightOffset', v)} />
        <Num label="Z de seguridad" icon="zSeguridad" value={params.safeZ} min={0} step={1} unit="mm"
          hint={'Altura a la que la boquilla se acerca al empezar y a la que vuelve tras el cebado. Al terminar sube 10\u00a0mm por encima de esta altura o de la pieza, lo que sea más alto, sin pasar la altura de la máquina.'}
          onChange={v => set('safeZ', v)} />
      </Sec>

      {!filament && (
        <Sec title="Arcilla" icon="arcilla">
          <Num label="Pausa al inicio" icon="reloj" value={params.dwellAtStart} min={0} step={100} unit="ms"
            hint="Espera (G4) con la boquilla ya en el inicio de la primera capa, antes de imprimir, para que la presión de la arcilla se estabilice."
            onChange={v => set('dwellAtStart', v)} />
          <Check label="Cebado de boquilla" icon="cebado" checked={params.primingMove}
            hint="Antes de la pieza imprime una línea recta al lado de la primera capa, para que la arcilla salga pareja desde el primer trazo."
            onChange={v => set('primingMove', v)} />
          {params.primingMove &&
            <Num label="Longitud de cebado" value={params.primingLength} min={1} step={5} unit="mm"
              hint="Largo de la línea de cebado, que corre a lo largo de +X."
              onChange={v => set('primingLength', v)} />}
        </Sec>
      )}

      <Sec title="Inicio y fin" icon="lista">
        <div className="machine-template">
          <label htmlFor="start-gcode">G-code de inicio</label>
          <textarea id="start-gcode" rows={5} spellCheck={false} value={params.startGcode}
            placeholder="Vacío: el programa empieza directamente"
            onChange={e => set('startGcode', e.target.value)} />
          <label htmlFor="end-gcode">G-code de fin</label>
          <textarea id="end-gcode" rows={3} spellCheck={false} value={params.endGcode}
            placeholder="Vacío: M84"
            onChange={e => set('endGcode', e.target.value)} />
          <p className="machine-note">Variables: {TEMPLATE_VARS.map(v => `{${v}}`).join(' ')}</p>
        </div>
      </Sec>
    </div>
  );
}
