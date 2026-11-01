import type { ReactNode } from 'react';
import type { PrintParams } from '../types';
import type { ToolpathLayer } from '../lib/toolpath';
import type { GcodeStats } from '../lib/gcodeStats';
import type { MachineCheck } from '../lib/machineCheck';
import { Icon } from './icons';

interface Props {
  params: PrintParams;
  toolpath: ToolpathLayer[];
  checks: MachineCheck[];
  stats: GcodeStats | null;
  gcodeBytes: number;
  busy: boolean;
  onCentre: () => void;
  onAdapt: () => void;
  headerExtra?: ReactNode;
}

const PLA_DENSITY = 1.24;   // g/cm³
const CLAY_DENSITY = 1.8;   // g/cm³, wet

const n = (v: number, d = 1) => v.toLocaleString('es', { maximumFractionDigits: d });

function duration(sec: number): string {
  const min = Math.round(sec / 60);
  return min < 60 ? `${Math.max(1, min)} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

const ICON = { err: 'aviso', warn: 'aviso', ok: 'ok' } as const;

export function MachineReview({ params, toolpath, checks, stats, gcodeBytes, busy, onCentre, onAdapt, headerExtra }: Props) {
  const errs = checks.filter(c => c.level === 'err').length;
  const warns = checks.filter(c => c.level === 'warn').length;
  const filament = params.material === 'filament';
  const bead = params.lineWidth * params.layerHeight;
  const volume = stats ? bead * stats.printLength / 1000 : 0;   // cm³
  const grams = volume * (filament ? PLA_DENSITY : CLAY_DENSITY);
  const filamentM = filament ? bead * (stats?.printLength ?? 0) / (Math.PI * (params.filamentDiameter / 2) ** 2) / 1000 : 0;
  const top = toolpath.length ? Math.max(...toolpath[toolpath.length - 1].paths.flatMap(p => p.map(q => q.z))) : 0;

  return (
    <div className="machine-review">
      <div className="panel-header">
        <span className="panel-title">Revisión previa</span>
        <span className="panel-header-actions">
          <span className="machine-count">
            {toolpath.length === 0 ? '' : errs ? `${errs} error${errs > 1 ? 'es' : ''}` : warns ? `${warns} aviso${warns > 1 ? 's' : ''}` : 'todo en orden'}
          </span>
          {headerExtra}
        </span>
      </div>

      {toolpath.length === 0
        ? <p className="machine-empty">Carga un SVG o envía una forma para revisar el G-code en esta máquina.</p>
        : (
          <ul className={`check-list${busy ? ' check-list--stale' : ''}`}>
            {checks.map((c, i) => (
              <li key={i} className={`check-item check-item--${c.level}`}>
                <Icon name={ICON[c.level]} />
                <div>
                  <span className="check-title">{c.title}</span>
                  {c.detail && <span className="check-detail">{c.detail}</span>}
                  {c.action === 'centre' && <button className="btn-small" onClick={onCentre}>Centrar en la cama</button>}
                  {c.action === 'adapt' && <button className="btn-small" onClick={onAdapt}>Adaptar a la boquilla</button>}
                </div>
              </li>
            ))}
          </ul>
        )}

      {stats && toolpath.length > 0 && (
        <div className="section">
          <div className="section-title">Resumen</div>
          <dl className={`machine-stats${busy ? ' check-list--stale' : ''}`}>
            <dt>Tiempo</dt><dd>{duration(stats.timeSec)}</dd>
            {filament
              ? <><dt>Filamento</dt><dd>{n(filamentM, 2)} m · {n(grams, 0)} g de PLA</dd></>
              : <><dt>Arcilla</dt><dd>{n(volume, 0)} cm³ · ≈ {n(grams / 1000, 2)} kg</dd></>}
            <dt>Capas</dt><dd>{toolpath.length} × {n(params.layerHeight, 2)} mm</dd>
            <dt>Caja</dt><dd>X {n(stats.box.minX)} a {n(stats.box.maxX)}<br />Y {n(stats.box.minY)} a {n(stats.box.maxY)}<br />Z hasta {n(top)} mm</dd>
            <dt>Recorrido</dt><dd>{n(stats.printLength / 1000, 1)} m impresos · {n(stats.travelLength / 1000, 1)} m en vacío</dd>
            <dt>Archivo</dt><dd>{n(gcodeBytes / 1e6, 1)} MB</dd>
          </dl>
          <p className="machine-note">Tiempo a la velocidad programada, sin aceleraciones: la impresión real tarda algo más.</p>
        </div>
      )}

      {toolpath.length > 0 && (
        <div className="section">
          <div className="section-title">Adaptar a la boquilla</div>
          <p className="machine-note machine-note--pad">
            Ajusta altura de capa, ancho de cordón, onda N y espaciado de muestra a una boquilla de {n(params.nozzleDiameter, 2)} mm
            {filament ? ' de filamento' : ' de arcilla'}. Sirve de punto de partida al cambiar de material.
          </p>
          <div className="param-info"><button className="btn-small" onClick={onAdapt}>Adaptar onda y capas</button></div>
        </div>
      )}
    </div>
  );
}
