import { Fragment } from 'react';
import { rampColor } from '../lib/palette';

const STEPS = ['SVG', 'Capas', 'Onda', 'G-code'];

const CIRCLE_WAVE = Array.from({ length: 161 }, (_, i) => {
  const a = (i / 160) * Math.PI * 2;
  const r = 19 + 3 * Math.sin(10 * a);
  return `${(32 + r * Math.cos(a)).toFixed(1)},${(32 + r * Math.sin(a)).toFixed(1)}`;
}).join(' ');

function FlowIcon({ step }: { step: number }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      {step === 0 && <circle cx="32" cy="32" r="19" className="hf-ink" />}
      {step === 1 && [0, 1, 2, 3, 4].map(j => (
        <ellipse key={j} cx="32" cy={47 - j * 7} rx="20" ry="7"
          fill="none" stroke={rampColor(j / 4)} strokeWidth="1.5" />
      ))}
      {step === 2 && <polyline points={CIRCLE_WAVE} className="hf-accent" />}
      {step === 3 && (
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
  );
}

export function FlowSteps() {
  return (
    <div className="stage-empty-flow" role="img"
      aria-label="Flujo: un trazo SVG se apila en capas, se ondula y se exporta como G-code">
      {STEPS.map((label, k) => (
        <Fragment key={label}>
          {k > 0 && <span className="stage-empty-sep" />}
          <div className="stage-empty-step">
            <FlowIcon step={k} />
            <span><b>{k + 1}</b> {label}</span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
