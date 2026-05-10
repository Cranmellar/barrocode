import { useState } from 'react';
import type { SampledPath, PrintParams } from '../types';
import { NumInput } from './NumInput';

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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
      <div className="section-title">Rutas SVG ({paths.length})</div>
      {paths.map(path => {
        const isCollapsed = collapsed.has(path.id);
        return (
          <div key={path.id} className={`path-item ${path.enabled ? '' : 'path-disabled'}`}>
            <div className="path-item-header">
              <input
                type="checkbox"
                checked={path.enabled}
                onChange={() => onToggle(path.id)}
              />
              <code className="path-id">{path.id}</code>

              {/* Tag pill doubles as the collapse toggle */}
              <button
                className={`path-tag${isCollapsed ? ' path-tag-collapsed' : ''}`}
                onClick={() => toggleCollapse(path.id)}
                title={isCollapsed ? 'Expandir parámetros' : 'Colapsar parámetros'}
              >
                {path.tagName}
              </button>

              <span className="path-len">{path.totalLength.toFixed(1)} u</span>
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
                  <div className="param-row" key={key}>
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
