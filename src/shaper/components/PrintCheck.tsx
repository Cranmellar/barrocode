import { Icon } from '../../components/icons';
import type { PrintCheck as Check, WaveLimit } from '../lib/printability';
import type { Bounds, ShapeDoc } from '../lib/shape';

interface Props {
  check: Check;
  wave: WaveLimit;
  doc: ShapeDoc;
  bounds: Bounds;
}

const mm = (v: number) => v.toFixed(1);
const LOWER_WAVE = 'o baja la amplitud de la onda en Impresión.';

function fix(doc: ShapeDoc, wave: WaveLimit): string {
  switch (doc.family) {
    case 'polygon':
      // A fillet never takes more than half of either edge, so asking for
      // more changes nothing once the edges are the limit.
      return doc.polyFilletMM >= wave.radiusMM
        ? `El radio de esquina ya no crece: lo limita el largo de los lados. Agranda la pieza, baja la estrella ${LOWER_WAVE}`
        : `Sube el radio de esquina a ${mm(wave.radiusMM)} mm o más, ${LOWER_WAVE}`;
    case 'lobes':
      return `Acerca la agudeza a 1, baja la profundidad ${LOWER_WAVE}`;
    case 'superformula':
      return `Sube n1 ${LOWER_WAVE}`;
  }
}

// Samples are 0.25 mm apart, so a corner with no fillet reads as a tenth of
// a millimetre or so.
function tightest(radiusMM: number): string {
  if (!Number.isFinite(radiusMM)) return 'recta';
  return radiusMM < 0.5 ? 'esquina viva' : `R ${mm(radiusMM)} mm`;
}

export function PrintCheck({ check, wave, doc, bounds }: Props) {
  const n = check.tight.length;
  return (
    <div className="section">
      <div className="section-title"><Icon name="maquina" />Imprimibilidad</div>
      {wave.radiusMM <= 0 ? (
        <p className="shaper-check">Sin onda en Impresión: la forma se imprime tal cual.</p>
      ) : n === 0 ? (
        <p className="shaper-check shaper-check--ok">
          La onda actual ({wave.label}) sigue toda la forma: ninguna curva baja de R {mm(wave.radiusMM)} mm.
        </p>
      ) : (
        <div className="shaper-check shaper-check--warn" role="status">
          <p>
            La onda actual ({wave.label}) no puede seguir {n === 1 ? '1 tramo' : `${n} tramos`}, marcados
            en rojo: son más cerrados que R {mm(wave.radiusMM)} mm.
          </p>
          <p>
            Al imprimir, BarroCode los suaviza a ese radio y la forma pierde detalle; en una vuelta casi
            completa no puede y la onda se pliega.
          </p>
          <p>{fix(doc, wave)}</p>
        </div>
      )}
      <div className="param-row">
        <span>Curva más cerrada</span>
        <span className="shaper-value">{tightest(check.minRadiusMM)}</span>
      </div>
      <div className="param-row">
        <span>Caja</span>
        <span className="shaper-value">{mm(bounds.width)} × {mm(bounds.height)} mm</span>
      </div>
    </div>
  );
}
