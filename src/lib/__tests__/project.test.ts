import { describe, expect, it } from 'vitest';
import type { WaveKeyframe } from '../../types';
import type { ShapeDoc } from '../../shaper/lib/shape';
import { MACHINE_FIELDS } from '../machineProfiles';
import { nameFromFile, parseProject, projectFileName, serializeProject, type Project, type ProjectInput } from '../project';
import { PARAMS } from './fixtures';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';

const KF: WaveKeyframe[] = [
  { id: 'b', t: 0.8, ampN: 2, ampT: 0, wlN: 20, wlT: 20, delta: 0, smooth: true },
  { id: 'a', t: 0.1, ampN: 4, ampT: 1, wlN: 30, wlT: 15, delta: 1.2, rotation: 45, phaseShift: 0.3 },
];

const SHAPE: ShapeDoc = {
  family: 'polygon', sizeMM: 120, rotation: 15, seamAngle: 90, clockwise: true,
  sfM: 6, sfN1: 4, sfN2: 8, sfN3: 8, polySides: 5, polyStarPct: 30, polyFilletMM: 6,
  lobeCount: 6, lobeDepthPct: 20, lobeSharp: 1,
  contours: [[
    { x: 0, y: 0, inX: 0, inY: 0, outX: 0, outY: 0, smooth: false },
    { x: 10, y: 0, inX: 10, inY: 0, outX: 10, outY: 0, smooth: false },
    { x: 0, y: 10, inX: -2, inY: 10, outX: 2, outY: 10, smooth: true },
  ]],
  pathOrder: 1, pathSymmetric: false,
};

const INPUT: ProjectInput = {
  name: 'jarrón',
  svg: SVG,
  params: { ...PARAMS, lissAmpN: 3.5, numLayers: 40, printSpeed: 1234, nozzleTemp: 215 },
  keyframes: KF,
  paths: [{ id: 'p1', enabled: false, ampNOverride: 2, ampTOverride: null, wlNOverride: null, wlTOverride: 8 }],
  shape: { doc: SHAPE, sent: SVG },
};

function open(text: string): Project {
  const r = parseProject(text, PARAMS);
  if ('error' in r) throw new Error(r.error);
  return r;
}

const withData = (patch: Record<string, unknown>) => JSON.stringify({ ...JSON.parse(serializeProject(INPUT)), ...patch });

describe('project file', () => {
  it('reads back what it wrote', () => {
    const p = open(serializeProject(INPUT));
    expect(p.name).toBe('jarrón');
    expect(p.svg).toBe(SVG);
    expect(p.paths).toEqual(INPUT.paths);
    expect(p.shape).toEqual(INPUT.shape);
    expect(p.keyframes).toEqual([KF[1], KF[0]]);
    expect({ ...p.params, ...p.machine }).toEqual(INPUT.params);
  });

  it('keeps the machine apart from the design', () => {
    const p = open(serializeProject(INPUT));
    for (const k of MACHINE_FIELDS) expect(k in p.params).toBe(false);
    expect(p.machine.printSpeed).toBe(1234);
    expect(p.machine.nozzleTemp).toBe(215);
    expect(p.params.lissAmpN).toBe(3.5);
  });

  it('refuses files that are not a project', () => {
    for (const text of ['no json', '[]', '{"format":"otro","version":1}', SVG]) {
      expect(parseProject(text, PARAMS)).toHaveProperty('error');
    }
  });

  it('refuses a newer version', () => {
    expect(parseProject(withData({ version: 2 }), PARAMS)).toHaveProperty('error');
  });

  it('refuses a project with neither SVG nor shape', () => {
    expect(parseProject(withData({ svg: null, shape: null }), PARAMS)).toHaveProperty('error');
  });

  it('opens a shape without an SVG', () => {
    const p = open(withData({ svg: null }));
    expect(p.svg).toBeNull();
    expect(p.shape?.doc.family).toBe('polygon');
  });

  it('drops unknown and wrongly typed params, so the defaults fill them', () => {
    const p = open(withData({ params: { lissAmpN: '9', lissAmpT: 2, layerHeight: null, numLayers: 1e999, bogus: 1, flipY: true } }));
    expect(p.params).toEqual({ lissAmpT: 2, flipY: true });
  });

  it('skips keyframes and paths it cannot read', () => {
    const p = open(withData({
      keyframes: [KF[0], { ...KF[1], t: 1.5 }, { id: 'c', t: 0.5 }, 'x', { ...KF[1], id: 'd', ampZ: 'alto', evil: 1 }],
      paths: [{ id: 'p1', enabled: true, ampNOverride: 'x' }, { enabled: true }],
    }));
    expect(p.keyframes.map(k => k.id)).toEqual(['d', 'b']);
    expect(p.keyframes[0]).not.toHaveProperty('ampZ');
    expect(p.keyframes[0]).not.toHaveProperty('evil');
    expect(p.paths).toEqual([{ id: 'p1', enabled: true, ampNOverride: null, ampTOverride: null, wlNOverride: null, wlTOverride: null }]);
  });

  it('drops a shape with an unknown family or broken nodes', () => {
    expect(open(withData({ shape: { doc: { ...SHAPE, family: 'blob' }, sent: null } })).shape).toBeNull();
    expect(open(withData({ shape: { doc: { ...SHAPE, contours: [[{ x: 0 }]] }, sent: null } })).shape).toBeNull();
    expect(open(withData({ shape: { doc: { family: 'lobes', sizeMM: 'x' }, sent: 3 } })).shape)
      .toEqual({ doc: { family: 'lobes', contours: null }, sent: null });
  });

  it('names the file after the part and back', () => {
    expect(projectFileName('jarrón')).toBe('jarrón.barrocode.json');
    expect(nameFromFile('jarrón.barrocode.json')).toBe('jarrón');
    expect(nameFromFile('otro.JSON')).toBe('otro');
  });
});
