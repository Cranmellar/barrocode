import { describe, expect, it } from 'vitest';
import type { PrintParams, SampledPath, WaveKeyframe } from '../../types';
import { generateWaveLayers, roundCorners } from '../waveGenerator';
import { buildToolpath } from '../toolpath';
import { PARAMS, VIEWBOX, polyline, sampledPath } from './fixtures';

/** Circle with its exact frame, so the seam has no frame error of its own. */
function circle(r: number, n: number): SampledPath {
  const points = Array.from({ length: n + 1 }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return {
      x: 100 + r * Math.cos(a), y: 100 + r * Math.sin(a),
      tangentX: -Math.sin(a), tangentY: Math.cos(a),
      normalX: -Math.cos(a), normalY: -Math.sin(a),
      arcLength: r * a,
    };
  });
  return {
    id: 'circle', tagName: 'circle', totalLength: 2 * Math.PI * r, points, enabled: true,
    ampNOverride: null, ampTOverride: null, wlNOverride: null, wlTOverride: null,
  };
}

const WAVE: Partial<PrintParams> = {
  lissAmpN: 3, lissAmpT: 1.5, lissAmpZ: 0.8, lissWlN: 20, lissWlT: 13, lissWlZ: 30,
  lissDelta: 0.7, lissPhaseZ: 0.3, phaseShiftPerLayer: 0.9,
};

function seamGaps(path: SampledPath, overrides: Partial<PrintParams>, keyframes: WaveKeyframe[] = []) {
  const params = { ...PARAMS, numLayers: 3, ...WAVE, ...overrides };
  return generateWaveLayers([path], params, keyframes, VIEWBOX.height).map(layer => {
    const pts = layer.paths[0], a = pts[0], b = pts[pts.length - 1];
    return { xy: Math.hypot(a.x - b.x, a.y - b.y), z: Math.abs(a.zOffset - b.zOffset) };
  });
}

describe('generateWaveLayers — closed paths', () => {
  // 2π·47 = 295.3 mm: 14.77 cycles of N, 22.7 of T, 9.84 of Z.
  const path = circle(47, 300);

  it('ends the wave where it started', () => {
    for (const gap of seamGaps(path, {})) {
      expect(gap.xy).toBeLessThan(1e-6);
      expect(gap.z).toBeLessThan(1e-6);
    }
  });

  it('closes with reversed and alternating direction too', () => {
    for (const gap of seamGaps(path, { reversePath: true, alternateDirection: true })) {
      expect(gap.xy).toBeLessThan(1e-6);
    }
  });

  it('closes when keyframes change the wavelength along the path', () => {
    const kf = (t: number, wl: number): WaveKeyframe => ({
      id: `k${t}`, t, ampN: 3, ampT: 0, wlN: wl, wlT: 13, delta: 0.7,
    });
    // Amplitude is constant, so only the phase can open the seam.
    for (const gap of seamGaps(path, { lissAmpT: 0 }, [kf(0, 12), kf(1, 30)])) {
      expect(gap.xy).toBeLessThan(1e-6);
    }
  });

  it('changes the wavelength by less than half a cycle over the path', () => {
    const params = { ...PARAMS, numLayers: 1, lissAmpN: 3, lissWlN: 20 };
    const [layer] = generateWaveLayers([path], params, [], VIEWBOX.height);
    // Count sign changes of the normal offset: 2 per cycle.
    const offsets = layer.paths[0].map((p, i) =>
      (p.x - path.points[i].x) * path.points[i].normalX + (p.y - path.points[i].y) * path.points[i].normalY);
    let changes = 0;
    for (let i = 1; i < offsets.length - 1; i++) if (Math.sign(offsets[i]) !== Math.sign(offsets[i - 1])) changes++;
    expect(changes / 2).toBeCloseTo(15, 0);
  });

  it('leaves open paths alone', () => {
    const open = circle(47, 300);
    open.points = open.points.slice(0, 200);
    open.totalLength = open.points[open.points.length - 1].arcLength;
    const params = { ...PARAMS, numLayers: 1, lissAmpN: 3, lissWlN: 20 };
    const [layer] = generateWaveLayers([open], params, [], VIEWBOX.height);
    const p = layer.paths[0][10], src = open.points[10];
    const offset = (p.x - src.x) * src.normalX + (p.y - src.y) * src.normalY;
    expect(offset).toBeCloseTo(3 * Math.sin(2 * Math.PI * src.arcLength / 20), 9);
  });
});

describe('roundCorners', () => {
  const square = (start = 0) => {
    const corners: [number, number][] = [[50, 50], [150, 50], [150, 150], [50, 150]];
    const rot = [...corners.slice(start), ...corners.slice(0, start)];
    return sampledPath('square', polyline([...rot, rot[0]]));
  };
  const maxCurvature = (p: SampledPath) => {
    let max = 0;
    for (let i = 1; i < p.points.length - 1; i++) {
      const [a, b, c] = [p.points[i - 1], p.points[i], p.points[i + 1]];
      const turn = Math.abs(Math.atan2(
        (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x),
        (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)));
      max = Math.max(max, turn / ((Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - b.x, c.y - b.y)) / 2));
    }
    return max;
  };

  it('replaces each corner with a fillet of the given radius', () => {
    const r = roundCorners(square(), 4);
    const pts = r.points;
    expect(Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y)).toBeLessThan(1e-9);
    expect(maxCurvature(r)).toBeLessThan(1 / 4 * 1.05);
    // Each fillet cuts 2R of straight leg and adds a quarter circle.
    expect(r.totalLength).toBeCloseTo(400 - 4 * (8 - 2 * Math.PI), 0);
    // Closest approach to a corner: R·(√2 − 1).
    const nearCorner = Math.min(...pts.map(p => Math.hypot(p.x - 150, p.y - 150)));
    expect(nearCorner).toBeCloseTo(4 * (Math.SQRT2 - 1), 1);
    // Frames stay unit and normal is the tangent turned 90°, as parseSVG makes them.
    for (const p of pts) {
      expect(Math.hypot(p.tangentX, p.tangentY)).toBeCloseTo(1, 9);
      expect(p.normalX).toBeCloseTo(-p.tangentY, 9);
    }
    for (let i = 1; i < pts.length; i++) expect(pts[i].arcLength).toBeGreaterThan(pts[i - 1].arcLength);
  });

  it('rounds a corner on the seam and starts next to the original start', () => {
    const r = roundCorners(square(), 4);
    expect(maxCurvature(r)).toBeLessThan(1 / 4 * 1.05);
    expect(Math.hypot(r.points[0].x - 50, r.points[0].y - 50)).toBeLessThan(2);
  });

  it('keeps the start of a loop whose seam is on a straight side', () => {
    const p = sampledPath('square', polyline([[100, 50], [150, 50], [150, 150], [50, 150], [50, 50], [100, 50]]));
    const r = roundCorners(p, 4);
    expect(r.points[0]).toMatchObject({ x: 100, y: 50, arcLength: 0 });
    expect(r.points[r.points.length - 1]).toMatchObject({ x: 100, y: 50 });
  });

  it('keeps both ends of an open path', () => {
    const p = sampledPath('L', polyline([[0, 0], [60, 0], [60, 60]]));
    const r = roundCorners(p, 4);
    expect(r.points[0]).toMatchObject({ x: 0, y: 0 });
    expect(r.points[r.points.length - 1]).toMatchObject({ x: 60, y: 60 });
    expect(maxCurvature(r)).toBeLessThan(1 / 4 * 1.05);
  });

  it('returns smooth paths and a zero radius untouched', () => {
    const c = circle(47, 300);
    expect(roundCorners(c, 4)).toBe(c);
    const s = square();
    expect(roundCorners(s, 0)).toBe(s);
  });

  it('keeps the wave from folding or jumping at corners', () => {
    // Stars with convex and concave corners from 99° to 152°. Unrounded,
    // they gave up to 10 false crossings and 5.7 mm chords.
    const params = { ...PARAMS, numLayers: 1, softJoin: false, lissAmpN: 3, lissAmpT: 1, zHopHeight: 2.5, hopRadius: 1 };
    for (const inner of [40, 30, 25]) {
      for (const tips of [5, 6, 8]) {
        const star = Array.from({ length: 2 * tips + 1 }, (_, i): [number, number] => {
          const a = (Math.PI * i) / tips, r = i % 2 ? inner : 80;
          return [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
        });
        const layers = generateWaveLayers([sampledPath('star', polyline(star))], params, [], VIEWBOX.height);
        const [layer] = buildToolpath(layers, params, VIEWBOX.height);
        expect(layer.crossings).toBe(0);
        // The T wave alone stretches the 2 mm spacing to ≈ 3.2 mm.
        const pts = layer.paths[0];
        for (let i = 1; i < pts.length; i++) {
          expect(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)).toBeLessThan(3.5);
        }
      }
    }
  });
});
