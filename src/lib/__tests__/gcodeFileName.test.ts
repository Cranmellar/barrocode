import { describe, expect, it } from 'vitest';
import { gcodeFileName } from '../gcodeGenerator';
import { emptyBox } from '../gcodeStats';
import { PARAMS } from './fixtures';

const stats = (timeSec: number) => ({ timeSec, printLength: 0, travelLength: 0, eTotal: 0, box: emptyBox() });
const now = new Date(2026, 10, 6, 9, 5);

describe('gcodeFileName', () => {
  it('adds nozzle, layer height, time and date to the part name', () => {
    const p = { ...PARAMS, nozzleDiameter: 4, layerHeight: 1.5 };
    expect(gcodeFileName('vasija.gcode', p, stats(2 * 3600 + 5 * 60), now))
      .toBe('vasija_4n_1.5mm_2h05m_20261106-0905.gcode');
  });

  it('writes short times in minutes and drops float noise', () => {
    const p = { ...PARAMS, nozzleDiameter: 0.4, layerHeight: 0.1 + 0.2 };
    expect(gcodeFileName('pieza', p, stats(20), now)).toBe('pieza_0.4n_0.3mm_1m_20261106-0905.gcode');
  });

  it('leaves the time out without stats', () => {
    expect(gcodeFileName('pieza.gcode', { ...PARAMS, nozzleDiameter: 4, layerHeight: 2 }, null, now))
      .toBe('pieza_4n_2mm_20261106-0905.gcode');
  });
});
