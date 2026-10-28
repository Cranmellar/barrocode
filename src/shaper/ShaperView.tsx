import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { DiscoveryGrid } from './components/DiscoveryGrid';
import { FamilyPanel } from './components/FamilyPanel';
import { PathPanel } from './components/PathPanel';
import { PrintCheck } from './components/PrintCheck';
import { MIN_SPREAD, NARROW, type Batch, type Variant } from './lib/discovery';
import { familySymmetry, fitOutline } from './lib/fit';
import {
  canBeSymmetric, copiesOf, deleteNode, deleteSymmetric, mapNodes, moveAnchor, moveHandle, nearestOnPath,
  pathD, propagate, reverseNodes, rotateStart, setSmooth, setStraight, splitSegment, splitSymmetric,
  type PathNode,
} from './lib/pathModel';
import { checkShape, spotIndices, type WaveLimit } from './lib/printability';
import {
  DEFAULT_SHAPE, fileName, fmt, outerDiameter, shapeBounds, shapeLabel, shapePath, shapePoints, type ShapeDoc,
} from './lib/shape';
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
const NODE_PX = 7;
const HANDLE_PX = 4;
// A double click this close to the path adds a node there.
const INSERT_PX = 8;
// Edits closer together than this undo as one step (a slider drag, typing).
const COALESCE_MS = 400;
const HISTORY = 200;

type Drag = { kind: 'anchor' | 'in' | 'out'; i: number; moved: boolean; frame: number };

export function ShaperView({ doc: docIn, onChange, wave, switcher, onSend, onHelp }: Props) {
  const doc = docIn ?? DEFAULT_SHAPE;
  const nodes = doc.path;
  const pts = useMemo(() => shapePoints(doc), [doc]);
  const d = useMemo(() => nodes ? pathD(nodes) : shapePath(pts), [nodes, pts]);
  const check = useMemo(() => checkShape(pts, wave), [pts, wave]);
  const tightPaths = useMemo(() => check.tight.map(t =>
    'M' + spotIndices(t, pts.length).map(i => `${fmt(pts[i].x, 2)} ${fmt(-pts[i].y, 2)}`).join('L')), [check, pts]);
  const diameter = nodes ? outerDiameter(pts) : doc.sizeMM;

  // ── Undo ─────────────────────────────────────────────────────────────────
  const past = useRef<ShapeDoc[]>([]);
  const future = useRef<ShapeDoc[]>([]);
  const lastEdit = useRef(0);
  const commit = (next: ShapeDoc, merge?: boolean) => {
    const now = performance.now();
    if (!(merge ?? now - lastEdit.current < COALESCE_MS)) {
      past.current.push(doc);
      if (past.current.length > HISTORY) past.current.shift();
    }
    lastEdit.current = now;
    future.current = [];
    onChange(next);
  };
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(doc);
    lastEdit.current = 0;
    onChange(prev);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(doc);
    lastEdit.current = 0;
    onChange(next);
  };

  // ── Path editing ─────────────────────────────────────────────────────────
  const [sel, setSel] = useState<number | null>(null);
  const [snap, setSnap] = useState(false);
  useEffect(() => {
    if (sel !== null && (!nodes || sel >= nodes.length)) setSel(null);
  }, [nodes, sel]);
  const order = doc.pathOrder;
  const canSym = !!nodes && canBeSymmetric(nodes, order);
  const symOn = canSym && doc.pathSymmetric;

  /** Commits new nodes after an edit of `touched`, copied to every sector when symmetric. */
  const editPath = (next: PathNode[], touched: number[], merge?: boolean, extra: Partial<ShapeDoc> = {}) =>
    commit({ ...doc, ...extra, path: symOn ? touched.reduce((acc, i) => propagate(acc, i, order), next) : next }, merge);

  const toPath = () => {
    const fit = fitOutline(pts, familySymmetry(doc));
    setBatch(null);
    setSel(null);
    commit({ ...doc, path: fit.nodes, pathOrder: fit.order, pathSymmetric: fit.order > 1 }, false);
  };
  const insertAt = (seg: number, u: number) => {
    if (!nodes) return;
    const shift = symOn ? copiesOf(nodes.length, seg, order).filter(c => c < seg).length : 0;
    commit({ ...doc, path: symOn ? splitSymmetric(nodes, seg, u, order) : splitSegment(nodes, seg, u) }, false);
    setSel(seg + 1 + shift);
  };
  const remove = (i: number) => {
    if (!nodes || nodes.length - (symOn ? order : 1) < 3) return;
    commit({ ...doc, path: symOn ? deleteSymmetric(nodes, i, order) : deleteNode(nodes, i) }, false);
    setSel(null);
  };

  // ── Discovery ────────────────────────────────────────────────────────────
  // Non-null while the discovery grid is open.
  const [batch, setBatch] = useState<Batch | null>(null);
  const newSeed = () => Math.floor(Math.random() * 2 ** 31);
  // Another family's tab gets a fresh batch of its own.
  useEffect(() => {
    setBatch(b => b && b.base.family !== doc.family ? { base: doc, spread: 1, seed: newSeed() } : b);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.family]);
  const adopt = (v: Variant) => commit({ ...doc, ...v }, false);

  // ── Keyboard: undo, delete, deselect ─────────────────────────────────────
  const keysRef = useRef({ undo, redo, remove, sel, close: () => {} });
  useEffect(() => {
    keysRef.current = {
      undo, redo, remove, sel,
      close: () => { if (batch) setBatch(null); else setSel(null); },
    };
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      // Text and number fields keep their own undo and Delete.
      if (el.closest('input:not([type="range"]):not([type="checkbox"]), textarea, select, [contenteditable="true"]')) return;
      const k = keysRef.current;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'y')) {
        if (key === 'y' || e.shiftKey) k.redo(); else k.undo();
      } else if ((key === 'delete' || key === 'backspace') && k.sel !== null) {
        k.remove(k.sel);
      } else if (key === 'escape') {
        k.close();
      } else {
        return;
      }
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Canvas ───────────────────────────────────────────────────────────────
  const svgRef = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const drag = useRef<Drag | null>(null);
  // The frame grows in steps, so changing the size visibly changes the
  // shape against the grid instead of rescaling the view; a drag keeps it.
  const frame = drag.current?.frame ?? Math.max(100, Math.ceil((diameter * 1.3) / 20) * 20);
  const grid = frame <= 300 ? 10 : 50;
  const reach = Math.ceil((frame * 2) / grid) * grid;
  // mm per screen pixel; the viewBox is square and fitted inside the canvas.
  const mmPerPx = box.w && box.h ? frame / Math.min(box.w, box.h) : frame / 600;

  const toMM = (e: { clientX: number; clientY: number }) => {
    const m = svgRef.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: -p.y };
  };
  const startDrag = (e: ReactPointerEvent, kind: Drag['kind'], i: number) => {
    e.stopPropagation();
    svgRef.current!.setPointerCapture(e.pointerId);
    drag.current = { kind, i, moved: false, frame };
    setSel(i);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const g = drag.current;
    if (!g || !nodes) return;
    let { x, y } = toMM(e);
    if (snap) { x = Math.round(x); y = Math.round(y); }
    const next = g.kind === 'anchor' ? moveAnchor(nodes, g.i, x, y) : moveHandle(nodes, g.i, g.kind, x, y);
    editPath(next, [g.i], g.moved);
    g.moved = true;
  };
  const endDrag = () => { drag.current = null; };

  const lines: { v: number; major: boolean }[] = [];
  for (let v = -reach; v <= reach; v += grid) lines.push({ v, major: Math.round(v / grid) % MAJOR_EVERY === 0 });

  // Direction arrow a little way along the outline from the seam.
  const seam = pts[0];
  const ahead = pts[Math.min(pts.length - 1, Math.max(1, Math.round((ARROW_PX * mmPerPx * 2.5) / 0.25)))];
  const dir = Math.atan2(-(ahead.y - seam.y), ahead.x - seam.x);
  const tip = { x: ahead.x, y: -ahead.y };
  const wing = (a: number) => `${tip.x - Math.cos(dir + a) * ARROW_PX * mmPerPx * 0.6} ${tip.y - Math.sin(dir + a) * ARROW_PX * mmPerPx * 0.6}`;

  const selNode = nodes && sel !== null ? nodes[sel] : null;
  const copies = nodes && sel !== null && symOn ? copiesOf(nodes.length, sel, order) : [];
  const label = shapeLabel(doc, pts);

  return (
    <div className="app-stage shaper-stage">
      <svg ref={svgRef} className={`shaper-canvas${nodes ? ' shaper-canvas--edit' : ''}`}
        viewBox={`${-frame / 2} ${-frame / 2} ${frame} ${frame}`}
        preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}
        onPointerDown={() => { if (nodes) setSel(null); }}
        onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
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
        <circle className="shaper-size" cx={0} cy={0} r={diameter / 2}>
          <title>Diámetro exterior: {fmt(diameter, 1)} mm</title>
        </circle>
        <path className="shaper-shape" d={d} />
        {nodes && (
          <path className="shaper-hit" d={d}
            onDoubleClick={e => {
              const hit = nearestOnPath(nodes, toMM(e));
              if (hit.dist < INSERT_PX * mmPerPx) insertAt(hit.seg, hit.u);
            }}>
            <title>Doble clic: añadir un nodo</title>
          </path>
        )}
        {tightPaths.map((td, i) => <path key={i} className="shaper-tight" d={td} />)}
        {check.tight.map((t, i) => (
          <circle key={i} className="shaper-spot" cx={pts[t.index].x} cy={-pts[t.index].y} r={SPOT_PX * mmPerPx}>
            <title>Más cerrado que lo que la onda puede seguir: R {fmt(t.radiusMM, 1)} mm</title>
          </circle>
        ))}
        <path className="shaper-arrow" d={`M${wing(0.5)}L${tip.x} ${tip.y}L${wing(-0.5)}`} />

        {nodes && selNode && (
          <g className="shaper-handles">
            {(['in', 'out'] as const).map(side => {
              const hx = side === 'in' ? selNode.inX : selNode.outX, hy = side === 'in' ? selNode.inY : selNode.outY;
              if (Math.hypot(hx - selNode.x, hy - selNode.y) < 1e-6) return null;
              return (
                <g key={side}>
                  <line className="shaper-handle-line" x1={selNode.x} y1={-selNode.y} x2={hx} y2={-hy} />
                  <circle className="shaper-handle" cx={hx} cy={-hy} r={HANDLE_PX * mmPerPx}
                    onPointerDown={e => startDrag(e, side, sel!)} />
                </g>
              );
            })}
          </g>
        )}
        {nodes && nodes.map((p, i) => i === 0 ? null : (
          <rect key={i}
            className={`shaper-node${i === sel ? ' shaper-node--on' : copies.includes(i) ? ' shaper-node--copy' : ''}`}
            x={p.x - (NODE_PX / 2) * mmPerPx} y={-p.y - (NODE_PX / 2) * mmPerPx}
            width={NODE_PX * mmPerPx} height={NODE_PX * mmPerPx}
            onPointerDown={e => startDrag(e, 'anchor', i)}>
            <title>Nodo {i + 1}</title>
          </rect>
        ))}
        <circle className={`shaper-seam${nodes ? ' shaper-seam--node' : ''}${sel === 0 ? ' shaper-seam--on' : ''}`}
          cx={seam.x} cy={-seam.y} r={SEAM_PX * mmPerPx}
          onPointerDown={nodes ? e => startDrag(e, 'anchor', 0) : undefined}>
          <title>Costura: aquí empieza y termina cada capa. La flecha marca el sentido.</title>
        </circle>
      </svg>

      <aside className="float-panel panel-left shaper-panel">
        <div className="panel-scroll">
          <div className="panel-header">{switcher}</div>
          {nodes ? (
            <PathPanel nodes={nodes} order={order} symmetric={doc.pathSymmetric} canSymmetric={canSym}
              diameterMM={diameter} clockwise={doc.clockwise} sel={sel} snap={snap}
              onSelect={setSel}
              onSymmetric={on => commit({ ...doc, pathSymmetric: on }, false)}
              onSnap={setSnap}
              onMove={(i, x, y) => editPath(moveAnchor(nodes, i, x, y), [i])}
              onSmooth={(i, on) => editPath(setSmooth(nodes, i, on), [i], false)}
              onStraight={(i, on) => editPath(setStraight(nodes, i, on), [i, (i + 1) % nodes.length], false)}
              onDelete={remove}
              onSeam={i => { commit({ ...doc, path: rotateStart(nodes, i) }, false); setSel(0); }}
              onDiameter={mm => {
                const k = mm / diameter;
                editPath(mapNodes(nodes, p => ({ x: p.x * k, y: p.y * k })), [], undefined, { sizeMM: mm });
              }}
              onReverse={() => {
                commit({ ...doc, path: reverseNodes(nodes), clockwise: !doc.clockwise }, false);
                if (sel !== null) setSel((nodes.length - sel) % nodes.length);
              }}
              onBackToFamily={() => { setSel(null); commit({ ...doc, path: null }, false); }} />
          ) : (
            <FamilyPanel doc={doc} onChange={next => commit(next)} onEditPoints={toPath} />
          )}
          <PrintCheck check={check} wave={wave} doc={doc} bounds={shapeBounds(pts)} />
        </div>
      </aside>

      {batch && !nodes && (
        <DiscoveryGrid doc={doc} batch={batch} wave={wave} onAdopt={adopt}
          onMore={() => setBatch({ base: doc, spread: Math.max(MIN_SPREAD, batch.spread * NARROW), seed: newSeed() })}
          onAnother={() => setBatch({ base: doc, spread: 1, seed: newSeed() })} />
      )}

      <div className="stage-bar shaper-bar">
        <div className="bar-group bar-group--end">
          <button className="btn-icon" onClick={undo} disabled={past.current.length === 0}
            aria-label="Deshacer" title="Deshacer (Ctrl+Z)">↶</button>
          <button className="btn-icon" onClick={redo} disabled={future.current.length === 0}
            aria-label="Rehacer" title="Rehacer (Ctrl+Shift+Z)">↷</button>
          <button className={`btn-toggle${batch && !nodes ? ' btn-toggle--on' : ''}`} aria-pressed={!!batch && !nodes}
            disabled={!!nodes}
            onClick={() => setBatch(batch ? null : { base: doc, spread: 1, seed: newSeed() })}
            title={nodes ? 'Solo con las familias: vuelve a la familia para ver variaciones'
              : 'Ver nueve variaciones de esta familia y elegir con el ojo'}>Descubrir</button>
          <span className="stage-summary">{label}</span>
          <button className="btn-primary" onClick={() => onSend(shapeToSvg(doc), fileName(doc))}
            title="Cargar esta forma en Impresión, a su tamaño real">Enviar a impresión</button>
          <button className="btn-icon" onClick={onHelp} aria-haspopup="dialog"
            aria-label="Ayuda: cómo usar BarroCode" title="Ayuda (?)">?</button>
        </div>
      </div>
    </div>
  );
}
