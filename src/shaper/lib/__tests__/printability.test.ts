import { describe, it, expect } from 'vitest';
import { DEFAULT_SHAPE, shapePoints, type ShapeDoc } from '../shape';
import { checkShape } from '../printability';
import type { Pt } from '../families';
import { cornerRadius, roundCorners } from '../../../lib/waveGenerator';
import type { SampledPath, SampledPoint } from '../../../types';

// Impresión's view of a sent shape: parseSVG's even samples with central
// finite-difference tangents (svgParser.sampleElement), here without a DOM.
function asParsed(outline: Pt[], spacing: number): SampledPath {
  const loop = [...outline, outline[0]];
  const cum = [0];
  for (let i = 1; i < loop.length; i++) cum.push(cum[i - 1] + Math.hypot(loop[i].x - loop[i - 1].x, loop[i].y - loop[i - 1].y));
  const total = cum[cum.length - 1];
  const at = (t: number): Pt => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < t) i++;
    const f = (t - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    return { x: loop[i - 1].x + (loop[i].x - loop[i - 1].x) * f, y: loop[i - 1].y + (loop[i].y - loop[i - 1].y) * f };
  };
  const segs = Math.max(2, Math.ceil(total / spacing));
  const step = total / segs;
  const eps = Math.min(step * 0.05, 0.5, total * 0.005);
  const points: SampledPoint[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = Math.min(i * step, total);
    const p = at(t), a = at(Math.max(0, t - eps)), b = at(Math.min(total, t + eps));
    const m = Math.hypot(b.x - a.x, b.y - a.y);
    const tx = (b.x - a.x) / m, ty = (b.y - a.y) / m;
    points.push({ x: p.x, y: p.y, tangentX: tx, tangentY: ty, normalX: -ty, normalY: tx, arcLength: t });
  }
  return {
    id: 'p', tagName: 'path', totalLength: total, points, enabled: true,
    ampNOverride: null, ampTOverride: null, wlNOverride: null, wlTOverride: null,
  };
}

/** Separate stretches that roundCorners replaced: runs of input samples it dropped. */
function roundedStretches(path: SampledPath, radius: number): number {
  const out = roundCorners(path, radius);
  if (out === path) return 0;
  const kept = new Set(out.points.map(p => `${p.x},${p.y}`));
  const ring = path.points.slice(0, -1);
  const gone = ring.map(p => !kept.has(`${p.x},${p.y}`));
  if (gone.every(Boolean)) return 1;
  const start = gone.indexOf(false);
  let runs = 0;
  for (let s = 0; s < ring.length; s++) {
    const i = (start + s) % ring.length;
    if (gone[i] && !gone[(i - 1 + ring.length) % ring.length]) runs++;
  }
  return runs;
}

const WAVE = { radiusMM: cornerRadius(3, 0, 20), spacingMM: 2 };

const shapes: [string, Partial<ShapeDoc>, number][] = [
  ['sharp five-point star', { family: 'polygon', polySides: 5, polyStarPct: 55, polyFilletMM: 0 }, 10],
  ['sharp triangle', { family: 'polygon', polySides: 3, polyFilletMM: 0, seamAngle: 30 }, 3],
  ['hexagon with 8 mm corners', { family: 'polygon', polySides: 6, polyFilletMM: 8 }, 0],
  ['star with 2 mm corners', { family: 'polygon', polySides: 6, polyStarPct: 40, polyFilletMM: 2, seamAngle: 15 }, 12],
  ['cusped flower', { family: 'lobes', lobeCount: 7, lobeDepthPct: 40, lobeSharp: 0.4 }, 7],
  ['gentle lobes', { family: 'lobes', lobeCount: 6, lobeDepthPct: 20, lobeSharp: 1 }, 0],
  // Five tips and the five valleys between them.
  ['spiky superformula', { family: 'superformula', sfM: 5, sfN1: 0.6, sfN2: 4, sfN3: 4, seamAngle: 10 }, 10],
];

describe('checkShape', () => {
  for (const [name, patch, expected] of shapes) {
    it(`flags what Impresión rounds: ${name}`, () => {
      const pts = shapePoints({ ...DEFAULT_SHAPE, ...patch });
      const check = checkShape(pts, WAVE);
      expect(check.tight).toHaveLength(expected);
      expect(roundedStretches(asParsed(pts, WAVE.spacingMM), WAVE.radiusMM)).toBe(expected);
    });
  }

  it('measures a fillet at its radius', () => {
    const pts = shapePoints({ ...DEFAULT_SHAPE, family: 'polygon', polySides: 6, polyFilletMM: 8 });
    expect(checkShape(pts, WAVE).minRadiusMM).toBeGreaterThan(7.5);
    expect(checkShape(pts, WAVE).minRadiusMM).toBeLessThan(8.5);
  });

  it('reads a corner with no fillet as nearly zero', () => {
    const pts = shapePoints({ ...DEFAULT_SHAPE, family: 'polygon', polySides: 4, polyFilletMM: 0 });
    expect(checkShape(pts, WAVE).minRadiusMM).toBeLessThan(0.5);
  });

  it('flags nothing without a wave', () => {
    const pts = shapePoints({ ...DEFAULT_SHAPE, family: 'polygon', polyFilletMM: 0 });
    expect(checkShape(pts, { radiusMM: 0, spacingMM: 2 }).tight).toHaveLength(0);
  });

  it('puts each spot on its corner', () => {
    const pts = shapePoints({ ...DEFAULT_SHAPE, family: 'polygon', polySides: 4, polyFilletMM: 0, sizeMM: 100 });
    const corners = checkShape(pts, WAVE).tight.map(s => pts[s.index]);
    for (const c of corners) expect(Math.hypot(c.x, c.y)).toBeGreaterThan(49);
  });
});
