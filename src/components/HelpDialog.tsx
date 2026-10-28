import { useEffect, useRef } from 'react';
import { rampColor } from '../lib/palette';

interface Props {
  open: boolean;
  onClose: () => void;
}

const TAU = Math.PI * 2;

function polyline(n: number, f: (i: number) => [number, number]) {
  return Array.from({ length: n + 1 }, (_, i) => f(i).map(v => v.toFixed(1)).join(',')).join(' ');
}


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
        <rect x="16" y="72" width="8" height="8" transform="rotate(45 20 76)" fill={rampColor(0)} />
        <rect x="296" y="72" width="8" height="8" transform="rotate(45 300 76)" fill={rampColor(1)} />
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
            en capas.
          </p>

          <section aria-labelledby="help-steps">
            <h3 id="help-steps">Flujo en 4 pasos</h3>
            <ol className="help-steps">
              <li>
                <strong>Carga un SVG</strong> — arrástralo a cualquier parte de la ventana o usa
                <em>Cargar SVG</em>; también puedes elegir una muestra con <kbd>‹</kbd> <kbd>›</kbd> y hacer clic para cargarla.
                Puedes activar o desactivar cada trayecto en la lista.
              </li>
              <li>
                <strong>Configura la impresión</strong> (panel izquierdo: Pieza, Trayecto, Máquina) — capas, altura de capa,
                velocidades y <em>Factor de escala</em>: usa <code>1</code> si el SVG está en mm
                o <code>0.2645</code> si está en píxeles.
              </li>
              <li>
                <strong>Da forma a la onda</strong> (panel derecho) — parte de un preajuste y
                ajusta amplitud, longitud de onda y fase. La figura pequeña de arriba muestra la
                onda resultante.
              </li>
              <li>
                <strong>Revisa y exporta</strong> — inspecciona la trayectoria en 3D y pulsa
                <em>Descargar</em> arriba a la derecha (<em>G-code</em> muestra el programa).
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
              Mueve el extrusor en la línea de tiempo, abajo, y pulsa <em>+ Keyframe</em>{' '}
              (o <kbd>K</kbd>) para fijar la onda en ese punto. Cada keyframe es un rombo con
              número y color, iguales en la línea de tiempo, la vista 3D y los paneles.
              Selecciona uno (clic en su rombo o con <kbd>‹</kbd> <kbd>›</kbd>) para editarlo: su onda en el panel
              derecho; su posición, giro, escala y centro sobre la línea de tiempo. Arrastra su rombo
              para moverlo. Entre keyframes los valores se interpolan. Con keyframes activos,
              los ajustes por trayecto se ignoran.
            </p>
          </section>

          <section aria-labelledby="help-controls">
            <h3 id="help-controls">Controles</h3>
            <table className="help-table">
              <tbody>
                <tr><th scope="row">Arrastrar</th><td>desplazar la vista 3D</td></tr>
                <tr><th scope="row">Clic derecho + arrastrar</th><td>rotar la vista 3D</td></tr>
                <tr><th scope="row">Rueda sobre la vista</th><td>zoom</td></tr>
                <tr><th scope="row">Iso · Planta · Frente</th><td>vistas predefinidas</td></tr>
                <tr><th scope="row">Slider de capas</th><td>ver hasta una capa · <em>Sola</em>: solo esa capa</td></tr>
                <tr><th scope="row">Rueda sobre un número</th><td>sube o baja el valor (con <kbd>Shift</kbd>, en pasos finos)</td></tr>
                <tr><th scope="row">Arrastrar la etiqueta de un número</th><td>desliza el valor a izquierda o derecha</td></tr>
                <tr><th scope="row"><kbd>‹</kbd> <kbd>›</kbd> en un panel</th><td>ocultar o mostrar el panel</td></tr>
                <tr><th scope="row"><kbd>?</kbd> · <kbd>Esc</kbd></th><td>abrir · cerrar esta ayuda</td></tr>
                <tr><th scope="row"><kbd>←</kbd> <kbd>→</kbd></th><td>mover el extrusor 1 % (con <kbd>Shift</kbd>, 0,1 %); con un keyframe seleccionado, ir al anterior o al siguiente</td></tr>
                <tr><th scope="row"><kbd>K</kbd></th><td>añadir keyframe en el extrusor (o seleccionar el que ya está ahí)</td></tr>
                <tr><th scope="row"><kbd>Esc</kbd> · <kbd>Supr</kbd></th><td>soltar · eliminar el keyframe seleccionado</td></tr>
                <tr><th scope="row"><kbd>G</kbd></th><td>mostrar u ocultar el G-code</td></tr>
              </tbody>
            </table>
          </section>

          <section aria-labelledby="help-clay">
            <h3 id="help-clay">Consejos para arcilla</h3>
            <ul className="help-tips">
              <li>No hay retracción: <em>Transición Z suave</em> une capas sin cortar el flujo.</li>
              <li><em>Pausa al inicio</em> y <em>Cebado de boquilla</em> estabilizan la primera extrusión.</li>
              <li>Calibra la primera capa con <em>Desplazamiento Z</em>.</li>
              <li>Ajusta el <em>Multiplicador</em> (panel izquierdo, Máquina › Extrusión) según tu bomba o tornillo.</li>
            </ul>
          </section>
        </div>
      </div>
    </dialog>
  );
}
