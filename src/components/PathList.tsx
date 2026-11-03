import { useState } from 'react';
import type { SampledPath, PrintParams } from '../types';
import { NumInput } from './NumInput';
import { Icon } from './icons';
import { wrapHint } from '../lib/wrapHint';

interface Props {
  paths: SampledPath[];
  params: PrintParams;
  hasKeyframes: boolean;
  onToggle: (id: string) => void;
  onOverride: (
    id: string,
    key: 'ampNOverride' | 'ampTOverride' | 'wlNOverride' | 'wlTOverride',
    value: number | null,
  ) => void;
}

export function PathList({ paths, params, hasKeyframes, onToggle, onOverride }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(paths.map(p => p.id)));

  if (paths.length === 0) return null;

  function toggleCollapse(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="path-list section">
      <div className="section-title"><Icon name="rutas" />Rutas SVG ({paths.length})</div>
      {paths.map(path => {
        const isCollapsed = collapsed.has(path.id);
        return (
          <div key={path.id} className={`path-item ${path.enabled ? '' : 'path-disabled'}`}>
            <div className="path-item-header">
              <input
                type="checkbox"
                checked={path.enabled}
                title={wrapHint('Imprimir esta ruta. Desactivada, no se imprime y la pieza se recentra con las demás.')}
                onChange={() => onToggle(path.id)}
              />
              <code className="path-id" title={`<${path.tagName}> ${path.id}`}>{path.id}</code>
              <span className="path-len" title={wrapHint('Largo del trazo en la cama, a la escala SVG→mm, antes de la onda')}>
                {Math.round(path.totalLength * params.scaleFactor)} mm
              </span>
              <button
                className={`btn-icon path-expand${isCollapsed ? '' : ' path-expand--open'}`}
                onClick={() => toggleCollapse(path.id)}
                aria-expanded={!isCollapsed}
                aria-label={isCollapsed ? `Ajustes de ${path.id}` : `Ocultar ajustes de ${path.id}`}
                title={isCollapsed ? 'Onda propia de esta ruta' : 'Ocultar la onda propia de esta ruta'}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"
                  strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5" /></svg>
              </button>
            </div>

            {!isCollapsed && (
              <div className="path-overrides">
                {hasKeyframes && (
                  <div className="path-overrides-note">
                    Desactivado con keyframes activos
                  </div>
                )}
                {([
                  { key: 'ampNOverride' as const, label: 'Amp N', unit: 'mm', ph: params.lissAmpN },
                  { key: 'ampTOverride' as const, label: 'Amp T', unit: 'mm', ph: params.lissAmpT },
                  { key: 'wlNOverride'  as const, label: 'λ N',   unit: 'mm', ph: params.lissWlN  },
                  { key: 'wlTOverride'  as const, label: 'λ T',   unit: 'mm', ph: params.lissWlT  },
                ]).map(({ key, label, unit, ph }) => (
                  <div className="param-row" key={key} title={wrapHint(`${label} solo para esta ruta. Vacío, vale la del panel Onda.`)}>
                    <label>{label}<span className="unit"> {unit}</span></label>
                    <NumInput
                      min={0} step={0.5}
                      value={path[key] ?? ph}
                      placeholder={String(ph)}
                      disabled={hasKeyframes}
                      onChange={v => onOverride(path.id, key, v)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
