import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FamilyPanel } from './components/FamilyPanel';
import { PrintCheck } from './components/PrintCheck';
import { checkShape, spotIndices, type WaveLimit } from './lib/printability';
import { DEFAULT_SHAPE, FAMILY_FILES, fmt, shapeBounds, shapeLabel, shapePath, shapePoints, type ShapeDoc } from './lib/shape';
import { shapeToSvg } from './lib/toSvg';

interface Props {
  // Null until the first edit; App keeps it so switching workspaces keeps the shape.
  doc: ShapeDoc | null;
  onChange: (doc: ShapeDoc) => void;
  // The print workspace's current wave, to warn where it can't follow the shape.
  wave: WaveLimit;
  // The Forma · Impresión switch, owned by App so both workspaces share it.
  switcher: ReactNode;
  onSend: (svg: string, name: string) => void;
  onHelp: () => void;
}

const MAJOR_EVERY = 5;
const LABEL_PX = 11;
const SEAM_PX = 5;
const ARROW_PX = 14;
const SPOT_PX = 10;

export function ShaperView({ doc: docIn, onChange, wave, switcher, onSend, onHelp }: Props) {
  const doc = docIn ?? DEFAULT_SHAPE;
  const pts = useMemo(() => shapePoints(doc), [doc]);
  const d = useMemo(() => shapePath(pts), [pts]);
  const check = useMemo(() => checkShape(pts, wave), [pts, wave]);
  const tightPaths = useMemo(() => check.tight.map(t =>
    'M' + spotIndices(t, pts.length).map(i => `${fmt(pts[i].x, 2)} ${fmt(-pts[i].y, 2)}`).join('L')), [check, pts]);

  // The frame grows in steps, so changing the size visibly changes the
  // shape against the grid instead of rescaling the view.
  const frame = Math.max(100, Math.ceil((doc.sizeMM * 1.3) / 20) * 20);
  const grid = frame <= 300 ? 10 : 50;
  const reach = Math.ceil((frame * 2) / grid) * grid;

  const svgRef = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // mm per screen pixel; the viewBox is square and fitted inside the canvas.
  const mmPerPx = box.w && box.h ? frame / Math.min(box.w, box.h) : frame / 600;

  const lines: { v: number; major: boolean }[] = [];
  for (let v = -reach; v <= reach; v += grid) lines.push({ v, major: Math.round(v / grid) % MAJOR_EVERY === 0 });

  // Direction arrow a little way along the outline from the seam.
  const seam = pts[0];
  const ahead = pts[Math.min(pts.length - 1, Math.max(1, Math.round((ARROW_PX * mmPerPx * 2.5) / 0.25)))];
  const dir = Math.atan2(-(ahead.y - seam.y), ahead.x - seam.x);
  const tip = { x: ahead.x, y: -ahead.y };
  const wing = (a: number) => `${tip.x - Math.cos(dir + a) * ARROW_PX * mmPerPx * 0.6} ${tip.y - Math.sin(dir + a) * ARROW_PX * mmPerPx * 0.6}`;

  return (
    <div className="app-stage shaper-stage">
      <svg ref={svgRef} className="shaper-canvas" viewBox={`${-frame / 2} ${-frame / 2} ${frame} ${frame}`}
        preserveAspectRatio="xMidYMid meet" role="img" aria-label={shapeLabel(doc)}>
        <g className="shaper-grid">
          {lines.map(({ v, major }) => (
            <g key={v} className={major ? 'shaper-grid-major' : undefined}>
              <line x1={v} y1={-reach} x2={v} y2={reach} />
              <line x1={-reach} y1={v} x2={reach} y2={v} />
            </g>
          ))}
        </g>
        <g className="shaper-axes">
          <line x1={-reach} y1={0} x2={reach} y2={0} />
          <line x1={0} y1={-reach} x2={0} y2={reach} />
        </g>
        <g className="shaper-ruler" style={{ fontSize: LABEL_PX * mmPerPx }}>
          {lines.filter(l => l.major && l.v !== 0).map(({ v }) => (
            <g key={v}>
              <text x={v + 3 * mmPerPx} y={-3 * mmPerPx}>{v}</text>
              <text x={3 * mmPerPx} y={v - 3 * mmPerPx}>{-v}</text>
            </g>
          ))}
          <text x={3 * mmPerPx} y={-3 * mmPerPx}>0 mm</text>
        </g>
        <circle className="shaper-size" cx={0} cy={0} r={doc.sizeMM / 2}>
          <title>Diámetro exterior: {fmt(doc.sizeMM, 1)} mm</title>
        </circle>
        <path className="shaper-shape" d={d} />
        {tightPaths.map((td, i) => <path key={i} className="shaper-tight" d={td} />)}
        {check.tight.map((t, i) => (
          <circle key={i} className="shaper-spot" cx={pts[t.index].x} cy={-pts[t.index].y} r={SPOT_PX * mmPerPx}>
            <title>Más cerrado que lo que la onda puede seguir: R {fmt(t.radiusMM, 1)} mm</title>
          </circle>
        ))}
        <path className="shaper-arrow" d={`M${wing(0.5)}L${tip.x} ${tip.y}L${wing(-0.5)}`} />
        <circle className="shaper-seam" cx={seam.x} cy={-seam.y} r={SEAM_PX * mmPerPx}>
          <title>Costura: aquí empieza y termina cada capa. La flecha marca el sentido.</title>
        </circle>
      </svg>

      <aside className="float-panel panel-left shaper-panel">
        <div className="panel-scroll">
          <div className="panel-header">{switcher}</div>
          <FamilyPanel doc={doc} onChange={onChange} />
          <PrintCheck check={check} wave={wave} doc={doc} bounds={shapeBounds(pts)} />
        </div>
      </aside>

      <div className="stage-bar shaper-bar">
        <div className="bar-group bar-group--end">
          <span className="stage-summary">{shapeLabel(doc)}</span>
          <button className="btn-primary" onClick={() => onSend(shapeToSvg(doc), FAMILY_FILES[doc.family])}
            title="Cargar esta forma en Impresión, a su tamaño real">Enviar a impresión</button>
          <button className="btn-icon" onClick={onHelp} aria-haspopup="dialog"
            aria-label="Ayuda: cómo usar BarroCode" title="Ayuda (?)">?</button>
        </div>
      </div>
    </div>
  );
}
