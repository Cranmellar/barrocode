import { describe, expect, it } from 'vitest';
import type { PrintParams, SampledPath } from '../../types';
import { generateWaveLayers } from '../waveGenerator';
import { generateGcode } from '../gcodeGenerator';
import { buildToolpath } from '../toolpath';
import { PARAMS, VIEWBOX, curve, interpret, polyline, sampledPath } from './fixtures';

function run(paths: SampledPath[], overrides: Partial<PrintParams> = {}) {
  const params = { ...PARAMS, ...overrides };
  const layers = generateWaveLayers(paths, params, [], VIEWBOX.height);
  const toolpath = buildToolpath(layers, params, VIEWBOX.height);
  return { params, gcode: generateGcode(toolpath, params), toolpath };
}

const lemniscate = () => sampledPath('lemniscate', curve(u => {
  const t = 2 * Math.PI * u + 0.3;
  return [100 + 80 * Math.sin(t), 100 + 40 * Math.sin(2 * t)];
}, 95));
const crossingPair = () => [
  sampledPath('a', polyline([[0, 50], [100, 50]])),
  sampledPath('b', polyline([[51, 101], [51, 1]])),
];
const loopThenLine = () => [lemniscate(), sampledPath('line', polyline([[90, 190], [110, 190]]))];
const openLine = () => [sampledPath('line', polyline([[20, 100], [180, 100]]))];
const facingPair = () => [
  sampledPath('a', polyline([[0, 0], [20, 0]])),
  sampledPath('b', polyline([[100, 0], [80, 0]])),
];

const WAVE = { lissAmpN: 3, lissAmpT: 1, lissAmpZ: 0.8, lissWlT: 13, lissWlZ: 30, lissDelta: 0.5 };
const HOP = { zHopHeight: 2.5, hopRadius: 3 };

const GEOMETRIES = { lemniscate: () => [lemniscate()], crossingPair, facingPair, loopThenLine, openLine };
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

      // A soft-join transition is split into short steps, so its span is
      // checked as a whole against transitionLength.
      it(`never extrudes a long or plunging move — ${label}`, () => {
        const { gcode, params } = run(geometry(), config);
        const body = gcode.slice(gcode.indexOf('; ===== Layer 1'));
        const maxDz = params.layerHeight + params.zHopHeight + 2 * params.lissAmpZ + 0.01;

        let span = 0;
        for (const m of interpret(body).filter(m => m.extruding)) {
          const d = Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y);
          span = m.transition ? span + d : 0;
          expect(m.transition ? span : d).toBeLessThan(m.transition ? params.transitionLength + 1e-6 : 15);
          expect(Math.abs(m.to.z - m.from.z)).toBeLessThan(maxDz);
        }
      });

      it(`travels above everything already printed — ${label}`, () => {
        const { gcode } = run(geometry(), config);
        let top = -Infinity;
        for (const m of interpret(gcode)) {
          if (m.extruding) { top = Math.max(top, m.from.z, m.to.z); continue; }
          if (Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y) > 1e-6) {
            expect(Math.min(m.from.z, m.to.z)).toBeGreaterThan(top);
          }
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

describe('generateGcode — soft join', () => {
  it('rises to the next layer while moving along a closed path, never in place', () => {
    const { gcode } = run([lemniscate()], { numLayers: 3, closePath: true });
    const body = gcode.slice(gcode.indexOf('; descend'), gcode.indexOf('; ===== End'));
    const moves = interpret(body);

    expect(moves.some(m => m.to.z > m.from.z)).toBe(true);
    for (const m of moves) {
      if (m.to.z !== m.from.z) {
        expect(m.extruding).toBe(true);
        expect(Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y)).toBeGreaterThan(0.1);
      }
    }
  });
});

describe('generateGcode — priming', () => {
  it('primes beside the part, never across it or at negative coordinates', () => {
    for (const geometry of [facingPair, crossingPair, () => [lemniscate()]]) {
      for (const lissAmpN of [0, 3]) {
        const { gcode, toolpath } = run(geometry(), { primingMove: true, lissAmpN });
        const priming = gcode.slice(gcode.indexOf('; --- Priming'), gcode.indexOf('; --- End priming'));
        const [line] = interpret(priming).filter(m => m.extruding);
        const pts = toolpath[0].paths.flat();

        expect(line.to.y).toBe(line.from.y);
        expect(Math.min(...pts.map(p => Math.abs(p.y - line.from.y)))).toBeGreaterThanOrEqual(10 - 1e-3);
        if (pts.every(p => p.x >= 0 && p.y >= 0)) {
          expect(Math.min(line.from.x, line.from.y)).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('travels to the first path and descends before extruding', () => {
    const { gcode } = run(facingPair(), { primingMove: true, softJoin: true });
    const afterPriming = gcode.slice(gcode.indexOf('; --- End priming ---'));
    const moves = afterPriming.split('\n').filter(l => l.startsWith('G1'));

    expect(moves[0]).toBe('G1 X0.000 Y0.000 F1500  ; travel to start');
    expect(moves[1]).toBe('G1 Z1.000 F1500  ; descend');
    expect(moves[2]).toContain(' E');
  });
});

describe('generateGcode — program start and end', () => {
  it('sets absolute extrusion only when E is generated', () => {
    expect(run(facingPair()).gcode).toContain('\nM82 ');
    expect(run(facingPair(), { generateE: false }).gcode).not.toContain('M82');
  });

  it('lifts clear of a part taller than safe Z when finished', () => {
    const { gcode, params } = run([lemniscate()], { ...WAVE, ...HOP, numLayers: 12 });
    const moves = interpret(gcode);
    let last = 0, top = -Infinity;
    moves.forEach((m, i) => { if (m.extruding) { last = i; top = Math.max(top, m.to.z); } });

    expect(top).toBeGreaterThan(params.safeZ);
    for (const m of moves.slice(last + 1)) expect(m.to.z).toBeGreaterThan(top);
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
