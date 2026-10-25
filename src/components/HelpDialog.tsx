import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const TAU = Math.PI * 2;

function polyline(n: number, f: (i: number) => [number, number]) {
  return Array.from({ length: n + 1 }, (_, i) => f(i).map(v => v.toFixed(1)).join(',')).join(' ');
}

// Same cobalt→terracotta ramp the 3D preview uses for layers.
function layerHsl(t: number) {
  return `hsl(${218 - 198 * t},${72 + 16 * t}%,${50 + 12 * t}%)`;
}

const CIRCLE_WAVE = polyline(160, i => {
  const a = (i / 160) * TAU;
  const r = 19 + 3 * Math.sin(10 * a);
  return [32 + r * Math.cos(a), 32 + r * Math.sin(a)];
});

// Wave diagram: baseline y=56, amplitude 20, wavelength 100 starting at x=20.
const AXIS_WAVE = polyline(140, i => {
  const x = 20 + i * 2;
  return [x, 56 - 20 * Math.sin(((x - 20) / 100) * TAU)];
});

// Keyframe diagram: amplitude ramps linearly from KF 0% to KF 100%.
const KF_WAVE = polyline(280, i => {
  const x = 20 + i;
  const amp = 2 + 16 * (i / 280);
  return [x, 38 - amp * Math.sin((i / 28) * TAU)];
});

function FlowStrip() {
  const steps = ['SVG', 'Capas', 'Onda', 'G-code'];
  return (
    <figure className="help-figure">
      <div
        className="help-flow"
        role="img"
        aria-label="Esquema: un trazo SVG se apila en capas, se ondula y se exporta como G-code"
      >
        {steps.map((label, k) => (
          <div className="help-flow-step" key={label}>
            <svg viewBox="0 0 64 64" aria-hidden="true">
              {k === 0 && <circle cx="32" cy="32" r="19" className="hf-ink" />}
              {k === 1 && [0, 1, 2, 3, 4].map(j => (
                <ellipse key={j} cx="32" cy={47 - j * 7} rx="20" ry="7"
                  fill="none" stroke={layerHsl(j / 4)} strokeWidth="1.5" />
              ))}
              {k === 2 && <polyline points={CIRCLE_WAVE} className="hf-accent" />}
              {k === 3 && (
                <g className="hf-ink">
                  <path d="M18 10h20l8 8v36H18z" />
                  <path d="M38 10v8h8" />
                  <line x1="23" y1="26" x2="41" y2="26" />
                  <line x1="23" y1="32" x2="37" y2="32" />
                  <line x1="23" y1="38" x2="41" y2="38" />
                  <line x1="23" y1="44" x2="34" y2="44" />
                </g>
              )}
            </svg>
            <span><b>{k + 1}</b> {label}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

function AxisDiagram() {
  return (
    <figure className="help-figure">
      <svg
        className="help-diagram"
        viewBox="0 0 320 112"
        role="img"
        aria-label="Esquema de la onda: el trazo SVG es la línea base; N desplaza a los lados con una amplitud, T avanza a lo largo del trazo y λ es la distancia de un ciclo completo"
      >
        <line x1="20" y1="56" x2="300" y2="56" className="hd-base" />
        <polyline points={AXIS_WAVE} className="hd-wave" />

        <g className="hd-dim">
          <line x1="45" y1="16" x2="145" y2="16" />
          <line x1="45" y1="12" x2="45" y2="20" />
          <line x1="145" y1="12" x2="145" y2="20" />
          <line x1="45" y1="20" x2="45" y2="36" strokeDasharray="2 2" />
          <line x1="145" y1="20" x2="145" y2="36" strokeDasharray="2 2" />
        </g>
        <text x="95" y="11" textAnchor="middle" className="hd-label">λ longitud de onda</text>

        <g className="hd-n">
          <line x1="245" y1="56" x2="245" y2="38" />
          <polyline points="241,42 245,37 249,42" />
        </g>
        <text x="245" y="30" textAnchor="middle" className="hd-label hd-n-text">N · amplitud</text>

        <g className="hd-t">
          <line x1="200" y1="92" x2="236" y2="92" />
          <polyline points="231,88 237,92 231,96" />
        </g>
        <text x="242" y="95" className="hd-label hd-t-text">T · avance</text>

        <text x="20" y="106" className="hd-label">— — trazo SVG</text>
      </svg>
    </figure>
  );
}

function KeyframeDiagram() {
  return (
    <figure className="help-figure">
      <svg
        className="help-diagram"
        viewBox="0 0 320 100"
        role="img"
        aria-label="Esquema de keyframes: con amplitud baja en el keyframe 0% y alta en el 100%, la onda crece gradualmente entre ambos"
      >
        <line x1="20" y1="38" x2="300" y2="38" className="hd-base" />
        <polyline points={KF_WAVE} className="hd-wave" />
        <line x1="20" y1="76" x2="300" y2="76" className="hd-track" />
        <rect x="16" y="72" width="8" height="8" transform="rotate(45 20 76)" fill={layerHsl(0)} />
        <rect x="296" y="72" width="8" height="8" transform="rotate(45 300 76)" fill={layerHsl(1)} />
        <text x="20" y="96" className="hd-label">KF 0% · 2 mm</text>
        <text x="300" y="96" textAnchor="end" className="hd-label">KF 100% · 18 mm</text>
      </svg>
    </figure>
  );
}

export function HelpDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  // Native modal <dialog> gives focus trapping, Esc-to-close, an inert
  // background and focus restoration to the trigger for free.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="help-dialog"
      aria-labelledby="help-title"
      aria-describedby="help-intro"
      onClose={onClose}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="help-inner">
        <header className="help-header">
          <h2 id="help-title">Cómo usar BarroCode</h2>
          <button className="help-close" onClick={onClose} aria-label="Cerrar ayuda" autoFocus>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <line x1="2" y1="2" x2="10" y2="10" />
              <line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </button>
        </header>

        <div className="help-body">
          <p id="help-intro" className="help-lead">
            BarroCode convierte curvas SVG en G-code para impresoras 3D de arcilla.
            Cada trazo se muestrea, se ondula con una onda de Lissajous y se apila
            en capas. Todo ocurre en tu navegador: nada se sube a un servidor.
          </p>

          <section aria-labelledby="help-steps">
            <h3 id="help-steps">Flujo en 4 pasos</h3>
            <FlowStrip />
            <ol className="help-steps">
              <li>
                <strong>Carga un SVG</strong> — clic o arrastra un archivo al área de carga,
                o elige una muestra con <kbd>‹</kbd> <kbd>›</kbd> y haz clic para cargarla.
                Puedes activar o desactivar cada trayecto en la lista.
              </li>
              <li>
                <strong>Configura la impresión</strong> (panel izquierdo) — capas, altura de capa,
                velocidades y <em>Factor de escala</em>: usa <code>1</code> si el SVG está en mm
                o <code>0.2645</code> si está en píxeles.
              </li>
              <li>
                <strong>Da forma a la onda</strong> (panel derecho) — parte de un preajuste y
                ajusta amplitud, longitud de onda y fase. La vista inferior derecha muestra la
                figura local resultante.
              </li>
              <li>
                <strong>Revisa y exporta</strong> — inspecciona la trayectoria en 3D y, en la
                pestaña <em>G-code</em>, pulsa <em>Descargar .gcode</em>.
              </li>
            </ol>
          </section>

          <section aria-labelledby="help-axes">
            <h3 id="help-axes">La onda en breve</h3>
            <AxisDiagram />
            <dl className="help-defs">
              <dt>N · Normal</dt><dd>oscilación lateral, a izquierda y derecha del trazo.</dd>
              <dt>T · Tangente</dt><dd>oscilación adelante / atrás, a lo largo del trazo.</dd>
              <dt>Z · Vertical</dt><dd>oscilación arriba / abajo dentro de la capa.</dd>
              <dt>Amplitud</dt><dd>cuánto se desvía la boquilla, en mm.</dd>
              <dt>Longitud de onda</dt><dd>mm de recorrido por cada ciclo completo.</dd>
              <dt>Delta</dt><dd>desfase entre N y T: 0° da líneas, 90° da bucles.</dd>
              <dt>Desfase por capa</dt><dd>gira la onda en cada capa para crear torsión.</dd>
            </dl>
          </section>

          <section aria-labelledby="help-kf">
            <h3 id="help-kf">Keyframes</h3>
            <KeyframeDiagram />
            <p>
              Mueve el <em>Extrusor</em> en la línea de tiempo bajo la vista 3D y pulsa{' '}
              <kbd>+</kbd> para fijar la onda en ese punto. Selecciona un keyframe para
              editarlo; arrastra su rombo para moverlo. Entre keyframes los valores se
              interpolan. Con keyframes activos, los ajustes por trayecto se ignoran.
            </p>
          </section>

          <section aria-labelledby="help-controls">
            <h3 id="help-controls">Controles</h3>
            <table className="help-table">
              <tbody>
                <tr><th scope="row">Arrastrar</th><td>desplazar la vista 3D</td></tr>
                <tr><th scope="row">Clic derecho + arrastrar</th><td>rotar la vista 3D</td></tr>
                <tr><th scope="row">Rueda sobre la vista</th><td>zoom</td></tr>
                <tr><th scope="row">Rueda sobre un número</th><td>sube o baja el valor</td></tr>
                <tr><th scope="row">Arrastrar divisores</th><td>redimensionar paneles</td></tr>
                <tr><th scope="row"><kbd>?</kbd> · <kbd>Esc</kbd></th><td>abrir · cerrar esta ayuda</td></tr>
              </tbody>
            </table>
          </section>

          <section aria-labelledby="help-clay">
            <h3 id="help-clay">Consejos para arcilla</h3>
            <ul className="help-tips">
              <li>No hay retracción: <em>Transición Z suave</em> une capas sin cortar el flujo.</li>
              <li><em>Pausa al inicio</em> y <em>Cebado de boquilla</em> estabilizan la primera extrusión.</li>
              <li>Calibra la primera capa con <em>Desplazamiento Z</em>.</li>
              <li>Ajusta el <em>Multiplicador</em> (panel derecho, Extrusión) según tu bomba o tornillo.</li>
            </ul>
          </section>
        </div>
      </div>
    </dialog>
  );
}
