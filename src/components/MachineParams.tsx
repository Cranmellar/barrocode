import React from 'react';
import type { Firmware, PrintParams } from '../types';
import { NumInput } from './NumInput';
import { Icon, type IconName } from './icons';
import { FIRMWARE_LABEL, MACHINE_PROFILES, applyProfile, bedCentre, findProfile } from '../lib/machineProfiles';
import { TEMPLATE_VARS } from '../lib/gcodeGenerator';

interface Props {
  params: PrintParams;
  onChange: (p: PrintParams) => void;
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

function Choice<T extends string>({ label, value, options, hint, onChange }: {
  label: string; value: T; options: [T, string][]; hint?: string; onChange: (v: T) => void;
}) {
  return (
    <>
      <div className="param-row" title={hint}><label>{label}</label></div>
      <div className="param-row param-check param-choice" title={hint}>
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
          hint="Arcilla: E es un multiplicador de la bomba y nunca hay retracción. Filamento: E es el volumen del cordón, con retracción, ventilador y temperaturas"
          onChange={v => set('material', v)} />
        <div className="param-row" title="Decide cómo se llama a la aceleración y qué avisos da la revisión">
          <label>Firmware</label>
          <select className="machine-select machine-select--short" value={params.firmware}
            onChange={e => set('firmware', e.target.value as Firmware)}>
            {(Object.keys(FIRMWARE_LABEL) as Firmware[]).map(f => <option key={f} value={f}>{FIRMWARE_LABEL[f]}</option>)}
          </select>
        </div>
      </Sec>

      <Sec title="Cama y origen" icon="escala">
        <Choice label="Forma de la cama" value={params.bedShape} options={[['rect', 'Rectangular'], ['circle', 'Redonda']]}
          onChange={v => set('bedShape', v)} />
        <Num label={params.bedShape === 'circle' ? 'Diámetro' : 'Ancho X'} value={params.bedX} min={10} step={10} unit="mm"
          onChange={v => set('bedX', Math.max(10, v))} />
        {params.bedShape === 'rect' &&
          <Num label="Fondo Y" value={params.bedY} min={10} step={10} unit="mm" onChange={v => set('bedY', Math.max(10, v))} />}
        <Num label="Altura Z" value={params.bedZ} min={10} step={10} unit="mm"
          hint="La Z más alta a la que llega la máquina; la subida final no pasa de aquí"
          onChange={v => set('bedZ', Math.max(10, v))} />
        <Choice label="Origen de la máquina (X0 Y0)" value={params.bedOrigin}
          options={[['corner', 'Esquina delantera izq.'], ['centre', 'Centro']]}
          hint="Dónde está X0 Y0 en esta impresora: en una esquina (casi todas las cartesianas) o en el centro (deltas)"
          onChange={v => set('bedOrigin', v)} />
        <Choice label="Colocar la pieza por" value={params.gcodeOrigin}
          options={[['centre', 'Su centro'], ['corner', 'Su esquina inf. izq.']]}
          hint="Su centro: el centro de la pieza va a Posición X / Y. Su esquina: la esquina inferior izquierda de su caja va a Margen X / Y"
          onChange={v => set('gcodeOrigin', v)} />
        {params.gcodeOrigin === 'corner'
          ? <>
              <Num label="Margen X" icon="mover" value={params.marginX} min={0} step={1} unit="mm" onChange={v => set('marginX', Math.max(0, v))} />
              <Num label="Margen Y" icon="mover" value={params.marginY} min={0} step={1} unit="mm" onChange={v => set('marginY', Math.max(0, v))} />
            </>
          : <>
              <Num label="Posición X" icon="mover" value={params.originX} step={1} unit="mm" onChange={v => set('originX', v)} />
              <Num label="Posición Y" icon="mover" value={params.originY} step={1} unit="mm" onChange={v => set('originY', v)} />
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
          onChange={v => set('nozzleDiameter', Math.max(0.1, v))} />
        <Num label="Ancho de cordón" value={params.lineWidth} min={0.1} step={filament ? 0.05 : 0.5} unit="mm"
          hint={filament ? 'Ancho del cordón impreso; con la altura de capa da el volumen de E' : 'Solo para estimar el volumen de arcilla y revisar la capa'}
          onChange={v => set('lineWidth', Math.max(0.1, v))} />
        <Check label="Generar valores E" checked={params.generateE}
          hint="Incluye la columna E en el G-code. Desactívalo para salida solo de movimiento"
          onChange={v => set('generateE', v)} />
        {filament
          ? <>
              <Num label="Diámetro de filamento" value={params.filamentDiameter} min={1} step={0.05} unit="mm"
                onChange={v => set('filamentDiameter', Math.max(1, v))} />
              <Num label="Flujo" value={params.flowRatio} min={10} max={200} step={1} unit="%"
                onChange={v => set('flowRatio', v)} />
              <Num label="Caudal máximo" value={params.maxVolumetricFlow} min={0} step={1} unit="mm³/s"
                hint="Lo que el fusor alcanza a fundir; la revisión avisa si la velocidad pide más. 0 = sin revisar"
                onChange={v => set('maxVolumetricFlow', Math.max(0, v))} />
            </>
          : params.generateE &&
            <Num label="Multiplicador" value={params.extrusionMultiplier} min={0} step={0.005} unit="E/mm"
              hint="Unidades E por mm de desplazamiento — ajústalo a tu sistema de bomba/tornillo"
              onChange={v => set('extrusionMultiplier', v)} />}
      </Sec>

      {filament && (
        <Sec title="Temperatura y ventilador" icon="calibracion">
          <Num label="Boquilla" value={params.nozzleTemp} min={0} step={5} unit="°C" hint="{nozzleTemp} en el G-code de inicio"
            onChange={v => set('nozzleTemp', v)} />
          <Num label="Cama" value={params.bedTemp} min={0} step={5} unit="°C" hint="{bedTemp} en el G-code de inicio"
            onChange={v => set('bedTemp', v)} />
          <Num label="Ventilador" value={params.fanSpeed} min={0} max={100} step={5} unit="%"
            onChange={v => set('fanSpeed', Math.min(100, Math.max(0, v)))} />
          <Num label="Ventilador desde la capa" value={params.fanFromLayer} min={1} step={1}
            onChange={v => set('fanFromLayer', Math.max(1, Math.round(v)))} />
        </Sec>
      )}

      <Sec title="Movimiento" icon="velocidad">
        {speed('Vel. impresión', 'printSpeed')}
        {speed('Primera capa', 'firstLayerSpeed', 0, '0 = la velocidad de impresión')}
        {speed('Vel. desplazamiento', 'travelSpeed')}
        <Num label="Tiempo mín. por capa" value={params.minLayerTime} min={0} step={1} unit="s"
          hint={`Las capas más cortas se imprimen más despacio para ${filament ? 'enfriar' : 'asentarse'}. 0 = desactivado`}
          onChange={v => set('minLayerTime', Math.max(0, v))} />
        <Num label="Aceleración" value={params.accel} min={0} step={500} unit="mm/s²"
          hint="0 = la que tenga la máquina"
          onChange={v => set('accel', Math.max(0, v))} />
        {filament && <>
          <Num label="Retracción" value={params.retractLength} min={0} step={0.1} unit="mm"
            hint="Filamento que se recoge en cada desplazamiento entre trayectos. Un jarrón de una pared apenas tiene. 0 = sin retracción"
            onChange={v => set('retractLength', Math.max(0, v))} />
          {params.retractLength > 0 &&
            <Num label="Vel. retracción" value={toShown(params.retractSpeed)} min={1} step={5} unit={speedUnit}
              onChange={v => set('retractSpeed', Math.max(1, fromShown(v)))} />}
        </>}
      </Sec>

      <Sec title="Calibración Z" icon="calibracion">
        <Num label="Desplazamiento Z" value={params.nozzleHeightOffset} step={0.1} unit="mm"
          hint="Se suma a la Z de cada capa — útil para calibración de primera capa"
          onChange={v => set('nozzleHeightOffset', v)} />
        <Num label="Z de seguridad" icon="zSeguridad" value={params.safeZ} min={0} step={1} unit="mm"
          hint="Altura de los desplazamientos al inicio y durante el cebado. Al terminar, la boquilla sube 10 mm sobre esta altura o sobre la pieza, sin pasar la altura de la máquina"
          onChange={v => set('safeZ', v)} />
      </Sec>

      {!filament && (
        <Sec title="Arcilla" icon="arcilla">
          <Num label="Pausa al inicio" icon="reloj" value={params.dwellAtStart} min={0} step={100} unit="ms"
            hint="G4 al inicio del primer trayecto — deja estabilizarse el flujo"
            onChange={v => set('dwellAtStart', v)} />
          <Check label="Cebado de boquilla" icon="cebado" checked={params.primingMove}
            hint="Extruye una línea corta para cebar la boquilla antes de imprimir"
            onChange={v => set('primingMove', v)} />
          {params.primingMove &&
            <Num label="Longitud de cebado" value={params.primingLength} min={1} step={5} unit="mm"
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
