import { describe, expect, it } from 'vitest';
import { project, keyframeAt, layerAtT, flattenPoints, layerLabel, layerStartTs } from '../draw3D';
import type { ToolpathLayer } from '../toolpath';
import type { WaveKeyframe } from '../../types';

// Screen y grows downward, so "up" on screen is negative y.
describe('project', () => {
  it('shows a top view with X to the right and Y up', () => {
    const [xx, xy] = project(1, 0, 0, 0, 90);
    const [yx, yy] = project(0, 1, 0, 0, 90);
    expect(xx).toBeCloseTo(1);
    expect(xy).toBeCloseTo(0);
    expect(yx).toBeCloseTo(0);
    expect(yy).toBeCloseTo(-1);
  });

  it('shows a front view with X to the right and Z up', () => {
    const [xx] = project(1, 0, 0, 0, 0);
    const [, zy] = project(0, 0, 1, 0, 0);
    expect(xx).toBeCloseTo(1);
    expect(zy).toBeCloseTo(-1);
  });

  it('never mirrors the scene, at any camera angle', () => {
    for (const az of [0, 35, 145, 215, 325]) {
      for (const el of [10, 28, 60, 89]) {
        // Seen from above, X → Y must turn counter-clockwise; on screen
        // (y down) that is a negative 2D cross product.
        const [ax, ay] = project(1, 0, 0, az, el);
        const [bx, by] = project(0, 1, 0, az, el);
        expect(ax * by - ay * bx).toBeLessThan(0);
      }
    }
  });
});

describe('keyframeAt', () => {
  const view = { azimuth: 0, elevation: 90, scale: 1, offsetX: 0, offsetY: 0 };
  const flatPoints = [0, 1, 2].map(i => ({ x: i * 100, y: 0, z: 0, layerIndex: i }));
  const kf = (id: string, t: number) => ({ id, t }) as WaveKeyframe;
  const scene = {
    view, flatPoints, keyframes: [kf('b', 1), kf('a', 0.5)],
    selectedKfId: null, layerCap: 2, layerSolo: false,
  };

  it('finds the diamond under the point, by its drawn position', () => {
    expect(keyframeAt(scene, 100, 0)?.id).toBe('a');
    expect(keyframeAt(scene, 205, 5)?.id).toBe('b');
    expect(keyframeAt(scene, 150, 0)).toBeNull();
  });

  it('ignores keyframes on hidden layers', () => {
    expect(keyframeAt({ ...scene, layerCap: 1 }, 200, 0)).toBeNull();
    expect(keyframeAt({ ...scene, layerCap: 2, layerSolo: true }, 100, 0)).toBeNull();
  });
});

describe('layerAtT', () => {
  // Layers of 3, 5 and 2 points, one of them split over two paths.
  const pt = { x: 0, y: 0, z: 0 };
  const layer = (index: number, sizes: number[]) =>
    ({ index, z: index, paths: sizes.map(n => Array(n).fill(pt)), centroid: pt, crossings: [] }) as unknown as ToolpathLayer;
  const toolpath = [layer(0, [3]), layer(1, [2, 3]), layer(2, [2])];

  it('picks the layer of the point the extruder is drawn at', () => {
    const flat = flattenPoints(toolpath);
    for (let i = 0; i <= 200; i++) {
      const t = i / 200;
      expect(layerAtT(toolpath, t)).toBe(flat[Math.floor(t * (flat.length - 1))].layerIndex);
    }
  });

  it('puts each layer start on that layer\'s first point', () => {
    const starts = layerStartTs(toolpath);
    expect(starts.map(t => layerAtT(toolpath, t))).toEqual([0, 1, 2]);
    expect(starts.map(t => layerAtT(toolpath, t - 0.01))).toEqual([0, 0, 1]);
  });

  it('labels the layer 1-based with the height at its top', () => {
    expect(layerLabel(0, 1.5)).toBe('capa 1 · 1.5 mm');
    expect(layerLabel(22, 1.5)).toBe('capa 23 · 34.5 mm');
  });
});
