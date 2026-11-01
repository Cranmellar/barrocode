import { describe, expect, it } from 'vitest';
import type { PrintParams, SampledPath } from '../../types';
import { generateWaveLayers } from '../waveGenerator';
import { buildToolpath } from '../toolpath';
import { ePerMM, generateGcode, layerFeeds, unknownTemplateVars } from '../gcodeGenerator';
import { summarizeGcode } from '../gcodeStats';
import { MACHINE_PROFILES, applyProfile, bedCentre, findProfile } from '../machineProfiles';
import { adaptToNozzle, checkMachine } from '../machineCheck';
import { CENTRE, PARAMS, interpret, polyline, sampledPath } from './fixtures';

function run(paths: SampledPath[], overrides: Partial<PrintParams> = {}, centre = CENTRE) {
  const params = { ...PARAMS, ...overrides };
  const toolpath = buildToolpath(generateWaveLayers(paths, params, []), params, centre);
  const program = generateGcode(toolpath, params);
  return { params, toolpath, gcode: program.text, stats: program.stats };
}

const square = () => [sampledPath('sq', polyline([[0, 0], [40, 0], [40, 40], [0, 40], [0, 0]], 1))];
const facingPair = () => [
  sampledPath('a', polyline([[0, 0], [20, 0]])),
  sampledPath('b', polyline([[100, 0], [80, 0]])),
];
const FIL: Partial<PrintParams> = { material: 'filament', layerHeight: 0.2, lineWidth: 0.6, filamentDiameter: 1.75, flowRatio: 100 };

describe('filament extrusion', () => {
  it('extrudes the bead volume over the filament section', () => {
    const params = { ...PARAMS, ...FIL };
    expect(ePerMM(params)).toBeCloseTo(0.6 * 0.2 / (Math.PI * 0.875 ** 2), 9);
    expect(ePerMM({ ...params, flowRatio: 90 })).toBeCloseTo(0.9 * ePerMM(params), 9);
    expect(ePerMM(PARAMS)).toBe(PARAMS.extrusionMultiplier);
  });

  it('uses that E along the whole path', () => {
    const { stats, params } = run(square(), { ...FIL, numLayers: 1, softJoin: false });
    expect(stats.eTotal).toBeCloseTo(stats.printLength * ePerMM(params), 2);
  });

  it('retracts before each travel and recovers to the same E, consuming nothing', () => {
    const base = { ...FIL, numLayers: 2, softJoin: false };
    const { gcode } = run(facingPair(), { ...base, retractLength: 0.8 });
    const lines = gcode.split('\n');
    const retracts = lines.filter(l => l.includes('; retract'));
    const recovers = lines.filter(l => l.includes('; unretract'));
    expect(retracts.length).toBeGreaterThan(0);
    expect(recovers.length).toBe(retracts.length);
    lines.forEach((l, i) => {
      if (!l.includes('; retract')) return;
      const e = (s: string) => parseFloat(/E(-?[\d.]+)/.exec(s)![1]);
      const before = lines.slice(0, i).reverse().find(x => /^G1 .*E/.test(x))!;
      const after = lines.slice(i).find(x => x.includes('; unretract'))!;
      expect(e(before) - e(l)).toBeCloseTo(0.8, 3);
      expect(e(after)).toBeCloseTo(e(before), 6);
    });
    expect(run(facingPair(), { ...base, retractLength: 0.8 }).stats.eTotal)
      .toBeCloseTo(run(facingPair(), { ...base, retractLength: 0 }).stats.eTotal, 6);
  });

  it('never retracts clay', () => {
    expect(run(facingPair(), { softJoin: false, numLayers: 2, retractLength: 0.8 }).gcode).not.toContain('retract');
  });
});

describe('fan, speeds and templates', () => {
  it('turns the fan off at the start and on at its layer, with filament only', () => {
    const { gcode } = run(square(), { ...FIL, numLayers: 4, fanFromLayer: 3, fanSpeed: 100 });
    const lines = gcode.split('\n');
    expect(lines.filter(l => l.startsWith('M106'))).toEqual(['M106 S255  ; fan 100 %']);
    const fan = lines.findIndex(l => l.startsWith('M106'));
    expect(lines.slice(0, fan).reverse().find(l => l.startsWith(';LAYER:'))).toBe(';LAYER:2');
    expect(gcode).toContain('\nM107');
    expect(run(square(), { numLayers: 4 }).gcode).not.toMatch(/M10[67]/);
  });

  it('slows the first layer and layers shorter than the minimum time', () => {
    const { toolpath, params } = run(square(), { ...FIL, numLayers: 3, printSpeed: 6000, firstLayerSpeed: 1200, minLayerTime: 0 });
    expect(layerFeeds(toolpath, params)).toEqual([1200, 6000, 6000]);
    // 160 mm in at least 8 s: 1200 mm/min at most.
    expect(layerFeeds(toolpath, { ...params, firstLayerSpeed: 0, minLayerTime: 8 }))
      .toEqual(Array(3).fill(Math.round(160 / 8 * 60)));
    const { gcode } = run(square(), { ...FIL, numLayers: 2, printSpeed: 6000, firstLayerSpeed: 1200 });
    const prints = interpret(gcode).filter(m => m.extruding);
    expect(prints.length).toBeGreaterThan(0);
    expect(gcode).toMatch(/E[\d.]+ F1200/);
    expect(gcode).toMatch(/E[\d.]+ F6000/);
  });

  it('fills the start and end templates around the program', () => {
    const { gcode } = run(square(), {
      ...FIL, numLayers: 2, nozzleTemp: 210, bedTemp: 55,
      startGcode: 'START_PRINT EXTRUDER_TEMP={nozzleTemp} BED_TEMP={bedTemp}\nM117 {nope}', endGcode: 'G1 Z{parkZ}\nEND_PRINT',
    });
    expect(gcode).toContain('START_PRINT EXTRUDER_TEMP=210 BED_TEMP=55');
    expect(gcode).toContain('M117 {nope}');
    expect(gcode.indexOf('START_PRINT')).toBeLessThan(gcode.indexOf('M82'));
    expect(gcode.trimEnd().endsWith('END_PRINT')).toBe(true);
    expect(gcode).not.toContain('M84');
    expect(unknownTemplateVars({ ...PARAMS, startGcode: '{nozzleTemp} {nope}', endGcode: '{nope} {x}' })).toEqual(['nope', 'x']);
  });

  it('keeps the final lift inside the machine when the part leaves room', () => {
    const { gcode } = run(square(), { numLayers: 2, safeZ: 20, bedZ: 25 });
    expect(gcode).toContain('G1 Z25.000 F1500  ; final lift');
  });

  it('reads back the same summary with retraction and templates', () => {
    const { gcode, stats } = run(facingPair(), { ...FIL, numLayers: 3, softJoin: false, retractLength: 0.8, primingMove: true, startGcode: 'G28' });
    const read = summarizeGcode(gcode);
    expect(stats.eTotal).toBeCloseTo(read.eTotal, 6);
    expect(stats.box).toEqual(read.box);
  });
});

describe('profiles', () => {
  it('have templates with known variables only', () => {
    for (const pr of MACHINE_PROFILES) {
      expect(unknownTemplateVars({ ...PARAMS, ...pr.values }), pr.id).toEqual([]);
    }
  });

  it('the first is the clay machine BarroCode always assumed', () => {
    const p0 = applyProfile(PARAMS, MACHINE_PROFILES[0]);
    for (const k of ['printSpeed', 'travelSpeed', 'extrusionMultiplier', 'safeZ', 'nozzleHeightOffset', 'originX', 'originY'] as const) {
      expect(p0[k], k).toBe(PARAMS[k]);
    }
  });

  it('centre the part on the bed when applied', () => {
    const k1 = applyProfile({ ...PARAMS, gcodeOrigin: 'corner' }, findProfile('k1')!);
    expect(k1.gcodeOrigin).toBe('centre');
    expect([k1.originX, k1.originY]).toEqual([110, 110]);
    expect(bedCentre(applyProfile(PARAMS, findProfile('wasp2040')!))).toEqual({ x: 0, y: 0 });
  });
});

describe('checkMachine', () => {
  const k1 = applyProfile(PARAMS, findProfile('k1')!);
  // A 40 mm square around its own centre at 20, 20.
  const centred = { x: 20, y: 20 };
  const levels = (p: PrintParams) => {
    const { toolpath, stats } = run(square(), { ...p, numLayers: 3 }, centred);
    return checkMachine({ ...p, numLayers: 3 }, toolpath, stats);
  };

  it('passes a part centred on the bed', () => {
    const c = levels({ ...k1, layerHeight: 0.2 });
    expect(c.filter(x => x.level === 'err')).toEqual([]);
    expect(c.some(x => x.title === 'Dentro de la cama')).toBe(true);
  });

  it('flags negative coordinates on a corner-origin bed and offers to centre', () => {
    const c = levels({ ...k1, layerHeight: 0.2, originX: 0, originY: 0 })[0];
    expect(c.level).toBe('err');
    expect(c.title).toContain('negativos');
    expect(c.action).toBe('centre');
  });

  it('flags a part past the far edge or the round edge', () => {
    expect(levels({ ...k1, layerHeight: 0.2, originX: 205 })[0].title).toBe('La pieza se sale de la cama');
    const wasp = applyProfile(PARAMS, findProfile('wasp2040')!);
    expect(levels({ ...wasp, layerHeight: 0.6, originX: 90 })[0].title).toBe('La pieza se sale de la cama');
    expect(levels({ ...wasp, layerHeight: 0.6 })[0].title).toBe('Dentro de la cama');
  });

  it('flags a layer too thick or too thin for the nozzle', () => {
    expect(levels({ ...k1, layerHeight: 0.4 }).find(c => c.action === 'adapt')?.level).toBe('err');
    expect(levels({ ...k1, layerHeight: 0.05 }).find(c => c.action === 'adapt')?.level).toBe('warn');
  });

  it('flags a flow the hotend cannot melt and unknown template variables', () => {
    const c = levels({ ...k1, layerHeight: 0.3, printSpeed: 30000, startGcode: 'START_PRINT {foo}' });
    expect(c.some(x => x.title.startsWith('Caudal') && x.level === 'warn')).toBe(true);
    expect(c.some(x => x.title === 'Variables desconocidas en las plantillas')).toBe(true);
  });

  it('adapts the layer, bead and wave to the nozzle', () => {
    const a = adaptToNozzle(k1, false);
    expect([a.layerHeight, a.lineWidth, a.lissAmpN, a.lissWlN]).toEqual([0.2, 0.6, 1, 6]);
    expect(levels(a).filter(c => c.action === 'adapt')).toEqual([]);
    expect(adaptToNozzle(k1, true).lissAmpN).toBe(k1.lissAmpN);
  });
});
