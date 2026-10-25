import { describe, expect, it } from 'vitest';
import type { PrintParams, SampledPath } from '../../types';
import { generateWaveLayers } from '../waveGenerator';
import { generateGcode } from '../gcodeGenerator';
import { buildToolpath } from '../toolpath';
import { PARAMS, VIEWBOX, curve, interpret, polyline, sampledPath } from './fixtures';

function run(paths: SampledPath[], overrides: Partial<PrintParams> = {}) {
  const params = { ...PARAMS, ...overrides };
  const layers = generateWaveLayers(paths, params, [], VIEWBOX.height);
  return {
    params,
    gcode: generateGcode(layers, params, VIEWBOX),
    toolpath: buildToolpath(layers, params, VIEWBOX.height),
  };
}

const lemniscate = () => sampledPath('lemniscate', curve(u => {
  const t = 2 * Math.PI * u + 0.3;
  return [100 + 80 * Math.sin(t), 100 + 40 * Math.sin(2 * t)];
}, 95));
const crossingPair = () => [
  sampledPath('a', polyline([[0, 50], [100, 50]])),
  sampledPath('b', polyline([[51, 101], [51, 1]])),
];
const facingPair = () => [
  sampledPath('a', polyline([[0, 0], [20, 0]])),
  sampledPath('b', polyline([[100, 0], [80, 0]])),
];

const WAVE = { lissAmpN: 3, lissAmpT: 1, lissAmpZ: 0.8, lissWlT: 13, lissWlZ: 30, lissDelta: 0.5 };
const HOP = { zHopHeight: 2.5, hopRadius: 3 };

const GEOMETRIES = { lemniscate: () => [lemniscate()], crossingPair, facingPair };
const CONFIGS: Partial<PrintParams>[] = [];
for (const softJoin of [true, false]) {
  for (const primingMove of [true, false]) {
    for (const alternateDirection of [true, false]) {
      CONFIGS.push({ ...WAVE, ...HOP, numLayers: 3, softJoin, primingMove, alternateDirection });
    }
  }
}

describe('generateGcode — motion invariants', () => {
  for (const [name, geometry] of Object.entries(GEOMETRIES)) {
    for (const config of CONFIGS) {
      const label = `${name} softJoin=${config.softJoin} priming=${config.primingMove} alt=${config.alternateDirection}`;

      // Soft-join transitions may span the gap between layers by design.
      it(`never extrudes a long or plunging move — ${label}`, () => {
        const { gcode, params } = run(geometry(), config);
        const body = gcode.slice(gcode.indexOf('; ===== Layer 1'));
        const maxDz = params.layerHeight + params.zHopHeight + 2 * params.lissAmpZ + 0.01;

        for (const m of interpret(body).filter(m => m.extruding)) {
          if (!m.transition) expect(Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y)).toBeLessThan(15);
          expect(Math.abs(m.to.z - m.from.z)).toBeLessThan(maxDz);
        }
      });

      it(`prints exactly the preview toolpath — ${label}`, () => {
        const { gcode, toolpath } = run(geometry(), config);
        const extruded = interpret(gcode).filter(m => m.extruding).map(m => m.to);
        const expected = toolpath.flatMap(l => l.paths.flatMap(p => p.slice(1)));

        let k = 0;
        for (const p of extruded) {
          const q = expected[k];
          if (q && Math.abs(p.x - q.x) < 1e-3 && Math.abs(p.y - q.y) < 1e-3 && Math.abs(p.z - q.z) < 1e-3) k++;
        }
        expect(k).toBe(expected.length);
      });
    }
  }
});

describe('generateGcode — priming', () => {
  it('travels to the first path and descends before extruding', () => {
    const { gcode } = run(facingPair(), { primingMove: true, softJoin: true });
    const afterPriming = gcode.slice(gcode.indexOf('; --- End priming ---'));
    const moves = afterPriming.split('\n').filter(l => l.startsWith('G1'));

    expect(moves[0]).toBe('G1 X0.000 Y0.000 F1500  ; travel to start');
    expect(moves[1]).toBe('G1 Z1.000 F1500  ; descend');
    expect(moves[2]).toContain(' E');
  });
});

describe('generateGcode — reference output', () => {
  // Intentional output changes: review the diff, then `npm test -- -u`.
  it('single self-crossing path with wave, Z oscillation, z-hop and soft join', async () => {
    const { gcode } = run([lemniscate()], { ...WAVE, ...HOP, flipY: true, closePath: true });
    await expect(gcode).toMatchFileSnapshot('./__snapshots__/lemniscate-softjoin.gcode');
  });

  it('two paths with priming, dwell, skirt travel and alternate direction', async () => {
    const { gcode } = run(facingPair(), {
      softJoin: false, primingMove: true, dwellAtStart: 500, alternateDirection: true, skirtThreshold: 5,
    });
    await expect(gcode).toMatchFileSnapshot('./__snapshots__/two-paths-skirt.gcode');
  });

  it('two crossing paths with z-hop and soft join', async () => {
    const { gcode } = run(crossingPair(), { ...HOP, lissAmpN: 2 });
    await expect(gcode).toMatchFileSnapshot('./__snapshots__/crossing-paths-hop.gcode');
  });
});
