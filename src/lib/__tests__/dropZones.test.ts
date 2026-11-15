import { describe, expect, it } from 'vitest';
import type { PrintParams } from '../../types';
import { dropLayerIndex, dropPile, dropWeights, generateWaveLayers } from '../waveGenerator';
import { generateGcode } from '../gcodeGenerator';
import { PARAMS, polyline, sampledPath } from './fixtures';

const ON: Partial<PrintParams> = {
  dropZones: true, dropHeight: 6, dropLength: 16, dropSpacing: 40, dropShift: 50, dropEvery: 2,
  dropSpeed: 40, dropFlow: 100,
};
const P: PrintParams = { ...PARAMS, ...ON };

describe('drop zone weights', () => {
  const arcs = Array.from({ length: 401 }, (_, i) => i * 0.5);
  const at = (w: number[], s: number) => w[Math.round(s * 2)];

  it('is 1 over the middle half of each zone, 0 outside, with ramps between', () => {
    const w = dropWeights(arcs, 200, false, P, 0);
    for (const c of [20, 60, 100]) {
      expect(at(w, c)).toBe(1);
      expect(at(w, c - 4)).toBe(1);
      expect(at(w, c + 4)).toBe(1);
      expect(at(w, c + 6)).toBeGreaterThan(0);
      expect(at(w, c + 6)).toBeLessThan(1);
      expect(at(w, c - 8)).toBeCloseTo(0, 9);
      expect(at(w, c + 20)).toBe(0);
    }
  });

  it('fits a whole number of zones on a closed path, so it meets itself at the seam', () => {
    const total = 130;  // 3.25 spacings → 3 zones, 43.3 mm apart
    const s = Array.from({ length: 261 }, (_, i) => i * 0.5);
    const w = dropWeights(s, total, true, P, 0);
    expect(w[0]).toBeCloseTo(w[w.length - 1], 12);
    const peaks = w.filter((v, i) => v === 1 && (i === 0 || w[i - 1] < 1)).length;
    expect(peaks).toBe(3);
  });

  it('moves each zone layer by dropShift % of the spacing', () => {
    const w0 = dropWeights(arcs, 200, false, P, 0);
    const w1 = dropWeights(arcs, 200, false, P, 1);
    for (let s = 20; s <= 180; s += 0.5) expect(at(w1, s)).toBeCloseTo(at(w0, s - 20), 12);
  });

  it('puts zones on layers 1, 1 + n… only, and only while on', () => {
    expect([0, 1, 2, 3, 4, 5].map(li => dropLayerIndex(li, P))).toEqual([-1, 0, -1, 1, -1, 2]);
    expect(dropLayerIndex(1, { ...P, dropZones: false })).toBe(-1);
    expect([1, 2, 3].map(li => dropLayerIndex(li, { ...P, dropEvery: 1 }))).toEqual([0, 1, 2]);
  });
});

describe('drop zones in the layers', () => {
  const line = sampledPath('line', polyline([[20, 100], [180, 100]], 1));
  const params = { ...P, numLayers: 3 };
  const layers = generateWaveLayers([line], params);
  const h = params.layerHeight;

  it('lifts the nozzle by the drop height on zone layers only', () => {
    expect(layers[0].paths[0].every(p => p.drop === 0 && p.zOffset === 0)).toBe(true);
    const zone = layers[1].paths[0].filter(p => p.drop === 1);
    const plain = layers[1].paths[0].filter(p => p.drop === 0);
    expect(zone.length).toBeGreaterThan(10);
    for (const p of zone) expect(p.zOffset).toBeCloseTo(params.dropHeight, 9);
    for (const p of plain) expect(p.zOffset).toBe(0);
  });

  it('passes the next layer half a layer over the estimated pile', () => {
    // Pile from volume: 2.5 mm bead × 100 % ÷ 40 % = 6.25 mm.
    expect(dropPile(params)).toBeCloseTo(6.25, 12);
    const above = layers[2].paths[0];
    layers[1].paths[0].forEach((p, i) => {
      if (p.drop === 1) expect(above[i].zOffset).toBeCloseTo(dropPile(params) - h + h / 2 - h, 9);
      if (p.drop === 0) expect(above[i].zOffset).toBe(0);
    });
  });

  it("doesn't warn about the zone as a bead lifted off the layer below", () => {
    expect(layers[1].maxGap).toBeCloseTo(h, 9);
    expect(layers[2].maxGap).toBeCloseTo(h, 9);
  });

  it('leaves the points without a drop weight while off', () => {
    const off = generateWaveLayers([line], { ...params, dropZones: false });
    expect(off.flatMap(l => l.paths[0]).some(p => 'drop' in p)).toBe(false);
  });
});

describe('drop zones in the G-code', () => {
  it('slows to dropSpeed % and extrudes flow ÷ speed per mm', () => {
    const path = [
      { x: 0, y: 0, z: 1, drop: 0 }, { x: 10, y: 0, z: 1, drop: 1 },
      { x: 20, y: 0, z: 1, drop: 1 }, { x: 30, y: 0, z: 1, drop: 0 },
    ];
    const layer = { index: 0, z: 1, paths: [path], centroid: { x: 15, y: 0 }, crossings: 0 };
    const { text } = generateGcode([layer], { ...P, numLayers: 1, extrusionMultiplier: 1, printSpeed: 600 });
    const prints = text.split('\n').filter(l => /^G1 X/.test(l) && / E/.test(l)).slice(-3);
    const feed = (l: string) => +l.match(/ F(\d+)/)![1];
    const e = (l: string) => +l.match(/ E([\d.]+)/)![1];
    // Half weight on the ramps: 70 % speed, 1 ÷ 0.7 the clay per mm.
    expect(prints.map(feed)).toEqual([420, 240, 420]);
    expect(e(prints[0])).toBeCloseTo(10 / 0.7, 2);
    expect(e(prints[1]) - e(prints[0])).toBeCloseTo(25, 2);
    expect(e(prints[2]) - e(prints[1])).toBeCloseTo(10 / 0.7, 2);
  });
});
