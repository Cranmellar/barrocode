import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { NumInput } from '../../components/NumInput';
import { Icon, type IconName } from '../../components/icons';
import { superformulaN3 } from '../lib/families';
import { DEFAULT_SHAPE, familyName, paramSpec, type Family, type FamilyKey, type ShapeDoc } from '../lib/shape';
import { wrapHint } from '../../lib/wrapHint';

interface Props { doc: ShapeDoc; onChange: (doc: ShapeDoc) => void; onEditPoints: () => void }

const FAMILIES: Family[] = ['lobes', 'polygon', 'superformula'];

// A pointer drag snaps to the default within this fraction of the range.
const SNAP = 0.015;

function Slider({ label, value, min, max, step, unit, hint, def, disabled, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  unit?: string; hint?: string; def: number; disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    const end = () => setDragging(false);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [dragging]);
  const at = (f: number) => `calc(7px + (100% - 14px) * ${Math.max(0, Math.min(1, f))})`;
  const decimals = String(step).split('.')[1]?.length ?? 0;
  const fill    = at((value - min) / (max - min));
  const trackBg = `linear-gradient(to right,var(--accent) 0%,var(--accent) ${fill},var(--control-edge) ${fill},var(--control-edge) 100%)`;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className={`slider-row${disabled ? ' slider-row--off' : ''}`} title={wrapHint(hint)}>
      <div className="slider-header">
        <span className="slider-label">{label}</span>
        <span className="slider-num">
          <NumInput value={parseFloat(value.toFixed(decimals))} min={min} max={max} step={step}
            disabled={disabled} onChange={v => onChange(clamp(v))} />
          {unit && <span className="slider-value-unit">{unit}</span>}
        </span>
      </div>
      <div className="slider-track">
        <span className={`slider-notch${value === def ? ' slider-notch--on' : ''}`}
          style={{ left: at((def - min) / (max - min)) }} aria-hidden="true" />
        {dragging && (
          <span className="slider-bubble" style={{ left: at((value - min) / (max - min)) }} aria-hidden="true">
            {value.toFixed(decimals)}{unit && ` ${unit}`}
          </span>
        )}
        <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
          aria-label={label}
          style={{ background: trackBg }}
          onPointerDown={() => setDragging(true)}
          onChange={e => {
            const v = parseFloat(e.target.value);
            onChange(dragging && Math.abs(v - def) <= (max - min) * SNAP ? def : v);
          }} />
      </div>
    </div>
  );
}

function Num({ label, value, min, max, step, unit, hint, onChange }: {
  label: string; value: number; min?: number; max?: number;
  step?: number; unit?: string; hint?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="param-row" title={wrapHint(hint)}>
      <label>{label}{unit && <span className="unit"> {unit}</span>}</label>
      <NumInput value={value} min={min} max={max} step={step} onChange={onChange} />
    </div>
  );
}

function Sec({ title, icon, children }: { title: string; icon: IconName; children: ReactNode }) {
  return (
    <div className="section">
      <div className="section-title"><Icon name={icon} />{title}</div>
      {children}
    </div>
  );
}

export function FamilyPanel({ doc, onChange, onEditPoints }: Props) {
  const set = <K extends keyof ShapeDoc>(k: K, v: ShapeDoc[K]) => onChange({ ...doc, [k]: v });
  const slider = (k: FamilyKey, label: string, unit?: string, hint?: string) => {
    const { min, max, step } = paramSpec(k);
    return (
      <Slider label={label} value={doc[k]} min={min} max={max} step={step} unit={unit} hint={hint}
        def={DEFAULT_SHAPE[k]} onChange={v => set(k, v)} />
    );
  };
  const famIdx = FAMILIES.indexOf(doc.family);
  // "Superfórmula" doesn't fit a third of the row, so the tabs size to their
  // labels and the highlight follows the active tab's measured box.
  const tabsRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const tab = tabsRef.current?.querySelectorAll<HTMLElement>('.panel-tab')[famIdx];
      if (tab) setInd({ x: tab.offsetLeft, w: tab.offsetWidth });
    };
    measure();
    document.fonts?.ready.then(measure);
  }, [famIdx]);
  const oddM = doc.sfM % 2 === 1;

  return (
    <>
      <div className="shaper-edit">
        <button className="btn-small btn-edit" onClick={onEditPoints}>
          <Icon name="nodos" size={16} />Editar puntos
        </button>
        <p className="shaper-edit-note">
          Mueve los nodos uno a uno, con simetría si la forma se repite. Deja de ser paramétrica; Ctrl+Z lo deshace.
        </p>
      </div>

      <div ref={tabsRef} className="panel-tabs" role="tablist" aria-label="Familia de formas">
        <span className="panel-tabs-ind" aria-hidden="true"
          style={ind ? { left: 0, width: ind.w, transform: `translateX(${ind.x}px)` } : { visibility: 'hidden' }} />
        {FAMILIES.map(f => (
          <button key={f} role="tab" aria-selected={doc.family === f}
            className={`panel-tab${doc.family === f ? ' panel-tab--on' : ''}`}
            onClick={() => set('family', f)}>{familyName(f)}</button>
        ))}
      </div>

      <div key={doc.family} className="tab-pane" role="tabpanel">
        {doc.family === 'lobes' && (
          <Sec title="Lóbulos" icon="lobulos">
            {slider('lobeCount', 'Número', undefined, 'Cuántos lóbulos tiene la forma alrededor del centro.')}
            {slider('lobeDepthPct', 'Profundidad', '%', 'Cuánto se hunden los valles respecto de las crestas: con 20\u00a0% quedan al 80\u00a0% del radio.\n0\u00a0=\u00a0círculo.')}
            {slider('lobeSharp', 'Agudeza', undefined,
              'Perfil de cada lóbulo. 1: ondulación suave y pareja. Más de\u00a01: lóbulos estrechos, como pétalos, con valles anchos. Menos de\u00a01: lóbulos anchos y valles en punta.')}
          </Sec>
        )}
        {doc.family === 'polygon' && (
          <Sec title="Polígono" icon="poligono">
            {slider('polySides', 'Lados', undefined, 'Lados del polígono; con Estrella, número de puntas.')}
            {slider('polyStarPct', 'Estrella', '%', 'Cuánto se hunden hacia el centro los vértices interiores: con 30\u00a0% quedan al 70\u00a0% del radio de las puntas.\n0\u00a0=\u00a0polígono regular.')}
            {slider('polyFilletMM', 'Radio de esquina', 'mm', 'Radio con que se redondea cada esquina, puntas y vértices interiores. Se achica solo donde el lado es demasiado corto. Si es menor que lo que la onda puede seguir, Imprimibilidad lo marca.')}
          </Sec>
        )}
        {doc.family === 'superformula' && (
          <Sec title="Superfórmula" icon="superformula">
            {slider('sfM', 'Simetría (m)', undefined, 'Cuántas veces se repite el motivo alrededor del centro.')}
            {slider('sfN1', 'n1', undefined, 'Hinchazón de toda la forma. Bajo, los contrastes se exageran y las puntas se afilan; alto, la forma se acerca a un círculo.')}
            {slider('sfN2', 'n2', undefined, 'Junto con n3, forma de cada repetición: n2 manda en un lado y n3 en el otro. Iguales y por debajo de 2, cada repetición se afina en punta; por encima de 2, se ensancha.')}
            <Slider label="n3" min={paramSpec('sfN3').min} max={paramSpec('sfN3').max} step={paramSpec('sfN3').step}
              def={DEFAULT_SHAPE.sfN3} disabled={oddM}
              value={superformulaN3(doc.sfM, doc.sfN2, doc.sfN3)}
              hint={oddM ? 'Con m impar, n3 sigue a n2: si no, la forma no cerraría.' : 'El otro lado de cada repetición. Distinto de n2, cada repetición deja de ser simétrica.'}
              onChange={v => set('sfN3', v)} />
          </Sec>
        )}
      </div>

      <Sec title="Tamaño y costura" icon="costura">
        <Num label="Diámetro exterior" unit="mm" value={doc.sizeMM} min={5} max={1000} step={1}
          hint="Dos veces la distancia del centro al punto más lejano: el círculo que encierra la forma. Es el tamaño exacto con que llega a Impresión."
          onChange={v => set('sizeMM', Math.max(5, v))} />
        <Num label="Giro" unit="°" value={doc.rotation} step={5}
          hint="Gira la forma alrededor de su centro, antihorario visto desde arriba." onChange={v => set('rotation', v)} />
        <Num label="Costura" unit="°" value={doc.seamAngle} step={5}
          hint="Dónde empieza y termina cada capa: ángulo desde +X, antihorario visto desde arriba. Ahí sube la rampa a la capa siguiente; conviene ponerla donde se note menos."
          onChange={v => set('seamAngle', v)} />
        <div className="param-row param-check" title={wrapHint('Sentido en que la boquilla recorre el contorno, visto desde arriba. Desactivado, antihorario.')}>
          <label>
            <input type="checkbox" checked={doc.clockwise} onChange={e => set('clockwise', e.target.checked)} />
            Sentido horario
          </label>
        </div>
      </Sec>

    </>
  );
}
