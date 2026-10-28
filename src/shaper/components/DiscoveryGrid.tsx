import { useMemo } from 'react';
import { isVariantOf, variations, type Batch, type Variant } from '../lib/discovery';
import { checkShape, type WaveLimit } from '../lib/printability';
import { FAMILY_PARAMS, fmt, shapeBounds, shapePath, shapePoints, type ShapeDoc } from '../lib/shape';

interface Props {
  doc: ShapeDoc;
  batch: Batch;
  wave: WaveLimit;
  onAdopt: (v: Variant) => void;
  onMore: () => void;
  onAnother: () => void;
}

export function DiscoveryGrid({ doc, batch, wave, onAdopt, onMore, onAnother }: Props) {
  const variants = useMemo(() => variations(batch), [batch]);
  // Drawn at the current size, rotation and seam, so a pick looks the same once adopted.
  const cards = useMemo(() => variants.map(v => {
    const pts = shapePoints({ ...doc, ...v });
    const b = shapeBounds([pts]);
    return { v, d: shapePath([pts]), cx: b.x + b.width / 2, cy: b.y + b.height / 2, tight: checkShape(pts, wave).tight.length };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [variants, doc.sizeMM, doc.rotation, doc.seamAngle, doc.clockwise, wave]);

  // One scale for every card, each centred on its own box.
  const r = (doc.sizeMM / 2) * 1.08;
  const keys = FAMILY_PARAMS[batch.base.family].map(s => s.key);

  return (
    <div className="shaper-discover">
      <div className="discover-head">
        <span className="discover-title">
          {batch.spread >= 1 ? 'Variaciones al azar' : `Variaciones cerca de la elegida (±${Math.round(batch.spread * 50)} %)`}
        </span>
        <button className="btn-small" onClick={onMore}
          title="Otra tanda que varía poco alrededor de la forma actual">Más como esta</button>
        <button className="btn-small" onClick={onAnother}
          title="Otra tanda con todos los valores al azar">Otra tanda</button>
      </div>
      <div key={`${batch.seed}:${batch.spread}`} className="discover-grid">
        {cards.map(({ v, d, cx, cy, tight }, i) => {
          const on = isVariantOf(doc, v);
          return (
            <button key={i} aria-pressed={on}
              className={`discover-card${on ? ' discover-card--on' : ''}${tight ? ' discover-card--warn' : ''}`}
              onClick={() => onAdopt(v)}
              title={tight ? 'Adoptar esta forma. La onda actual no puede seguir parte de ella.' : 'Adoptar esta forma'}>
              <svg viewBox={`${cx - r} ${cy - r} ${2 * r} ${2 * r}`} aria-hidden="true">
                <path className="shaper-shape" d={d} />
              </svg>
              <span className="discover-cap">
                <span className="discover-params">{keys.map(k => fmt(v[k]!, 1)).join(' · ')}</span>
                {tight > 0 && <span className="discover-warn">{tight} {tight === 1 ? 'aviso' : 'avisos'}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
