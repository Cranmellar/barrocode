import { describe, expect, it } from 'vitest';
import { summarizeGcode } from '../gcodeStats';
import { generateWaveLayers } from '../waveGenerator';
import { generateGcode } from '../gcodeGenerator';
import { buildToolpath } from '../toolpath';
import { CENTRE, PARAMS, polyline, sampledPath } from './fixtures';

describe('summarizeGcode', () => {
  it('splits print and travel, adds dwell and honours E resets', () => {
    const s = summarizeGcode([
      'G92 E0',
      'G1 X10 F600            ; travel 10 mm at 10 mm/s',
      'G4 P500                ; 0.5 s',
      'G1 X10 Y30 E2 F1200    ; print 30 mm at 20 mm/s',
      'G92 E0',
      'G1 X10 Y30 Z4 E1       ; print 4 mm vertically',
    ].join('\n'));
    expect(s.travelLength).toBeCloseTo(10);
    expect(s.printLength).toBeCloseTo(34);
    expect(s.eTotal).toBeCloseTo(3);
    expect(s.timeSec).toBeCloseTo(1 + 0.5 + 1.5 + 0.2);
  });

  it('accounts for all extrusion in a generated program', () => {
    const path = sampledPath('a', polyline([[10, 10], [60, 10], [60, 40]]));
    const layers = generateWaveLayers([path], PARAMS, []);
    const gcode = generateGcode(buildToolpath(layers, PARAMS, CENTRE), PARAMS);
    const es = [...gcode.matchAll(/E([\d.]+)/g)];
    const last = es[es.length - 1];
    const s = summarizeGcode(gcode);
    expect(s.eTotal).toBeCloseTo(parseFloat(last[1]), 2);
    expect(s.timeSec).toBeGreaterThan(s.printLength / (PARAMS.printSpeed / 60));
  });
});
