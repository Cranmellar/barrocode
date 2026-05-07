import type { SampledPath, PrintParams } from '../types';
import { NumInput } from './NumInput';

interface Props {
  paths: SampledPath[];
  params: PrintParams;
  onToggle: (id: string) => void;
  onOverride: (
    id: string,
    key: 'ampNOverride' | 'ampTOverride' | 'wlNOverride' | 'wlTOverride',
    value: number | null,
  ) => void;
}

export function PathList({ paths, params, onToggle, onOverride }: Props) {
  if (paths.length === 0) return null;

  return (
    <div className="path-list section">
      <div className="section-title">Rutas SVG ({paths.length})</div>
      {paths.map(path => (
        <div key={path.id} className={`path-item ${path.enabled ? '' : 'path-disabled'}`}>
          <div className="path-item-header">
            <label>
              <input type="checkbox" checked={path.enabled}
                onChange={() => onToggle(path.id)} />
              <code>{path.id}</code>
              <span className="path-tag">{path.tagName}</span>
            </label>
            <span className="path-len">{path.totalLength.toFixed(1)} u</span>
          </div>
          {path.enabled && (
            <div className="path-overrides">
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
                    onChange={v => onOverride(path.id, key, v)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
