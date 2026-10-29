import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { DiscoveryGrid } from './components/DiscoveryGrid';
import { FamilyPanel } from './components/FamilyPanel';
import { PathPanel, type NodeRef } from './components/PathPanel';
import { PrintCheck } from './components/PrintCheck';
import { MIN_SPREAD, NARROW, type Batch, type Variant } from './lib/discovery';
import { familySymmetry, fitOutline } from './lib/fit';
import {
  canBeSymmetric, copiesOf, deleteNode, deleteSymmetric, mapNodes, moveAnchor, moveHandle, nearestOnPath,
  pathD, propagate, reverseNodes, rotateStart, setSmooth, setStraight, splitSegment, splitSymmetric,
  type PathNode,
} from './lib/pathModel';
import type { Pt } from './lib/families';
import { checkShape, spotIndices, waveBand, type PrintCheck as Check, type WaveLimit } from './lib/printability';
import {
  DEFAULT_SHAPE, fileName, fmt, outerDiameter, shapeBounds, shapeLabel, shapeOutlines, shapePath, shapePoints,
  type ShapeDoc, type ShapeImport,
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
  // An SVG's closed outlines to turn into nodes; done calls onIncomingDone.
  incoming: ShapeImport | null;
  onIncomingDone: () => void;
  onImportFile: (file: File) => void;
  // The SVG loaded in Impresión, when there is one Forma didn't send.
  printName: string | null;
  onImportPrint: () => void;
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

const loopD = (pts: Pt[]) => 'M' + pts.map(p => `${fmt(p.x, 2)} ${fmt(-p.y, 2)}`).join('L') + 'Z';

type Drag = { kind: 'anchor' | 'in' | 'out'; c: number; i: number; moved: boolean; frame: number };

export function ShaperView(props: Props) {
  const { doc: docIn, onChange, wave, switcher, onSend, onHelp, incoming, onIncomingDone } = props;
  // A shape saved by an older version may lack newer fields.
  const doc = useMemo(() => docIn ? { ...DEFAULT_SHAPE, ...docIn } : DEFAULT_SHAPE, [docIn]);
  const contours = doc.contours;
  const outlines = useMemo(() => shapeOutlines(doc), [doc]);
  const ds = useMemo(() => contours ? contours.map(pathD) : [shapePath(outlines)], [contours, outlines]);
  const checks = useMemo(() => outlines.map(o => checkShape(o, wave)), [outlines, wave]);
  const check: Check = {
    minRadiusMM: Math.min(...checks.map(c => c.minRadiusMM)),
    tight: checks.flatMap(c => c.tight),
  };
  const tightPaths = useMemo(() => checks.flatMap((c, k) => c.tight.map(t =>
    'M' + spotIndices(t, outlines[k].length).map(i => `${fmt(outlines[k][i].x, 2)} ${fmt(-outlines[k][i].y, 2)}`).join('L'))),
  [checks, outlines]);
  const diameter = contours ? outerDiameter(outlines) : doc.sizeMM;
  const [showBand, setShowBand] = useState(true);
  const bands = useMemo(() => wave.ampNMM > 0 ? outlines.map(o => waveBand(o, wave.ampNMM)) : [], [outlines, wave.ampNMM]);

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
  const [sel, setSel] = useState<NodeRef | null>(null);
  const [snap, setSnap] = useState(false);
  useEffect(() => {
    if (sel && !(contours && sel.c < contours.length && sel.i < contours[sel.c].length)) setSel(null);
  }, [contours, sel]);
  const order = doc.pathOrder;
  // Symmetry belongs to a single contour fitted from a family.
  const canSym = !!contours && contours.length === 1 && canBeSymmetric(contours[0], order);
  const symOn = canSym && doc.pathSymmetric;

  const withContour = (c: number, next: PathNode[]) => contours!.map((k, j) => (j === c ? next : k));
  /** Commits contour c's new nodes after an edit of `touched`, copied to every sector when symmetric. */
  const editContour = (c: number, next: PathNode[], touched: number[], merge?: boolean, extra: Partial<ShapeDoc> = {}) =>
    commit({ ...doc, ...extra, contours: withContour(c, symOn ? touched.reduce((acc, i) => propagate(acc, i, order), next) : next) }, merge);

  const toPath = () => {
    const fit = fitOutline(shapePoints(doc), familySymmetry(doc));
    setBatch(null);
    setSel(null);
    commit({ ...doc, contours: [fit.nodes], pathOrder: fit.order, pathSymmetric: fit.order > 1 }, false);
  };
  const insertAt = (c: number, seg: number, u: number) => {
    const nodes = contours![c];
    const shift = symOn ? copiesOf(nodes.length, seg, order).filter(k => k < seg).length : 0;
    commit({ ...doc, contours: withContour(c, symOn ? splitSymmetric(nodes, seg, u, order) : splitSegment(nodes, seg, u)) }, false);
    setSel({ c, i: seg + 1 + shift });
  };
  const remove = ({ c, i }: NodeRef) => {
    const nodes = contours?.[c];
    if (!nodes || nodes.length - (symOn ? order : 1) < 3) return;
    commit({ ...doc, contours: withContour(c, symOn ? deleteSymmetric(nodes, i, order) : deleteNode(nodes, i)) }, false);
    setSel(null);
  };

  // ── Import ───────────────────────────────────────────────────────────────
  const [importNote, setImportNote] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => {
    if (!incoming) return;
    if (incoming.error) {
      setImportNote({ text: incoming.error, error: true });
    } else {
      const fitted = incoming.outlines.map(o => fitOutline(o, 1).nodes);
      // Area sign of the first contour: negative runs clockwise seen from above.
      const o = incoming.outlines[0];
      const area = o.reduce((a, p, i) => a + p.x * o[(i + 1) % o.length].y - o[(i + 1) % o.length].x * p.y, 0);
      setBatch(null);
      setSel(null);
      commit({ ...doc, contours: fitted, pathOrder: 1, pathSymmetric: false, clockwise: area < 0 }, false);
      const parts = fitted.length === 1 ? '1 contorno' : `${fitted.length} contornos`;
      setImportNote({
        text: `${incoming.name}: ${parts}${incoming.open ? `; se dejaron fuera ${incoming.open} trazados abiertos` : ''}.`,
        error: false,
      });
    }
    onIncomingDone();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);
  const fileRef = useRef<HTMLInputElement>(null);

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
  // With nodes, Descubrir leaves them for the family (undo brings them back).
  const toggleDiscover = () => {
    if (batch && !contours) { setBatch(null); return; }
    if (contours) { setSel(null); commit({ ...doc, contours: null }, false); }
    setBatch({ base: doc, spread: 1, seed: newSeed() });
  };
  const isDefault = !docIn || JSON.stringify(doc) === JSON.stringify(DEFAULT_SHAPE);
  const reset = () => {
    setBatch(null);
    setSel(null);
    setImportNote(null);
    commit(DEFAULT_SHAPE, false);
  };

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
      } else if ((key === 'delete' || key === 'backspace') && k.sel) {
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
  const startDrag = (e: ReactPointerEvent, kind: Drag['kind'], c: number, i: number) => {
    e.stopPropagation();
    svgRef.current!.setPointerCapture(e.pointerId);
    drag.current = { kind, c, i, moved: false, frame };
    setSel({ c, i });
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const g = drag.current;
    if (!g || !contours) return;
    let { x, y } = toMM(e);
    if (snap) { x = Math.round(x); y = Math.round(y); }
    const nodes = contours[g.c];
    const next = g.kind === 'anchor' ? moveAnchor(nodes, g.i, x, y) : moveHandle(nodes, g.i, g.kind, x, y);
    editContour(g.c, next, [g.i], g.moved);
    g.moved = true;
  };
  const endDrag = () => { drag.current = null; };

  const lines: { v: number; major: boolean }[] = [];
  for (let v = -reach; v <= reach; v += grid) lines.push({ v, major: Math.round(v / grid) % MAJOR_EVERY === 0 });

  // Each outline's seam and, a little way along, an arrow for its direction.
  const seams = outlines.map(o => {
    const seam = o[0];
    const ahead = o[Math.min(o.length - 1, Math.max(1, Math.round((ARROW_PX * mmPerPx * 2.5) / 0.25)))];
    const dir = Math.atan2(-(ahead.y - seam.y), ahead.x - seam.x);
    const tip = { x: ahead.x, y: -ahead.y };
    const wing = (a: number) => `${tip.x - Math.cos(dir + a) * ARROW_PX * mmPerPx * 0.6} ${tip.y - Math.sin(dir + a) * ARROW_PX * mmPerPx * 0.6}`;
    return { seam, arrow: `M${wing(0.5)}L${tip.x} ${tip.y}L${wing(-0.5)}` };
  });

  const selNode = contours && sel ? contours[sel.c]?.[sel.i] : null;
  const copies = contours && sel && symOn ? copiesOf(contours[0].length, sel.i, order) : [];
  const label = shapeLabel(doc, outlines);

  return (
    <div className="app-stage shaper-stage">
      <svg ref={svgRef} className={`shaper-canvas${contours ? ' shaper-canvas--edit' : ''}`}
        viewBox={`${-frame / 2} ${-frame / 2} ${frame} ${frame}`}
        preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}
        onPointerDown={() => { if (contours) setSel(null); }}
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
        {showBand && bands.length > 0 && (
          <g className="shaper-band">
            {outlines.map((o, c) => (
              <path key={c} className="shaper-band-fill" d={loopD(o)} style={{ strokeWidth: 2 * wave.ampNMM }} />
            ))}
            {bands.flatMap(([a, b], c) => [
              <path key={`a${c}`} className="shaper-band-edge" d={loopD(a)} />,
              <path key={`b${c}`} className="shaper-band-edge" d={loopD(b)} />,
            ])}
          </g>
        )}
        {ds.map((d, c) => <path key={c} className="shaper-shape" d={d} />)}
        {contours && ds.map((d, c) => (
          <path key={c} className="shaper-hit" d={d}
            onDoubleClick={e => {
              const hit = nearestOnPath(contours[c], toMM(e));
              if (hit.dist < INSERT_PX * mmPerPx) insertAt(c, hit.seg, hit.u);
            }}>
            <title>Doble clic: añadir un nodo</title>
          </path>
        ))}
        {tightPaths.map((td, i) => <path key={i} className="shaper-tight" d={td} />)}
        {checks.flatMap((c, k) => c.tight.map((t, i) => (
          <circle key={`${k}:${i}`} className="shaper-spot" cx={outlines[k][t.index].x} cy={-outlines[k][t.index].y} r={SPOT_PX * mmPerPx}>
            <title>Más cerrado que lo que la onda puede seguir: R {fmt(t.radiusMM, 1)} mm</title>
          </circle>
        )))}
        {seams.map((s, c) => <path key={c} className="shaper-arrow" d={s.arrow} />)}

        {selNode && sel && (
          <g className="shaper-handles">
            {(['in', 'out'] as const).map(side => {
              const hx = side === 'in' ? selNode.inX : selNode.outX, hy = side === 'in' ? selNode.inY : selNode.outY;
              if (Math.hypot(hx - selNode.x, hy - selNode.y) < 1e-6) return null;
              return (
                <g key={side}>
                  <line className="shaper-handle-line" x1={selNode.x} y1={-selNode.y} x2={hx} y2={-hy} />
                  <circle className="shaper-handle" cx={hx} cy={-hy} r={HANDLE_PX * mmPerPx}
                    onPointerDown={e => startDrag(e, side, sel.c, sel.i)} />
                </g>
              );
            })}
          </g>
        )}
        {contours && contours.map((nodes, c) => nodes.map((p, i) => i === 0 ? null : (
          <rect key={`${c}:${i}`}
            className={`shaper-node${sel?.c === c && sel.i === i ? ' shaper-node--on' : copies.includes(i) ? ' shaper-node--copy' : ''}`}
            x={p.x - (NODE_PX / 2) * mmPerPx} y={-p.y - (NODE_PX / 2) * mmPerPx}
            width={NODE_PX * mmPerPx} height={NODE_PX * mmPerPx}
            onPointerDown={e => startDrag(e, 'anchor', c, i)}>
            <title>Nodo {i + 1}{contours.length > 1 ? `, contorno ${c + 1}` : ''}</title>
          </rect>
        )))}
        {seams.map((s, c) => (
          <circle key={c}
            className={`shaper-seam${contours ? ' shaper-seam--node' : ''}${sel?.c === c && sel.i === 0 ? ' shaper-seam--on' : ''}`}
            cx={s.seam.x} cy={-s.seam.y} r={SEAM_PX * mmPerPx}
            onPointerDown={contours ? e => startDrag(e, 'anchor', c, 0) : undefined}>
            <title>Costura: aquí empieza y termina cada capa. La flecha marca el sentido.</title>
          </circle>
        ))}
      </svg>

      <aside className="float-panel panel-left shaper-panel">
        <div className="panel-scroll">
          <div className="panel-header">
            {switcher}
            <span className="panel-header-actions">
              <button className="btn-reset" onClick={reset} disabled={isDefault}
                title="Vuelve a la forma inicial de las familias, sin nodos ni importaciones (Ctrl+Z lo deshace)">Restablecer</button>
            </span>
          </div>
          {contours ? (
            <PathPanel contours={contours} order={order} symmetric={doc.pathSymmetric} canSymmetric={canSym}
              diameterMM={diameter} clockwise={doc.clockwise} sel={sel} snap={snap}
              onSelect={setSel}
              onSymmetric={on => commit({ ...doc, pathSymmetric: on }, false)}
              onSnap={setSnap}
              onMove={({ c, i }, x, y) => editContour(c, moveAnchor(contours[c], i, x, y), [i])}
              onSmooth={({ c, i }, on) => editContour(c, setSmooth(contours[c], i, on), [i], false)}
              onStraight={({ c, i }, on) => editContour(c, setStraight(contours[c], i, on), [i, (i + 1) % contours[c].length], false)}
              onDelete={remove}
              onDeleteContour={c => { setSel(null); commit({ ...doc, contours: contours.filter((_, j) => j !== c) }, false); }}
              onSeam={({ c, i }) => { commit({ ...doc, contours: withContour(c, rotateStart(contours[c], i)) }, false); setSel({ c, i: 0 }); }}
              onDiameter={mm => {
                const k = mm / diameter;
                commit({ ...doc, sizeMM: mm, contours: contours.map(ns => mapNodes(ns, p => ({ x: p.x * k, y: p.y * k }))) });
              }}
              onReverse={() => {
                commit({ ...doc, contours: contours.map(reverseNodes), clockwise: !doc.clockwise }, false);
                if (sel) setSel({ c: sel.c, i: (contours[sel.c].length - sel.i) % contours[sel.c].length });
              }}
              onBackToFamily={() => { setSel(null); commit({ ...doc, contours: null }, false); }} />
          ) : (
            <FamilyPanel doc={doc} onChange={next => commit(next)} onEditPoints={toPath} />
          )}
          <PrintCheck check={check} wave={wave} doc={doc} bounds={shapeBounds(outlines)} />

          <div className="section">
            <div className="section-title">Importar</div>
            {importNote && (
              <p className={`shaper-note${importNote.error ? ' shaper-note--error' : ''}`} role="status">{importNote.text}</p>
            )}
            <p className="shaper-note">
              Trae los contornos cerrados de un SVG como nodos editables, al tamaño que se imprimen. Ctrl+Z lo deshace.
            </p>
            <div className="shaper-actions">
              <button className="btn-small" onClick={() => fileRef.current?.click()}>Abrir SVG…</button>
              <input ref={fileRef} type="file" accept=".svg,image/svg+xml" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) props.onImportFile(f); e.target.value = ''; }} />
              {props.printName && (
                <button className="btn-small" onClick={props.onImportPrint}
                  title="El SVG cargado en Impresión, con sus rutas activas y su escala">Traer «{props.printName}»</button>
              )}
            </div>
          </div>
        </div>
      </aside>

      {batch && !contours && (
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
          <button className={`btn-toggle${showBand && bands.length ? ' btn-toggle--on' : ''}`}
            aria-pressed={showBand && bands.length > 0} disabled={bands.length === 0}
            onClick={() => setShowBand(!showBand)}
            title={bands.length === 0 ? 'Sin onda en Impresión'
              : `Mostrar la franja que barre la onda: ±${fmt(wave.ampNMM, 1)} mm a cada lado. Donde dos franjas se tocan, las paredes chocarán`}>Onda</button>
          <button className={`btn-toggle${batch && !contours ? ' btn-toggle--on' : ''}`} aria-pressed={!!batch && !contours}
            onClick={toggleDiscover}
            title={contours ? 'Deja los nodos y muestra nueve variaciones de la familia (Ctrl+Z vuelve a los nodos)'
              : 'Ver nueve variaciones de esta familia y elegir con el ojo'}>Descubrir</button>
          <span className="stage-summary">{label}</span>
          <button className="btn-primary btn-send" onClick={() => onSend(shapeToSvg(doc), fileName(doc))}
            title="Cargar esta forma en Impresión, a su tamaño real">Enviar a impresión</button>
          <button className="btn-icon" onClick={onHelp} aria-haspopup="dialog"
            aria-label="Ayuda: cómo usar BarroCode" title="Ayuda (?)">?</button>
        </div>
      </div>
    </div>
  );
}
