import { useEffect, useRef, type ReactNode } from 'react';
import { NumInput } from '../../components/NumInput';
import { isStraight, type PathNode } from '../lib/pathModel';
import { fmt } from '../lib/shape';

interface Props {
  nodes: PathNode[];
  order: number;
  symmetric: boolean;
  canSymmetric: boolean;
  diameterMM: number;
  clockwise: boolean;
  sel: number | null;
  snap: boolean;
  onSelect: (i: number | null) => void;
  onSymmetric: (on: boolean) => void;
  onSnap: (on: boolean) => void;
  onMove: (i: number, x: number, y: number) => void;
  onSmooth: (i: number, smooth: boolean) => void;
  onStraight: (i: number, straight: boolean) => void;
  onDelete: (i: number) => void;
  onSeam: (i: number) => void;
  onDiameter: (mm: number) => void;
  onReverse: () => void;
  onBackToFamily: () => void;
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
  const { nodes, order, symmetric, canSymmetric, sel, onSelect } = props;
  const n = nodes.length;
  const p = sel !== null ? nodes[sel] : null;

  // Keep the selected command in view when the selection comes from the canvas.
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (sel === null) return;
    listRef.current?.querySelector(`[data-node="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  return (
    <>
      <Sec title="Trazado">
        <p className="shaper-note">
          {n} nodos. Arrastra un nodo o sus asas; doble clic en la línea añade un nodo; Supr borra el elegido.
          Ctrl+Z deshace.
        </p>
        <Check label={order > 1 ? `Simetría ×${order}` : 'Simetría'} checked={symmetric && canSymmetric}
          disabled={!canSymmetric}
          hint={canSymmetric
            ? 'Editar un nodo mueve sus copias en cada sector'
            : 'Solo para trazados que vienen de una familia con repeticiones y conservan sus sectores'}
          onChange={props.onSymmetric} />
        <Check label="Imán a la rejilla (1 mm)" checked={props.snap} onChange={props.onSnap}
          hint="Los nodos que arrastras caen en milímetros enteros" />
      </Sec>

      <Sec title={p ? `Nodo ${sel! + 1}${sel === 0 ? ' · costura' : ''}` : 'Nodo'}>
        {p ? (
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
            <Check label="Tramo siguiente recto" checked={isStraight(nodes, sel!)}
              onChange={v => props.onStraight(sel!, v)} hint="Línea recta hasta el nodo siguiente" />
            <div className="shaper-actions">
              <button className="btn-small" disabled={sel === 0} onClick={() => props.onSeam(sel!)}
                title="La capa empieza y termina en este nodo">Costura aquí</button>
              <button className="btn-small" disabled={n - (symmetric && canSymmetric ? order : 1) < 3}
                onClick={() => props.onDelete(sel!)} title="Borrar este nodo (Supr)">Borrar nodo</button>
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
          hint="Sentido en que la boquilla recorre el contorno, visto desde arriba" />
      </Sec>

      <Sec title="Comandos">
        <p className="shaper-note">El trazado en mm, Y hacia arriba como en la cama. Clic en una fila elige su nodo.</p>
        <ol ref={listRef} className="path-commands">
          {[...nodes, nodes[0]].map((q, k) => {
            const i = k % n;
            const prev = nodes[(k - 1 + n) % n];
            const text = k === 0 ? `M ${xy(q.x, q.y)}`
              : isStraight(nodes, k - 1) ? `L ${xy(q.x, q.y)}`
              : `C ${xy(prev.outX, prev.outY)}  ${xy(q.inX, q.inY)}  ${xy(q.x, q.y)}`;
            return (
              <li key={k} data-node={k < n ? i : undefined}
                className={`path-command${sel === i ? ' path-command--on' : ''}`}
                onClick={() => onSelect(i)}>{text}</li>
            );
          })}
          <li className="path-command path-command--end">Z</li>
        </ol>
      </Sec>

      <div className="shaper-actions shaper-actions--foot">
        <button className="btn-small" onClick={props.onBackToFamily}
          title="Deja los nodos y vuelve a la familia con sus parámetros (se puede deshacer)">Volver a la familia</button>
      </div>
    </>
  );
}
