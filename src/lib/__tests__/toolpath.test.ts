import { describe, expect, it } from 'vitest';
import type { PrintParams, SampledPath } from '../../types';
import { generateWaveLayers } from '../waveGenerator';
import { buildToolpath } from '../toolpath';
import { PARAMS, VIEWBOX, curve, polyline, sampledPath } from './fixtures';

// The seam ramp is off unless a test asks for it, so flat-Z checks hold.
function toolpath(paths: SampledPath[], overrides: Partial<PrintParams> = {}) {
  const params = { ...PARAMS, softJoin: false, ...overrides };
  const layers = generateWaveLayers(paths, params, []);
  return buildToolpath(layers, params, VIEWBOX.height);
}

const HOP = { zHopHeight: 2.5, hopRadius: 3 };

describe('buildToolpath — z-hop', () => {
  it('lifts on the later pass over a self-crossing, not the earlier one', () => {
    // Horizontal leg along y=50, then back down x=51 through (51, 50).
    const path = sampledPath('cross', polyline([[0, 50], [100, 50], [100, 101], [51, 101], [51, 1]]));
    const [layer] = toolpath([path], HOP);
    const pts = layer.paths[0];

    expect(layer.crossings).toBe(1);
    const firstPass = pts.slice(0, 51);  // the horizontal leg, 0 → 100 in 2 mm steps
    expect(firstPass.every(p => p.z === layer.z)).toBe(true);
    const secondPass = pts.filter(p => p.x === 51 && Math.abs(p.y - 50) < 2);
    expect(Math.max(...secondPass.map(p => p.z))).toBeGreaterThan(layer.z + 2);
  });

  it('places the hop at the crossing when it is on a later path', () => {
    const a = sampledPath('a', polyline([[0, 50], [100, 50]]));
    const b = sampledPath('b', polyline([[51, 101], [51, 1]]));
    const [layer] = toolpath([a, b], HOP);
    const [first, second] = layer.paths;

    expect(layer.crossings).toBe(1);
    expect(first.every(p => p.z === layer.z)).toBe(true);
    const atCrossing = second.filter(p => Math.abs(p.y - 50) < 2);
    expect(Math.max(...atCrossing.map(p => p.z))).toBeGreaterThan(layer.z + 2);
    const away = second.filter(p => Math.abs(p.y - 50) > HOP.hopRadius);
    expect(away.every(p => p.z === layer.z)).toBe(true);
  });

  it('reaches full hop height even when the crossing falls between samples', () => {
    // Samples at y = 51 and 49 sit exactly hopRadius away from the crossing at y = 50.
    const a = sampledPath('a', polyline([[0, 50], [100, 50]]));
    const b = sampledPath('b', polyline([[51, 101], [51, 1]]));
    const [layer] = toolpath([a, b], { zHopHeight: 2.5, hopRadius: 1 });
    const second = layer.paths[1];
    const lifted = second.filter(p => p.z > layer.z);

    expect(Math.max(...second.map(p => p.z))).toBeCloseTo(layer.z + 2.5, 6);
    expect(lifted.every(p => p.x === 51 && Math.abs(p.y - 50) < 1)).toBe(true);
    expect(lifted.length).toBeGreaterThanOrEqual(5);
  });

  it('does not treat travel between paths as a crossing', () => {
    // Travel from A's end (0, 20) to B's start (50, -20) passes over A's first leg.
    const a = sampledPath('a', polyline([[0, 0], [100, 0], [100, 20], [0, 20]]));
    const b = sampledPath('b', polyline([[50, -20], [50, -40]]));
    const [layer] = toolpath([a, b], HOP);

    expect(layer.crossings).toBe(0);
    expect(layer.paths.flat().every(p => p.z === layer.z)).toBe(true);
  });
});

describe('buildToolpath — order and Z', () => {
  it('orders paths nearest-neighbour, each layer starting where the last ended', () => {
    const a = sampledPath('a', polyline([[0, 0], [20, 0]]));
    const b = sampledPath('b', polyline([[100, 0], [80, 0]]));
    const [l0, l1] = toolpath([b, a]);

    expect(l0.paths.map(p => p[0].x)).toEqual([0, 100]);
    expect(l1.paths.map(p => p[0].x)).toEqual([100, 0]);
  });

  it('includes the Z oscillation in every point', () => {
    const path = sampledPath('line', polyline([[0, 0], [100, 0]]));
    const [, layer] = toolpath([path], { lissAmpZ: 1 });
    const offsets = layer.paths[0].map(p => p.z - layer.z);

    expect(Math.max(...offsets)).toBeGreaterThan(0.9);
    expect(Math.min(...offsets)).toBeLessThan(-0.9);
    expect(offsets.every(o => Math.abs(o) <= 1 + 1e-9)).toBe(true);
  });
});

describe('buildToolpath — Z floor', () => {
  const line = () => sampledPath('line', polyline([[0, 0], [100, 0]]));

  it('keeps the first layer at or above its set height', () => {
    const [layer] = toolpath([line()], { lissAmpZ: 3 });
    expect(layer.paths[0].every(p => p.z >= layer.z)).toBe(true);
    expect(Math.max(...layer.paths[0].map(p => p.z))).toBeGreaterThan(layer.z + 2.5);
  });

  it('keeps every point a thin bead above the same spot on the layer below', () => {
    // Opposite phase on alternate, reversed layers puts crests over troughs.
    const params = {
      lissAmpN: 0, lissAmpT: 0, lissAmpZ: 3, numLayers: 5,
      phaseShiftPerLayer: Math.PI, alternateDirection: true,
    };
    const layers = toolpath([line()], params);
    const minGap = PARAMS.layerHeight / 2 - 1e-9;

    for (let li = 1; li < layers.length; li++) {
      const below = new Map(layers[li - 1].paths[0].map(p => [p.x.toFixed(3), p.z]));
      for (const p of layers[li].paths[0]) {
        expect(p.z - below.get(p.x.toFixed(3))!).toBeGreaterThanOrEqual(minGap);
      }
    }
  });
});

describe('buildToolpath — seam ramp', () => {
  // 2 mm samples on an 80 mm circle, ending where it starts.
  const circle = () => sampledPath('circle', curve(u => {
    const t = 2 * Math.PI * u;
    return [100 + 40 * Math.cos(t), 100 + 40 * Math.sin(t)];
  }, 126));
  const RAMP = { softJoin: true, transitionLength: 10, numLayers: 4 };

  it('climbs over the last transitionLength mm and ends at the next layer start', () => {
    const layers = toolpath([circle()], RAMP);
    for (const [li, layer] of layers.entries()) {
      const pts = layer.paths[0];
      const end = pts[pts.length - 1];
      expect(end.z).toBeCloseTo(layer.z + PARAMS.layerHeight, 9);
      if (layers[li + 1]) expect(end.z).toBeCloseTo(layers[li + 1].paths[0][0].z, 9);

      let arc = 0;
      const fromEnd = pts.map((p, i) => i > 0 ? (arc += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y)) : 0)
        .map(a => arc - a);
      pts.forEach((p, i) => {
        if (fromEnd[i] >= 10) expect(p.z).toBe(layer.z);
        if (i > 0) expect(p.z).toBeGreaterThanOrEqual(pts[i - 1].z);
      });
    }
  });

  it('keeps one layer height between each point and the same point below', () => {
    const layers = toolpath([circle()], { ...RAMP, transitionLength: 1000 });
    for (let li = 1; li < layers.length; li++) {
      layers[li].paths[0].forEach((p, i) => {
        expect(p.z - layers[li - 1].paths[0][i].z).toBeCloseTo(PARAMS.layerHeight, 9);
      });
    }
  });

  it('stays flat on open paths, with alternateDirection or with a single layer', () => {
    const open = () => sampledPath('line', polyline([[0, 0], [100, 0]]));
    const cases: [SampledPath, Partial<PrintParams>][] = [
      [open(), {}], [circle(), { alternateDirection: true }], [circle(), { numLayers: 1 }],
    ];
    for (const [path, overrides] of cases) {
      for (const layer of toolpath([path], { ...RAMP, ...overrides })) {
        expect(layer.paths[0].every(p => p.z === layer.z)).toBe(true);
      }
    }
  });

  it('ramps an open path closed by closePath', () => {
    const open = sampledPath('line', polyline([[0, 0], [100, 0], [100, 50]]));
    const [layer] = toolpath([open], { ...RAMP, closePath: true });
    expect(layer.paths[0][layer.paths[0].length - 1].z).toBeCloseTo(layer.z + PARAMS.layerHeight, 9);
  });
});
