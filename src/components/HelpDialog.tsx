import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
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
