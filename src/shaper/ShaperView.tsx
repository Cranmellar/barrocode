import { useMemo, type ReactNode } from 'react';
import { DEFAULT_SHAPE, seamPoint, shapeBounds, shapeLabel, shapePath } from './lib/shape';
import { shapeToSvg } from './lib/toSvg';

interface Props {
  // The Forma · Impresión switch, owned by App so both workspaces share it.
  switcher: ReactNode;
  onSend: (svg: string, name: string) => void;
  onHelp: () => void;
}

const GRID_MM = 10;
const GRID_MAJOR = 5;

export function ShaperView({ switcher, onSend, onHelp }: Props) {
  const doc = DEFAULT_SHAPE;
  const b = shapeBounds(doc);
  const seam = seamPoint(doc);

  // Room around the shape; the grid runs further so it fills any window shape.
  const pad = Math.max(b.width, b.height) * 0.35;
  const viewBox = `${b.x - pad} ${b.y - pad} ${b.width + 2 * pad} ${b.height + 2 * pad}`;
  const grid = useMemo(() => {
    const reach = Math.ceil(Math.max(b.width, b.height) * 3 / GRID_MM) * GRID_MM;
    const lines: { v: number; major: boolean }[] = [];
    for (let v = -reach; v <= reach; v += GRID_MM) {
      lines.push({ v, major: Math.round(v / GRID_MM) % GRID_MAJOR === 0 });
    }
    return { reach, lines };
  }, [b.width, b.height]);

  return (
    <div className="app-stage shaper-stage">
      <svg className="shaper-canvas" viewBox={viewBox} preserveAspectRatio="xMidYMid meet"
        role="img" aria-label={shapeLabel(doc)}>
        <g className="shaper-grid">
          {grid.lines.map(({ v, major }) => (
            <g key={v} className={major ? 'shaper-grid-major' : undefined}>
              <line x1={v} y1={-grid.reach} x2={v} y2={grid.reach} />
              <line x1={-grid.reach} y1={v} x2={grid.reach} y2={v} />
            </g>
          ))}
        </g>
        <g className="shaper-axes">
          <line x1={-grid.reach} y1={0} x2={grid.reach} y2={0} />
          <line x1={0} y1={-grid.reach} x2={0} y2={grid.reach} />
        </g>
        <path className="shaper-shape" d={shapePath(doc)} />
        <circle className="shaper-seam" cx={seam.x} cy={seam.y} r={Math.max(b.width, b.height) * 0.015}>
          <title>Costura: aquí empieza y termina cada capa</title>
        </circle>
      </svg>

      <aside className="float-panel panel-left shaper-panel">
        <div className="panel-scroll">
          <div className="panel-header">{switcher}</div>
          <div className="section">
            <div className="section-title">Forma</div>
            <div className="param-row"><span>Círculo</span><span className="shaper-value">Ø {doc.sizeMM} mm</span></div>
            <p className="shaper-note">
              Forma de prueba. Envíala a impresión para darle onda y generar el G-code.
            </p>
          </div>
        </div>
      </aside>

      <div className="stage-bar shaper-bar">
        <div className="bar-group bar-group--end">
          <span className="stage-summary">{shapeLabel(doc)}</span>
          <button className="btn-primary" onClick={() => onSend(shapeToSvg(doc), 'circulo')}
            title="Cargar esta forma en Impresión, a su tamaño real">Enviar a impresión</button>
          <button className="btn-icon" onClick={onHelp} aria-haspopup="dialog"
            aria-label="Ayuda: cómo usar BarroCode" title="Ayuda (?)">?</button>
        </div>
      </div>
    </div>
  );
}
