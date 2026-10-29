import { useEffect, useRef, useState, type ReactNode } from 'react';
import { rampColor } from '../lib/palette';
import { FlowIcon } from './FlowSteps';

interface Props {
  open: boolean;
  onClose: () => void;
}

const TAU = Math.PI * 2;

function pts(n: number, f: (i: number) => [number, number]) {
  return Array.from({ length: n + 1 }, (_, i) => f(i).map(v => v.toFixed(1)).join(',')).join(' ');
}

// The diagrams use the app's own wave: along the path s, the nozzle sits at
// s + ampT·sin(k·s) forward and ampN·sin(k·s + δ) to the side.
function wavePath(x0: number, len: number, y0: number, ampN: number, ampT: number, wl: number, delta: number) {
  const k = TAU / wl;
  return pts(len * 2, i => {
    const s = i / 2;
    return [x0 + s + ampT * Math.sin(k * s), y0 - ampN * Math.sin(k * s + delta)];
  });
}

const N_WAVE = wavePath(12, 176, 58, 18, 0, 64, 0);
const T_DOTS = Array.from({ length: 23 }, (_, i) => 12 + i * 8 + 6 * Math.sin((TAU / 64) * i * 8));
const Z_WAVE = pts(176, i => [12 + i, 46 - 9 * Math.sin((TAU / 58) * i)]);
const KF_WAVE = pts(272, i => [24 + i, 38 - (3 + 15 * (i / 272)) * Math.sin((TAU / 30) * i)]);

function Arrow({ x1, y1, x2, y2, both }: { x1: number; y1: number; x2: number; y2: number; both?: boolean }) {
  const a = Math.atan2(y2 - y1, x2 - x1), h = 4.5;
  const head = (x: number, y: number, dir: number) =>
    `${x - h * Math.cos(dir - 0.5)},${y - h * Math.sin(dir - 0.5)} ${x},${y} ${x - h * Math.cos(dir + 0.5)},${y - h * Math.sin(dir + 0.5)}`;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <polyline points={head(x2, y2, a)} />
      {both && <polyline points={head(x1, y1, a + Math.PI)} />}
    </g>
  );
}

function Figure({ label, caption, children, view = '0 0 200 100' }: {
  label: string; caption: ReactNode; children: ReactNode; view?: string;
}) {
  return (
    <figure className="help-fig">
      <svg viewBox={view} role="img" aria-label={label}>{children}</svg>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function WaveFigures() {
  return (
    <div className="help-figs">
      <Figure label="N: la boquilla se desvía a los lados del trazo; λ es la distancia de un ciclo"
        caption={<><b className="hd-n-text">N</b> a los lados del trazo</>}>
        <line x1="12" y1="58" x2="188" y2="58" className="hd-base" />
        <polyline points={N_WAVE} className="hd-wave hd-wave--n" />
        <g className="hd-dim">
          <line x1="28" y1="22" x2="92" y2="22" />
          <line x1="28" y1="18" x2="28" y2="26" />
          <line x1="92" y1="18" x2="92" y2="26" />
        </g>
        <text x="60" y="15" textAnchor="middle" className="hd-label">λ</text>
        <g className="hd-arrow hd-n"><Arrow x1={156} y1={57} x2={156} y2={41} both /></g>
        <text x="156" y="32" textAnchor="middle" className="hd-label hd-n-text">amplitud</text>
        <text x="12" y="92" className="hd-note">trazo</text>
      </Figure>

      <Figure label="T: la boquilla adelanta y retrasa a lo largo del trazo; los puntos se juntan y se separan"
        caption={<><b className="hd-t-text">T</b> adelante y atrás</>}>
        <line x1="12" y1="52" x2="188" y2="52" className="hd-track" />
        {T_DOTS.map((x, i) => <circle key={i} cx={x} cy={52} r={2.6} className="hd-dot" />)}
        {T_DOTS.map((_, i) => <line key={i} x1={12 + i * 8} y1={66} x2={12 + i * 8} y2={70} className="hd-tick" />)}
        <g className="hd-arrow hd-t"><Arrow x1={76} y1={32} x2={108} y2={32} both /></g>
        <text x="12" y="92" className="hd-note">paso parejo sin T</text>
      </Figure>

      <Figure label="Z: la capa sube y baja sobre la de abajo"
        caption={<><b>Z</b> arriba y abajo, de perfil</>}>
        <line x1="12" y1="80" x2="188" y2="80" className="hd-layer" />
        <line x1="12" y1="66" x2="188" y2="66" className="hd-layer" />
        <polyline points={Z_WAVE} className="hd-wave" />
        <g className="hd-arrow hd-z"><Arrow x1={84.5} y1={46} x2={84.5} y2={38} /></g>
        <text x="12" y="96" className="hd-note">capas de abajo</text>
      </Figure>
    </div>
  );
}

function DeltaFigures() {
  const cases: [string, number, number][] = [['0°', 0, 5], ['90°', Math.PI / 2, 5], ['90°, T grande', Math.PI / 2, 15]];
  return (
    <div className="help-figs">
      {cases.map(([name, delta, ampT]) => (
        <Figure key={name} label={`Trazo con delta ${name}`} view="0 0 200 76"
          caption={<>Delta {name}</>}>
          <line x1="12" y1="38" x2="188" y2="38" className="hd-base" />
          <polyline points={wavePath(12, 160, 38, 16, ampT, 54, delta)} className="hd-wave" />
        </Figure>
      ))}
    </div>
  );
}

function KeyframeFigure() {
  const badge = (x: number, n: number, t: number) => (
    <g>
      <rect x={x - 7} y={76} width={14} height={14} rx={2.5} transform={`rotate(45 ${x} 83)`}
        fill={rampColor(t)} className="hd-badge" />
      <text x={x} y={86.5} textAnchor="middle" className="hd-badge-n">{n}</text>
    </g>
  );
  return (
    <figure className="help-fig help-fig--wide">
      <svg viewBox="0 0 320 124" role="img"
        aria-label="Dos keyframes: el 1 con amplitud N de 3 mm y el 2 con 18 mm; entre ellos la onda crece de a poco">
        <line x1="24" y1="38" x2="296" y2="38" className="hd-base" />
        <polyline points={KF_WAVE} className="hd-wave" />
        <line x1="24" y1="83" x2="296" y2="83" className="hd-track" />
        <line x1="160" y1="64" x2="160" y2="76" className="hd-lead" />
        <rect x="155" y="78" width="10" height="10" rx="1.5" className="hd-extruder" />
        {badge(24, 1, 0)}
        {badge(296, 2, 1)}
        <text x="24" y="114" className="hd-label">N 3 mm</text>
        <text x="160" y="114" textAnchor="middle" className="hd-note">interpolado</text>
        <text x="296" y="114" textAnchor="end" className="hd-label">N 18 mm</text>
      </svg>
    </figure>
  );
}

const K = ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>;

const STEPS: [string, ReactNode][] = [
  ['Trazo', <>Arrastra un SVG a la ventana, usa <em>Cargar SVG</em> o elige una muestra con <span className="help-keys"><K>‹</K> <K>›</K></span>. También puedes dibujarlo en <em>Forma</em>.</>],
  ['Capas', <>Panel izquierdo: capas, escala, velocidades y máquina, en <em>Pieza</em>, <em>Trayecto</em> y <em>Máquina</em>.</>],
  ['Onda', <>Panel derecho: parte de un preajuste y ajusta amplitud, longitud de onda y fase.</>],
  ['G-code', <>Revisa la trayectoria en 3D y pulsa <em>Descargar</em>. <em>G-code</em> muestra el programa.</>],
];

type Row = [ReactNode, ReactNode];
const CONTROLS: [string, Row[]][][] = [[
  ['Vista 3D', [
    ['Arrastrar', 'desplazar'],
    ['Clic derecho y arrastrar', 'girar'],
    ['Rueda', 'acercar o alejar'],
    ['Isométrica · Planta · Frente', 'vistas predefinidas'],
    ['Slider de capas', <>ver hasta una capa; el icono de abajo deja solo esa</>],
  ]],
  ['Números', [
    ['Rueda sobre el campo', <>subir o bajar; con <K>Shift</K>, paso fino</>],
    ['Arrastrar la etiqueta', 'deslizar el valor'],
  ]],
  ['General', [
    [<><K>?</K> · <K>Esc</K></>, 'abrir · cerrar esta ayuda'],
    [<><K>‹</K> en un panel</>, 'plegarlo a un costado'],
  ]],
], [
  ['Línea de tiempo', [
    [<><K>←</K> <K>→</K></>, <>mover el extrusor 1 % (<K>Shift</K>: 0,1 %); con un keyframe elegido, saltar al vecino</>],
    [<K>K</K>, 'añadir keyframe en el extrusor'],
    [<><K>Esc</K> · <K>Supr</K></>, 'soltar · borrar el keyframe elegido'],
    [<K>G</K>, 'mostrar u ocultar el G-code'],
  ]],
  ['Forma', [
    [<><K>Ctrl</K> <K>Z</K> · <K>Ctrl</K> <K>Shift</K> <K>Z</K></>, 'deshacer · rehacer'],
    ['Doble clic en la línea', 'añadir un nodo'],
    [<><K>Supr</K> · <K>Esc</K></>, 'borrar · soltar el nodo elegido'],
  ]],
]];

function Defs({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="help-defs">
      {items.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
    </dl>
  );
}

const SECTIONS: { id: string; title: string; body: ReactNode }[] = [
  {
    id: 'inicio', title: 'Empezar', body: <>
      <p className="help-lead">
        BarroCode convierte un trazo SVG en G-code para impresoras de arcilla: lo ondula con una onda
        de Lissajous y lo apila en capas.
      </p>
      <ol className="help-steps">
        {STEPS.map(([title, text], i) => (
          <li key={title}>
            <span className="help-step-icon"><FlowIcon step={i} /></span>
            <strong>{i + 1} · {title}</strong>
            <p>{text}</p>
          </li>
        ))}
      </ol>
      <p className="help-aside">
        Un SVG con tamaño en mm, cm o pulgadas se carga a su tamaño real. Sin unidades, una unidad es un
        milímetro; si viene en píxeles, usa <em>Factor de escala</em> <code>0.2645</code>.
      </p>
    </>,
  },
  {
    id: 'forma', title: 'Forma', body: <>
      <p className="help-lead">
        En <em>Forma</em> dibujas la línea central de la pieza, ya en milímetros, que <em>Impresión</em> ondula
        y apila. Cambia entre los dos con el selector de arriba del panel izquierdo.
      </p>
      <Defs items={[
        ['Familias', <>Lóbulos, polígono o estrella, y superfórmula, con diámetro exterior, giro, costura (dónde empieza cada capa) y sentido.</>],
        ['Editar puntos', <>Arriba del panel. Convierte la forma en nodos: arrastra nodos y asas; doble clic en la línea añade uno. Con simetría, cada cambio se repite en todas las repeticiones. <em>Volver a la familia</em> deja los nodos.</>],
        ['Descubrir', <>Nueve variaciones de la familia. Clic para adoptar una; <em>Más como esta</em> afina alrededor de ella. Con nodos, vuelve antes a la familia.</>],
        ['Imprimibilidad', <>Marca en rojo los tramos más cerrados de lo que la onda actual puede seguir. <em>Onda</em> dibuja la franja que barre.</>],
        ['Importar', <><em>Abrir SVG…</em> (aquí) o <em>Abrir en Forma</em> (en Impresión) traen los contornos cerrados de un SVG como nodos.</>],
        ['Restablecer', <>Junto al selector de arriba: vuelve a la forma inicial, sin nodos. <em>Ctrl+Z</em> lo deshace.</>],
        ['Enviar a impresión', <>Carga la forma en Impresión a su tamaño real. <em>Editar forma</em> vuelve a ella.</>],
      ]} />
    </>,
  },
  {
    id: 'onda', title: 'Onda', body: <>
      <p className="help-lead">
        La boquilla sigue el trazo y se desvía de él en tres direcciones a la vez.
      </p>
      <WaveFigures />
      <Defs items={[
        ['Amplitud', 'Cuánto se desvía la boquilla, en mm.'],
        ['Longitud de onda', 'Milímetros de recorrido por ciclo completo (λ).'],
        ['Resolución', <><em>Espaciado de muestra</em> (Pieza): unos 10 puntos por ciclo de la onda más corta. El panel dice si te quedas corto o te pasas y sugiere un valor.</>],
      ]} />
      <h3>Delta: cómo se combinan N y T</h3>
      <DeltaFigures />
      <Defs items={[
        ['Delta', 'Desfase de N respecto de T. Con 0° la onda se inclina; con 90° se redondea y, si T es grande, forma bucles.'],
        ['Desfase inicial', 'Dónde empieza el ciclo en la primera capa.'],
        ['Desfase por capa', 'Corre la onda un poco en cada capa, para torcer la pared.'],
      ]} />
    </>,
  },
  {
    id: 'keyframes', title: 'Keyframes', body: <>
      <p className="help-lead">
        Un keyframe fija la onda, la escala, el giro y el centro en un punto del recorrido.
        Entre dos keyframes, los valores pasan de uno a otro.
      </p>
      <KeyframeFigure />
      <ol className="help-list">
        <li>Mueve el extrusor en la línea de tiempo, abajo, y pulsa <em>+ Keyframe</em> o <K>K</K>.</li>
        <li>Clic en su rombo (en la línea de tiempo o en la vista 3D) para elegirlo y editarlo: la onda en el panel derecho; posición, escala, giro y centro sobre la línea de tiempo.</li>
        <li>Arrástralo para moverlo: se ajusta al inicio de cada capa; con <K>Alt</K>, queda libre.</li>
        <li><em>Transición suave</em> hace que los valores lleguen y salgan sin quiebre; el rombo se dibuja redondo.</li>
      </ol>
      <p className="help-aside">
        Sin keyframe elegido, el panel derecho muestra la onda bajo el extrusor; cambiar un valor ahí crea un
        keyframe en ese punto. Con keyframes, los ajustes por trayecto se ignoran.
      </p>
    </>,
  },
  {
    id: 'controles', title: 'Controles', body: (
      <div className="help-controls">
        {CONTROLS.map((column, c) => (
          <div key={c}>
            {column.map(([group, rows]) => (
              <section key={group}>
                <h3>{group}</h3>
                <dl>
                  {rows.map(([keys, action], i) => <div key={i}><dt>{keys}</dt><dd>{action}</dd></div>)}
                </dl>
              </section>
            ))}
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'arcilla', title: 'Arcilla', body: <>
      <p className="help-lead">La arcilla no se retrae: la boquilla nunca deja de empujar, así que cada unión se cuida.</p>
      <ul className="help-tips">
        <li><strong>Unir capas sin cortar</strong><span><em>Transición Z suave</em> sube a la capa siguiente mientras imprime.</span></li>
        <li><strong>Primera extrusión estable</strong><span><em>Pausa al inicio</em> y <em>Cebado de boquilla</em> dejan salir la pasta antes de la pieza.</span></li>
        <li><strong>Primera capa</strong><span>Calíbrala con <em>Desplazamiento Z</em>.</span></li>
        <li><strong>Caudal</strong><span>Ajusta el <em>Multiplicador</em> (Máquina, Extrusión) a tu bomba o tornillo.</span></li>
      </ul>
    </>,
  },
];

export function HelpDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState(SECTIONS[0].id);
  const section = SECTIONS.find(s => s.id === tab) ?? SECTIONS[0];

  // Native modal <dialog> gives focus trapping, Esc-to-close, an inert
  // background and focus restoration to the trigger for free.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  function pick(id: string) {
    setTab(id);
    bodyRef.current?.scrollTo({ top: 0 });
  }

  function onTabKey(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = SECTIONS.findIndex(s => s.id === tab);
    const next = SECTIONS[(i + (e.key === 'ArrowDown' ? 1 : SECTIONS.length - 1)) % SECTIONS.length];
    pick(next.id);
    document.getElementById(`help-tab-${next.id}`)?.focus();
  }

  return (
    <dialog
      ref={ref}
      className="help-dialog"
      aria-labelledby="help-title"
      onClose={onClose}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="help-inner">
        <nav className="help-nav">
          <h2 id="help-title">Cómo usar BarroCode</h2>
          <div role="tablist" aria-orientation="vertical" aria-label="Secciones de la ayuda" onKeyDown={onTabKey}>
            {SECTIONS.map(s => (
              <button key={s.id} id={`help-tab-${s.id}`} role="tab" aria-selected={s.id === tab}
                aria-controls="help-panel" tabIndex={s.id === tab ? 0 : -1}
                className={`help-tab${s.id === tab ? ' help-tab--on' : ''}`} onClick={() => pick(s.id)}>
                {s.title}
              </button>
            ))}
          </div>
        </nav>

        <div className="help-main">
          <header className="help-header">
            <h2>{section.title}</h2>
            <button className="help-close" onClick={onClose} aria-label="Cerrar ayuda" autoFocus>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <line x1="2" y1="2" x2="10" y2="10" />
                <line x1="10" y1="2" x2="2" y2="10" />
              </svg>
            </button>
          </header>
          <div ref={bodyRef} id="help-panel" role="tabpanel" aria-labelledby={`help-tab-${section.id}`}
            className="help-body" key={section.id}>
            {section.body}
          </div>
        </div>
      </div>
    </dialog>
  );
}
