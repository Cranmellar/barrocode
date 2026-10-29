import { describe, expect, it } from 'vitest';
import type { PrintParams, SampledPath, WaveKeyframe } from '../../types';
import { cornerRadius, createKeyframeSampler, generateWaveLayers, getParamsAtT, roundCorners, segmentAlpha, shortestWavelength, suggestedSpacingMM } from '../waveGenerator';
import { buildToolpath } from '../toolpath';
import { CENTRE, PARAMS, curve, polyline, sampledPath } from './fixtures';

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
  return generateWaveLayers([path], params, keyframes).map(layer => {
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

  it('closes when the end sample has a stray tangent', () => {
    // A `Z` closing a tiny gap gives the parser's last sample that gap's direction.
    const stray = circle(47, 300);
    const last = stray.points[stray.points.length - 1];
    stray.points[stray.points.length - 1] = { ...last, tangentX: 0, tangentY: -1, normalX: 1, normalY: 0 };
    for (const gap of seamGaps(stray, { lissPhaseOffset: 1.1 })) expect(gap.xy).toBeLessThan(1e-6);
  });

  it('changes the wavelength by less than half a cycle over the path', () => {
    const params = { ...PARAMS, numLayers: 1, lissAmpN: 3, lissWlN: 20 };
    const [layer] = generateWaveLayers([path], params, []);
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
    const [layer] = generateWaveLayers([open], params, []);
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

  it('follows curved legs without a gap or a kink', () => {
    // A lens: two arcs of radius 60 that meet at (100 ± 44.7, 100) at 84°.
    const a0 = Math.asin(40 / 60);
    const arc = (cy: number, from: number, to: number) => curve(u => {
      const a = from + (to - from) * u;
      return [100 + 60 * Math.cos(a), cy + 60 * Math.sin(a)];
    }, 60);
    const top = arc(60, Math.PI - a0, a0);
    const bottom = arc(140, -a0, -(Math.PI - a0));
    const r = roundCorners(sampledPath('lens', [...top, ...bottom.slice(1), top[0]]), 12);
    const pts = r.points;
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]];
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(2.5);
      const jump = Math.abs(Math.atan2(a.tangentX * b.tangentY - a.tangentY * b.tangentX, a.tangentX * b.tangentX + a.tangentY * b.tangentY));
      expect(jump).toBeLessThan(0.3);
      // Each step runs along the tangents at its ends: no sideways jump onto
      // the fillet, as tangent lines drifting off a curved leg would make.
      const sx = (b.x - a.x), sy = (b.y - a.y), sl = Math.hypot(sx, sy);
      expect(Math.abs(sx * a.tangentY - sy * a.tangentX) / sl).toBeLessThan(0.3);
    }
  });

  it('sizes the fillet so the T wave cannot fold the inner edge', () => {
    expect(cornerRadius(3, 0, 20)).toBeCloseTo(3.75, 9);
    // ampT·2π/wlT = 0.5 halves the forward speed the inner edge has left.
    expect(cornerRadius(3, 1, 4 * Math.PI)).toBeCloseTo(7.5, 9);
    // A T wave that loops by itself: the radius stops growing.
    expect(cornerRadius(3, 4, 12)).toBeCloseTo(7.5, 9);
    expect(cornerRadius(0, 2, 20)).toBeCloseTo(2.5, 9);
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
        const layers = generateWaveLayers([sampledPath('star', polyline(star))], params, []);
        const [layer] = buildToolpath(layers, params, CENTRE);
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

describe('keyframe interpolation', () => {
  const kf = (t: number, ampN: number, smooth?: boolean): WaveKeyframe =>
    ({ id: `k${t}`, t, ampN, ampT: 0, wlN: 20, wlT: 20, delta: 0, smooth });

  it('is straight between plain keyframes and smoothstep between smooth ones', () => {
    for (const a of [0, 0.1, 0.25, 0.5, 0.8, 1]) {
      expect(segmentAlpha(kf(0, 0), kf(1, 0), a)).toBeCloseTo(a);
      expect(segmentAlpha(kf(0, 0, true), kf(1, 0, true), a)).toBeCloseTo(a * a * (3 - 2 * a));
    }
  });

  it('leaves a smooth keyframe flat and a plain one straight', () => {
    const slope = (lo: WaveKeyframe, hi: WaveKeyframe, a: number) =>
      (segmentAlpha(lo, hi, a + 1e-6) - segmentAlpha(lo, hi, a - 1e-6)) / 2e-6;
    // Smooth start, plain end, and the reverse.
    expect(slope(kf(0, 0, true), kf(1, 0), 1e-6)).toBeCloseTo(0, 4);
    expect(slope(kf(0, 0, true), kf(1, 0), 1 - 1e-6)).toBeCloseTo(1, 4);
    expect(slope(kf(0, 0), kf(1, 0, true), 1e-6)).toBeCloseTo(1, 4);
    expect(slope(kf(0, 0), kf(1, 0, true), 1 - 1e-6)).toBeCloseTo(0, 4);
    for (let a = 0; a <= 1; a += 0.05) {
      expect(segmentAlpha(kf(0, 0, true), kf(1, 0), a)).toBeGreaterThanOrEqual(-1e-12);
      expect(segmentAlpha(kf(0, 0, true), kf(1, 0), a)).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it('gives the same values through the sampler and through getParamsAtT', () => {
    const kfs = [kf(0.1, 2, true), kf(0.5, 8), kf(0.9, 4, true)];
    const sampler = createKeyframeSampler(kfs, PARAMS);
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      expect(sampler(t).ampN).toBeCloseTo(getParamsAtT(t, kfs, PARAMS).ampN, 12);
    }
    // Leaving a smooth keyframe starts slowly: halfway, short of the straight midpoint (5).
    expect(getParamsAtT(0.3, kfs, PARAMS).ampN).toBeCloseTo(2 + 6 * 0.375);
  });
});

describe('keyframed phase', () => {
  // Straight line along +X: the first point of each layer sits at
  // y = 100 + ampN·sin(phaseBase), since its arc phase is 0.
  const line = sampledPath('line', polyline([[20, 100], [180, 100]]));
  const base = { ...PARAMS, numLayers: 5, lissAmpN: 3 };
  const kf = (t: number, phase: Partial<WaveKeyframe>): WaveKeyframe =>
    ({ id: `k${t}`, t, ampN: 3, ampT: 0, wlN: 20, wlT: 20, delta: 0, ...phase });
  const firstYs = (params: PrintParams, kfs: WaveKeyframe[]) =>
    generateWaveLayers([line], params, kfs).map(l => l.paths[0][0].y);

  it('matches the global phase when every keyframe holds the same values', () => {
    const params = { ...base, lissPhaseOffset: 0.4, phaseShiftPerLayer: 0.7 };
    const kfs = [kf(0, { phaseOffset: 0.4, phaseShift: 0.7 }), kf(1, { phaseOffset: 0.4, phaseShift: 0.7 })];
    const want = firstYs(params, []);
    firstYs({ ...base }, kfs).forEach((y, i) => expect(y).toBeCloseTo(want[i], 9));
  });

  it('adds up the per-layer shift sampled at each layer start', () => {
    const shift = 0.6;
    const ys = firstYs(base, [kf(0, { phaseShift: 0 }), kf(1, { phaseShift: shift })]);
    const n = line.points.length;
    const tDenom = base.numLayers * n - 1;
    let phase = 0;
    ys.forEach((y, li) => {
      expect(y).toBeCloseTo(100 + 3 * Math.sin(phase), 9);
      phase += shift * (li * n) / tDenom;
    });
  });
});

describe('sampling resolution', () => {
  const kf = (over: Partial<WaveKeyframe>): WaveKeyframe =>
    ({ id: 'k', t: 0, ampN: 0, ampT: 0, wlN: 20, wlT: 20, delta: 0, ...over });

  it('takes the shortest wavelength among the axes that move', () => {
    expect(shortestWavelength({ ...PARAMS, lissAmpN: 3, lissWlN: 20, lissAmpT: 2, lissWlT: 12 }, [])).toBe(12);
    expect(shortestWavelength({ ...PARAMS, lissAmpN: 3, lissWlN: 20, lissAmpT: 0, lissWlT: 5 }, [])).toBe(20);
    expect(shortestWavelength({ ...PARAMS, lissAmpZ: 1, lissWlZ: 8 }, [])).toBe(8);
    expect(shortestWavelength(PARAMS, [])).toBeNull();
  });

  it('reads keyframes, falling back to the global Z wave', () => {
    const p = { ...PARAMS, lissAmpN: 3, lissWlN: 4, lissAmpZ: 1, lissWlZ: 30 };
    expect(shortestWavelength(p, [kf({ ampN: 2, wlN: 25 }), kf({ ampT: 1, wlT: 15 })])).toBe(15);
    expect(shortestWavelength(p, [kf({ ampN: 2, wlN: 40 })])).toBe(30);
  });

  it('suggests ten samples per cycle, within 0.25–2.5 mm', () => {
    expect(suggestedSpacingMM(20)).toBe(2);
    expect(suggestedSpacingMM(12)).toBe(1.2);
    expect(suggestedSpacingMM(1)).toBe(0.25);
    expect(suggestedSpacingMM(100)).toBe(2.5);
    expect(suggestedSpacingMM(null)).toBe(1);
  });
});
