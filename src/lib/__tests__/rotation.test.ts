import { describe, expect, it } from 'vitest';
import type { PrintParams, WaveKeyframe } from '../../types';
import { generateWaveLayers } from '../waveGenerator';
import { buildToolpath } from '../toolpath';
import { PARAMS, VIEWBOX, polyline, sampledPath } from './fixtures';

const path = () => [sampledPath('l', polyline([[60, 40], [120, 40], [120, 90]]))];

function points(overrides: Partial<PrintParams>, keyframes: WaveKeyframe[] = []) {
  const params = { ...PARAMS, numLayers: 3, ...overrides };
  const layers = generateWaveLayers(path(), params, keyframes);
  return buildToolpath(layers, params, VIEWBOX.height).map(l => l.paths[0]);
}

function rotate([x, y]: [number, number], [cx, cy]: [number, number], deg: number): [number, number] {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
}

function expectNear(p: { x: number; y: number }, [x, y]: [number, number]) {
  expect(p.x).toBeCloseTo(x, 6);
  expect(p.y).toBeCloseTo(y, 6);
}

// The pivot is given as an offset from the centre of the part's bounding box.
const OFFSET: [number, number] = [10, -15];

function pivotOf(ref: { x: number; y: number }[]): [number, number] {
  const xs = ref.map(p => p.x), ys = ref.map(p => p.y);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2 + OFFSET[0],
    (Math.min(...ys) + Math.max(...ys)) / 2 + OFFSET[1],
  ];
}
const kf = (id: string, t: number, rotation: number): WaveKeyframe =>
  ({ id, t, ampN: 0, ampT: 0, wlN: 20, wlT: 20, delta: 0, rotation });

describe('rotation around the pivot', () => {
  for (const flipY of [false, true]) {
    it(`turns counter-clockwise on the bed — flipY ${flipY}`, () => {
      const base = { centerX: OFFSET[0], centerY: OFFSET[1], flipY, originX: 5, originY: 8 };
      const ref = points(base)[0];
      const pivot = pivotOf(ref);
      const turned = points({ ...base, rotation: 90 })[0];
      expect(turned).toHaveLength(ref.length);
      ref.forEach((p, i) => expectNear(turned[i], rotate([p.x, p.y], pivot, 90)));
    });
  }

  it('scales on the shape axes before turning', () => {
    const base = { centerX: OFFSET[0], centerY: OFFSET[1] };
    const ref = points(base)[0];
    const PIVOT = pivotOf(ref);
    const turned = points({ ...base, scaleX: 2, scaleUniform: false, rotation: 90 })[0];
    ref.forEach((p, i) => {
      const scaled: [number, number] = [PIVOT[0] + (p.x - PIVOT[0]) * 2, p.y];
      expectNear(turned[i], rotate(scaled, PIVOT, 90));
    });
  });

  it('interpolates between keyframes without wrapping, so 0° → 360° is a full twist', () => {
    const base = { centerX: OFFSET[0], centerY: OFFSET[1] };
    const ref = points(base);
    const PIVOT = pivotOf(ref[0]);
    const twisted = points(base, [kf('a', 0, 0), kf('b', 1, 360)]);
    const n = ref[0].length;
    const tDenom = 3 * n - 1;
    for (const [li, i] of [[1, 0], [1, n >> 1], [2, n - 1]]) {
      const t = (li * n + i) / tDenom;
      const p = ref[li][i];
      expectNear(twisted[li][i], rotate([p.x, p.y], PIVOT, 360 * t));
    }
  });

  it('keeps a zero pivot on the part wherever the SVG placed it', () => {
    const far = [sampledPath('far', polyline([[600, 400], [660, 400], [660, 450]]))];
    const params = { ...PARAMS, numLayers: 1, scaleFactor: 0.5, originX: 20, originY: -30, flipY: true };
    const ref = buildToolpath(generateWaveLayers(far, params), params, 1000)[0].paths[0];
    const turned = buildToolpath(generateWaveLayers(far, { ...params, rotation: 180 }), params, 1000)[0].paths[0];
    const [cx, cy] = pivotOf(ref).map((v, i) => v - OFFSET[i]);
    ref.forEach((p, i) => expectNear(turned[i], rotate([p.x, p.y], [cx, cy], 180)));
  });
});
