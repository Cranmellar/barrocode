import { describe, expect, it } from 'vitest';
import type { PrintParams, SampledPath } from '../../types';
import { generateWaveLayers } from '../waveGenerator';
import { buildToolpath } from '../toolpath';
import { PARAMS, VIEWBOX, polyline, sampledPath } from './fixtures';

function toolpath(paths: SampledPath[], overrides: Partial<PrintParams> = {}) {
  const params = { ...PARAMS, ...overrides };
  const layers = generateWaveLayers(paths, params, [], VIEWBOX.height);
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
    const firstPass = pts.filter(p => p.y === 50);
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
    const [layer] = toolpath([path], { lissAmpZ: 1 });
    const offsets = layer.paths[0].map(p => p.z - layer.z);

    expect(Math.max(...offsets)).toBeGreaterThan(0.9);
    expect(Math.min(...offsets)).toBeLessThan(-0.9);
    expect(offsets.every(o => Math.abs(o) <= 1 + 1e-9)).toBe(true);
  });
});
