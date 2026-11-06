import { describe, expect, it } from 'vitest';
import type { PrintParams } from '../../types';
import { generateWaveLayers } from '../waveGenerator';
import { generateGcode } from '../gcodeGenerator';
import { summarizeGcode } from '../gcodeStats';
import { buildToolpath } from '../toolpath';
import { CENTRE, PARAMS, curve, interpret, polyline, run, sampledPath } from './fixtures';

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
// Filament: retraction on every travel, slower first layer, fan, min layer time.
const FILAMENT: Partial<PrintParams> = {
  material: 'filament', layerHeight: 0.3, lineWidth: 0.6, retractLength: 0.8, retractSpeed: 2400,
  firstLayerSpeed: 300, minLayerTime: 20, fanFromLayer: 2, fanSpeed: 80,
};
for (const softJoin of [true, false]) CONFIGS.push({ ...WAVE, ...HOP, ...FILAMENT, numLayers: 3, softJoin, primingMove: !softJoin });
// Thicker walls: passes joined at the seam, or back and forth on open paths.
for (const [wallPasses, wallSide] of [[2, 'out'], [2, 'in'], [3, 'centre']] as const) {
  CONFIGS.push({ ...WAVE, ...HOP, numLayers: 3, softJoin: true, wallPasses, wallSide });
}

const ORIGIN = { gcodeOrigin: 'corner' as const, marginX: 0, marginY: 0 };

// Each program is generated once and checked for every invariant, so a
// failure names the geometry and config but not which check broke: read the
// expect message.
describe('generateGcode — invariants', () => {
  for (const [name, geometry] of Object.entries(GEOMETRIES)) {
    for (const config of CONFIGS) {
      const label = `${name} softJoin=${config.softJoin} priming=${config.primingMove} alt=${config.alternateDirection}`
        + (config.material ? ` ${config.material}` : '')
        + (config.wallPasses ? ` wall=${config.wallPasses}${config.wallSide}` : '');

      it(label, () => {
        const { gcode, params, stats, toolpath } = run(geometry(), config);
        const moves = interpret(gcode);

        // No long or plunging extrusion. A soft-join transition is split
        // into short steps, so its span is checked as a whole.
        const body = interpret(gcode.slice(gcode.indexOf('; ===== Layer 1')));
        const maxDz = params.layerHeight + params.zHopHeight + 2 * params.lissAmpZ + 0.01;
        let span = 0;
        for (const m of body.filter(m => m.extruding)) {
          const d = Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y);
          span = m.transition ? span + d : 0;
          expect(m.transition ? span : d, 'extrusion length')
            .toBeLessThan(m.transition ? params.transitionLength + 1e-6 : 15);
          expect(Math.abs(m.to.z - m.from.z), 'extrusion Z step').toBeLessThan(maxDz);
        }

        // Travels above everything already printed.
        let top = -Infinity;
        for (const m of moves) {
          if (m.extruding) { top = Math.max(top, m.from.z, m.to.z); continue; }
          if (Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y) > 1e-6) {
            expect(Math.min(m.from.z, m.to.z), 'travel height').toBeGreaterThan(top);
          }
        }

        // Prints exactly the preview toolpath.
        const expected = toolpath.flatMap(l => l.paths.flatMap(p => p.slice(1)));
        let k = 0;
        for (const p of moves.filter(m => m.extruding).map(m => m.to)) {
          const q = expected[k];
          if (q && Math.abs(p.x - q.x) < 1e-3 && Math.abs(p.y - q.y) < 1e-3 && Math.abs(p.z - q.z) < 1e-3) k++;
        }
        expect(k, 'toolpath points printed').toBe(expected.length);

        // The summary matches the program read back.
        expectSummary(gcode, stats);

        // Corner origin: never at negative X or Y, skirt arcs and priming included.
        for (const m of interpret(run(geometry(), { ...config, ...ORIGIN, skirtThreshold: 1 }).gcode)) {
          expect(Math.min(m.to.x, m.to.y), 'corner origin coordinate').toBeGreaterThanOrEqual(0);
        }
      });
    }
  }
});

function expectSummary(gcode: string, stats: ReturnType<typeof run>['stats']) {
  const read = summarizeGcode(gcode);
  for (const k of ['timeSec', 'printLength', 'travelLength', 'eTotal'] as const) {
    expect(stats[k], k).toBeCloseTo(read[k], 6);
  }
  expect(stats.box, 'box').toEqual(read.box);
}

describe('generateGcode — summary', () => {
  it('matches the G-code read back without E and with dwell', () => {
    for (const geometry of Object.values(GEOMETRIES)) {
      for (const config of [
        { ...WAVE, ...HOP, numLayers: 3, generateE: false, primingMove: true },
        { ...WAVE, numLayers: 2, dwellAtStart: 1500, skirtThreshold: 1 },
      ]) {
        const { gcode, stats } = run(geometry(), config);
        expectSummary(gcode, stats);
      }
    }
  });
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

describe('generateGcode — corner origin', () => {
  it('prints the centred toolpath moved so its bottom-left corner is at Margen X / Y', () => {
    for (const geometry of Object.values(GEOMETRIES)) {
      for (const [marginX, marginY] of [[0, 0], [15, 30]]) {
        const centred = run(geometry(), { ...WAVE, ...HOP, numLayers: 3 });
        const corner = run(geometry(), { ...WAVE, ...HOP, numLayers: 3, ...ORIGIN, marginX, marginY });
        const a = interpret(centred.gcode).filter(m => m.extruding).map(m => m.to);
        const b = interpret(corner.gcode).filter(m => m.extruding).map(m => m.to);
        const pts = centred.toolpath.flatMap(l => l.paths.flat());
        const dx = marginX - Math.min(...pts.map(p => p.x));
        const dy = marginY - Math.min(...pts.map(p => p.y));

        expect(b.length).toBe(a.length);
        b.forEach((p, i) => {
          expect(p.x).toBeCloseTo(a[i].x + dx, 2);
          expect(p.y).toBeCloseTo(a[i].y + dy, 2);
          expect(p.z).toBe(a[i].z);
        });
        const printed = interpret(corner.gcode).filter(m => m.extruding).flatMap(m => [m.from, m.to]);
        expect(Math.min(...printed.map(p => p.x))).toBeCloseTo(marginX, 2);
        expect(Math.min(...printed.map(p => p.y))).toBeCloseTo(marginY, 2);
      }
    }
  });

  it('ignores Posición X / Y, which places the centre in centre mode', () => {
    const config = { ...WAVE, ...HOP, numLayers: 3, ...ORIGIN, marginX: 12, marginY: 8 };
    expect(run(loopThenLine(), { ...config, originX: 150, originY: -40 }).gcode)
      .toBe(run(loopThenLine(), config).gcode);
  });

  it('leaves the centred output alone', () => {
    const { gcode } = run(loopThenLine(), { ...WAVE, ...HOP, numLayers: 3, primingMove: true });
    expect(gcode).toContain('; Part centre at X / Y');
    expect(run(loopThenLine(), { ...WAVE, ...ORIGIN }).gcode).toContain('; Margin X / Y (corner)');
  });
});

describe('generateGcode — layer markers', () => {
  it('marks each layer for slicer viewers, before its first move', () => {
    const { gcode, toolpath } = run(loopThenLine(), { ...WAVE, ...HOP, numLayers: 3, primingMove: true });
    expect(gcode).toContain(';LAYER_COUNT:3\n');
    const lines = gcode.split('\n');
    const marks = lines.flatMap((l, i) => l.startsWith(';LAYER:') ? [i] : []);
    expect(marks.map(i => lines[i])).toEqual([';LAYER:0', ';LAYER:1', ';LAYER:2']);
    marks.forEach((i, li) => {
      expect(lines.slice(i - 3, i)).toEqual([';LAYER_CHANGE', `;Z:${toolpath[li].z.toFixed(3)}`, ';HEIGHT:2.5']);
      const header = lines.slice(i - 4, i - 3)[0];
      expect(header).toContain(`===== Layer ${li + 1} / 3`);
    });
  });
});

describe('generateGcode — extrusion', () => {
  it('extrudes along the 3D length of each move, Z-only steps included', () => {
    const path = [{ x: 0, y: 0, z: 1 }, { x: 3, y: 4, z: 1 }, { x: 3, y: 4, z: 3 }, { x: 3, y: 4, z: 3 }, { x: 6, y: 8, z: 4 }];
    const layer = { index: 0, z: 1, paths: [path], centroid: { x: 3, y: 4 }, crossings: 0 };
    const { text } = generateGcode([layer], { ...PARAMS, numLayers: 1, extrusionMultiplier: 1 });
    const prints = interpret(text).filter(m => m.extruding);

    expect(prints).toHaveLength(3);
    expect(prints[1].to).toEqual({ x: 3, y: 4, z: 3 });
    const e = [...text.matchAll(/ E([\d.]+)/g)].map(m => +m[1]);
    expect(e[e.length - 1]).toBeCloseTo(5 + 2 + Math.hypot(3, 4, 1), 3);
  });
});

describe('generateGcode — header', () => {
  it('lists the keyframes, which override the wave it lists', () => {
    const params = { ...PARAMS, ...WAVE, numLayers: 3 };
    const kfs = [
      { id: 'a', t: 0, ampN: 1, ampT: 0, wlN: 20, wlT: 20, delta: 0 },
      { id: 'b', t: 0.5, ampN: 4.5, ampT: 0.5, wlN: 25, wlT: 12, delta: Math.PI / 2, rotation: 30, smooth: true },
    ];
    const toolpath = buildToolpath(generateWaveLayers([lemniscate()], params, kfs), params, CENTRE);
    const { text } = generateGcode(toolpath, params, kfs);

    expect(text).toContain('; Keyframes              : 2');
    expect(text).toContain(';   2 at 50.0 % · N 4.5 / 25 · T 0.5 / 12 · Z 0.8 / 30 mm · delta 90.0° · scale 1 / 1 · rotation 30° · smooth');
    expect(generateGcode(toolpath, params).text).not.toContain('Keyframes');
  });
});

describe('generateGcode — version', () => {
  it('names the barrocode and the project that made it, on one line each', () => {
    const toolpath = buildToolpath(generateWaveLayers([lemniscate()], PARAMS), PARAMS, CENTRE);
    const lines = generateGcode(toolpath, PARAMS, [], [], 'vasija\nG1 Z-50').text.split('\n');
    expect(lines).toContain('; Version                : barrocode dev');
    expect(lines).toContain('; Project                : vasija G1 Z-50');
    expect(generateGcode(toolpath, PARAMS).text).not.toContain('; Project');
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
