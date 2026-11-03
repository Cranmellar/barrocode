import { describe, expect, it } from 'vitest';
import { keyframeChanges } from '../keyframeDiff';
import { PARAMS } from './fixtures';

const base = { id: 'a', t: 0, ampN: 2, ampT: 0, wlN: 20, wlT: 20, delta: 0 };

describe('keyframeChanges', () => {
  it('lists only what changes, at the precision shown', () => {
    const kf = { ...base, id: 'b', t: 0.5, ampN: 6, wlN: 20.01, delta: Math.PI / 2, rotation: 30 };
    expect(keyframeChanges(base, kf, PARAMS)).toEqual([
      { label: 'N', from: '2', to: '6', unit: 'mm' },
      { label: 'Delta', from: '0', to: '90', unit: '°' },
      { label: 'Giro', from: '0', to: '30', unit: '°' },
    ]);
  });

  it('compares a missing optional field through the global value', () => {
    const params = { ...PARAMS, lissAmpZ: 0.8 };
    expect(keyframeChanges(base, { ...base, ampZ: 0.8 }, params)).toEqual([]);
    expect(keyframeChanges(base, { ...base, ampZ: 1.25 }, params)).toEqual([{ label: 'Z', from: '0,8', to: '1,25', unit: 'mm' }]);
  });
});
