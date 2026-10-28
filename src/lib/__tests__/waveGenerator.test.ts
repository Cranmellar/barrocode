import { describe, expect, it } from 'vitest';
import type { PrintParams, SampledPath, WaveKeyframe } from '../../types';
import { generateWaveLayers } from '../waveGenerator';
import { PARAMS, VIEWBOX } from './fixtures';

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
