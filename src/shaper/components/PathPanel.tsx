import { useEffect, useRef, type ReactNode } from 'react';
import { NumInput } from '../../components/NumInput';
import { isStraight, type PathNode } from '../lib/pathModel';
import { fmt } from '../lib/shape';

/** A node of one contour. */
export interface NodeRef { c: number; i: number }

interface Props {
  contours: PathNode[][];
  order: number;
  symmetric: boolean;
  canSymmetric: boolean;
  diameterMM: number;
  clockwise: boolean;
  sel: NodeRef | null;
  snap: boolean;
  onSelect: (sel: NodeRef | null) => void;
  onSymmetric: (on: boolean) => void;
  onSnap: (on: boolean) => void;
  onMove: (sel: NodeRef, x: number, y: number) => void;
  onSmooth: (sel: NodeRef, smooth: boolean) => void;
  onStraight: (sel: NodeRef, straight: boolean) => void;
  onDelete: (sel: NodeRef) => void;
  onDeleteContour: (c: number) => void;
  onSeam: (sel: NodeRef) => void;
  onDiameter: (mm: number) => void;
  onReverse: () => void;
  /** Absent for an imported shape, which has no family to go back to. */
  onBackToFamily?: () => void;
}

function Sec({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="section">
      <div className="section-title">{title}</div>
      {children}
    </div>
  );
}

function Check({ label, checked, hint, disabled, onChange }: {
  label: string; checked: boolean; hint?: string; disabled?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="param-row param-check" title={hint}>
      <label>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
        {label}
      </label>
    </div>
  );
}

const xy = (x: number, y: number) => `${fmt(x, 1)} ${fmt(y, 1)}`;

export function PathPanel(props: Props) {
  const { contours, order, symmetric, canSymmetric, sel, onSelect } = props;
  const nodeCount = contours.reduce((n, c) => n + c.length, 0);
  const several = contours.length > 1;
  const nodes = sel ? contours[sel.c] : null;
  const p = sel && nodes ? nodes[sel.i] : null;
  const symOn = symmetric && canSymmetric;

  // Keep the selected command in view when the selection comes from the canvas.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sel) return;
    listRef.current?.querySelector(`[data-node="${sel.c}:${sel.i}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  return (
    <>
      <Sec title="Trazado">
        <p className="shaper-note">
          {nodeCount} nodos{several ? ` en ${contours.length} contornos` : ''}. Arrastra un nodo o sus asas; doble clic
          en la línea añade un nodo; Supr borra el elegido. Ctrl+Z deshace.
        </p>
        <Check label={order > 1 ? `Simetría ×${order}` : 'Simetría'} checked={symOn}
          disabled={!canSymmetric}
          hint={canSymmetric
            ? 'Editar un nodo mueve sus copias en cada sector'
            : 'Solo para un contorno que viene de una familia con repeticiones y conserva sus sectores'}
          onChange={props.onSymmetric} />
        <Check label="Imán a la rejilla (1 mm)" checked={props.snap} onChange={props.onSnap}
          hint="Los nodos que arrastras caen en milímetros enteros" />
      </Sec>

      <Sec title={p ? `Nodo ${sel!.i + 1}${several ? ` · contorno ${sel!.c + 1}` : ''}${sel!.i === 0 ? ' · costura' : ''}` : 'Nodo'}>
        {p && nodes ? (
          <>
            <div className="param-row">
              <label>X <span className="unit">mm</span></label>
              <NumInput value={+p.x.toFixed(2)} step={1} fineStep={0.1} onChange={v => props.onMove(sel!, v, p.y)} />
            </div>
            <div className="param-row">
              <label>Y <span className="unit">mm</span></label>
              <NumInput value={+p.y.toFixed(2)} step={1} fineStep={0.1} onChange={v => props.onMove(sel!, p.x, v)} />
            </div>
            <Check label="Suave" checked={p.smooth} onChange={v => props.onSmooth(sel!, v)}
              hint="Las dos asas quedan alineadas; sin esto el nodo es una esquina" />
            <Check label="Tramo siguiente recto" checked={isStraight(nodes, sel!.i)}
              onChange={v => props.onStraight(sel!, v)} hint="Línea recta hasta el nodo siguiente" />
            <div className="shaper-actions">
              <button className="btn-small" disabled={sel!.i === 0} onClick={() => props.onSeam(sel!)}
                title="La capa empieza y termina en este nodo">Costura aquí</button>
              <button className="btn-small" disabled={nodes.length - (symOn ? order : 1) < 3}
                onClick={() => props.onDelete(sel!)} title="Borrar este nodo (Supr)">Borrar nodo</button>
              {several && (
                <button className="btn-small" onClick={() => props.onDeleteContour(sel!.c)}
                  title="Quitar este contorno entero de la pieza">Borrar contorno</button>
              )}
            </div>
          </>
        ) : (
          <p className="shaper-note">Elige un nodo en el lienzo o en la lista.</p>
        )}
      </Sec>

      <Sec title="Tamaño y sentido">
        <div className="param-row" title="Dos veces la distancia del centro al punto más lejano; cambiarlo escala el trazado">
          <label>Diámetro exterior <span className="unit">mm</span></label>
          <NumInput value={+props.diameterMM.toFixed(1)} min={5} step={1} onChange={v => props.onDiameter(Math.max(5, v))} />
        </div>
        <Check label="Sentido horario" checked={props.clockwise} onChange={props.onReverse}
          hint="Sentido en que la boquilla recorre los contornos, visto desde arriba" />
      </Sec>

      <Sec title="Comandos">
        <p className="shaper-note">El trazado en mm, Y hacia arriba como en la cama. Clic en una fila elige su nodo.</p>
        <div ref={listRef} className="path-commands">
          {contours.map((ns, c) => (
            <ol key={c} className="path-commands-contour">
              {several && <li className="path-command path-command--head">Contorno {c + 1}</li>}
              {[...ns, ns[0]].map((q, k) => {
                const i = k % ns.length;
                const prev = ns[(k - 1 + ns.length) % ns.length];
                const text = k === 0 ? `M ${xy(q.x, q.y)}`
                  : isStraight(ns, k - 1) ? `L ${xy(q.x, q.y)}`
                  : `C ${xy(prev.outX, prev.outY)}  ${xy(q.inX, q.inY)}  ${xy(q.x, q.y)}`;
                const on = sel?.c === c && sel.i === i;
                return (
                  <li key={k} data-node={k < ns.length ? `${c}:${i}` : undefined}
                    className={`path-command${on ? ' path-command--on' : ''}`}
                    onClick={() => onSelect({ c, i })}>{text}</li>
                );
              })}
              <li className="path-command path-command--end">Z</li>
            </ol>
          ))}
        </div>
      </Sec>

      {props.onBackToFamily && (
        <div className="shaper-actions shaper-actions--foot">
          <button className="btn-small" onClick={props.onBackToFamily}
            title="Deja los nodos y vuelve a la familia con sus parámetros (se puede deshacer)">Volver a la familia</button>
        </div>
      )}
    </>
  );
}
