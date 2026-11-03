import { describe, expect, it } from 'vitest';
import type { PrintParams, WallSide } from '../../types';
import { generateWaveLayers, wallOffsets, waveCornerRadius, cornerRadius } from '../waveGenerator';
import { buildToolpath } from '../toolpath';
import { CENTRE, PARAMS, curve, polyline, sampledPath } from './fixtures';

const R = 50, N = 120;
// Counter-clockwise and clockwise (y up) circles around (100, 100).
const circle = (cw = false) => sampledPath('c', curve(u => {
  const a = 2 * Math.PI * u * (cw ? -1 : 1);
  return [100 + R * Math.cos(a), 100 + R * Math.sin(a)];
}, N));

const params = (o: Partial<PrintParams>): PrintParams => ({ ...PARAMS, numLayers: 2, ...o });
const radius = (p: { x: number; y: number }) => Math.hypot(p.x - 100, p.y - 100);

// Smallest radius of the circle through three consecutive points.
function tightestRadius(q: { x: number; y: number }[]): number {
  let min = Infinity;
  for (let i = 1; i < q.length - 1; i++) {
    const [a, b, c] = [q[i - 1], q[i], q[i + 1]];
    const cross = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    const sides = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y) * Math.hypot(a.x - c.x, a.y - c.y);
    if (cross > 0) min = Math.min(min, sides / (2 * cross));
  }
  return min;
}

describe('wall passes', () => {
  it('lists the offsets of each pass in print order', () => {
    const at = (wallPasses: number, wallSide: WallSide) => wallOffsets(params({ wallPasses, wallSide })).map(v => v + 0);
    expect(at(1, 'centre')).toEqual([0]);
    expect(at(3, 'out')).toEqual([0, 1, 2]);
    expect(at(3, 'in')).toEqual([0, -1, -2]);
    expect(at(2, 'centre')).toEqual([-0.5, 0.5]);
    expect(at(9, 'out')).toHaveLength(4);
  });

  for (const cw of [false, true]) {
    for (const [side, radii] of [['out', [50, 55]], ['in', [50, 45]], ['centre', [47.5, 52.5]]] as const) {
      it(`puts the second pass ${side} of a ${cw ? 'clockwise' : 'counter-clockwise'} loop, one bead apart`, () => {
        const p = params({ wallPasses: 2, wallSide: side });
        const [layer] = generateWaveLayers([circle(cw)], p);
        expect(layer.paths).toHaveLength(1);
        const path = layer.paths[0];
        const n = path.length / 2;
        expect(Number.isInteger(n)).toBe(true);
        for (const [k, r] of radii.entries()) {
          for (const pt of path.slice(k * n, (k + 1) * n)) expect(radius(pt)).toBeCloseTo(r, 6);
        }
        expect(layer.closed).toEqual([true]);
      });
    }
  }

  it('keeps the spacing in mm under a wave, scale, rotation and SVG scale', () => {
    const p = params({
      wallPasses: 3, wallSide: 'out', wallSpacing: 80, lissAmpN: 3, lissAmpZ: 1,
      scaleX: 1.6, scaleY: 0.7, rotation: 30, scaleFactor: 0.5, flipY: true,
    });
    const step = p.lineWidth * 0.8 / p.scaleFactor;  // SVG units
    const [layer] = generateWaveLayers([circle()], p);
    const path = layer.paths[0], n = path.length / 3;
    for (let i = 0; i < n; i++) {
      const [a, b, c] = [path[i], path[n + i], path[2 * n + i]];
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(step, 6);
      expect(Math.hypot(c.x - a.x, c.y - a.y)).toBeCloseTo(2 * step, 6);
      expect(b.zOffset).toBe(a.zOffset);
    }
  });

  it('rounds corners for the farthest pass', () => {
    const p = params({ wallPasses: 3, wallSide: 'centre', lissAmpN: 3 });
    expect(waveCornerRadius(p, [])).toBeCloseTo(cornerRadius(3, 0, 20) + 1.5 * p.lineWidth, 9);
  });

  // Crests stay in line across passes, so the inner pass's wave is squeezed
  // at a corner and folded into a hook when only the offset was added.
  it('keeps the inner pass round at a corner', () => {
    const square = sampledPath('s', polyline([[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]], 0.5));
    for (let lissPhaseOffset = 0; lissPhaseOffset < 2 * Math.PI; lissPhaseOffset += 0.8) {
      const p = params({ wallPasses: 2, wallSide: 'in', lissAmpN: 3, numLayers: 1, lissPhaseOffset });
      const path = generateWaveLayers([square], p)[0].paths[0];
      expect(tightestRadius(path.slice(path.length / 2))).toBeGreaterThan(0.15);
    }
  });

  it('goes back and forth along an open path', () => {
    const p = params({ wallPasses: 2, wallSide: 'out' });
    const line = sampledPath('l', polyline([[0, 0], [100, 0]]));
    const [layer] = generateWaveLayers([line], p);
    const path = layer.paths[0], n = path.length / 2;
    expect(path[n - 1].x).toBeCloseTo(100, 9);
    expect(path[n].x).toBeCloseTo(100, 9);
    expect(path[2 * n - 1].x).toBeCloseTo(0, 9);
    expect(Math.abs(path[n].y - path[n - 1].y)).toBeCloseTo(p.lineWidth, 9);
    expect(layer.closed).toEqual([false]);
  });

  it('ramps to the next layer on the last pass only', () => {
    const p = params({ wallPasses: 2, wallSide: 'in', numLayers: 3, zHopHeight: 2.5 });
    const toolpath = buildToolpath(generateWaveLayers([circle()], p), p, CENTRE);
    for (const layer of toolpath.slice(0, -1)) {
      const path = layer.paths[0], n = path.length / 2;
      expect(layer.crossings).toBe(0);
      for (const pt of path.slice(0, n)) expect(pt.z).toBe(layer.z);
      expect(path[path.length - 1].z).toBeCloseTo(layer.z + p.layerHeight, 9);
    }
  });

  it('leaves a single pass untouched', () => {
    const one = generateWaveLayers([circle()], params({ lissAmpN: 3 }));
    const sides = (['out', 'in', 'centre'] as const).map(wallSide =>
      generateWaveLayers([circle()], params({ lissAmpN: 3, wallSide, wallSpacing: 60 })));
    for (const s of sides) expect(s).toEqual(one);
  });
});
