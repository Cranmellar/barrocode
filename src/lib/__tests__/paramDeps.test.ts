import { describe, expect, it } from 'vitest';
import type { PrintParams, WaveKeyframe } from '../../types';
import { generateWaveLayers, WAVE_PARAMS } from '../waveGenerator';
import { buildToolpath, TOOLPATH_PARAMS } from '../toolpath';
import { PARAMS, VIEWBOX, curve, sampledPath } from './fixtures';

// App memoizes each stage on its field list, so a field the stage reads but
// the list omits would leave the preview and G-code stale.

// Every feature on, so each field the stages read actually affects them.
const BASE: PrintParams = {
  ...PARAMS,
  lissAmpN: 3, lissAmpT: 2, lissAmpZ: 0.8, lissWlT: 13, lissWlZ: 30,
  lissDelta: 0.5, lissPhaseZ: 0.3, lissPhaseOffset: 0.2, phaseShiftPerLayer: 0.4,
  numLayers: 3, closePath: true,
  centerX: 40, centerY: 30, scaleX: 1.2, scaleY: 0.9, rotation: 25,
  scaleFactor: 0.8, originX: 5, originY: 7, flipY: true,
  zHopHeight: 2.5, hopRadius: 3,
};

// Keyframes leave the optional fields out, so the sampler falls back to BASE.
const KEYFRAMES: WaveKeyframe[] = [
  { id: 'a', t: 0.2, ampN: 2, ampT: 4, wlN: 15, wlT: 9, delta: 0.1 },
  { id: 'b', t: 0.7, ampN: 5, ampT: 1, wlN: 25, wlT: 18, delta: 1.2 },
];

// A closed curve and an open one: closePath only acts on the open one.
const lemniscate = () => [
  sampledPath('l', curve(u => {
    const t = 2 * Math.PI * u + 0.3;
    return [100 + 80 * Math.sin(t), 100 + 40 * Math.sin(2 * t)];
  }, 95)),
  sampledPath('arc', curve(u => [100 + 30 * Math.cos(3 * u), 180 + 30 * Math.sin(3 * u)], 40)),
];

function perturbed(params: PrintParams, key: keyof PrintParams): PrintParams {
  const v = params[key];
  return { ...params, [key]: typeof v === 'boolean' ? !v : (v as number) + 1.5 };
}

const others = (listed: readonly string[]) =>
  (Object.keys(BASE) as (keyof PrintParams)[]).filter(k => !listed.includes(k));

describe('memo field lists', () => {
  for (const keyframes of [[], KEYFRAMES]) {
    const label = keyframes.length ? 'with keyframes' : 'without keyframes';

    it(`WAVE_PARAMS lists every field generateWaveLayers reads — ${label}`, () => {
      const ref = generateWaveLayers(lemniscate(), BASE, keyframes);
      for (const key of others(WAVE_PARAMS)) {
        const layers = generateWaveLayers(lemniscate(), perturbed(BASE, key), keyframes);
        expect(layers, key).toEqual(ref);
      }
    });

    it(`TOOLPATH_PARAMS lists every field buildToolpath reads — ${label}`, () => {
      const layers = generateWaveLayers(lemniscate(), BASE, keyframes);
      const ref = buildToolpath(layers, BASE, VIEWBOX.height);
      for (const key of others(TOOLPATH_PARAMS)) {
        expect(buildToolpath(layers, perturbed(BASE, key), VIEWBOX.height), key).toEqual(ref);
      }
    });
  }

  it('each listed field does change its stage', () => {
    for (const key of WAVE_PARAMS) {
      // totalHeight only counts when useNumLayers is off.
      const base = key === 'totalHeight' ? { ...BASE, useNumLayers: false } : BASE;
      const ref = generateWaveLayers(lemniscate(), base, []);
      expect(generateWaveLayers(lemniscate(), perturbed(base, key), []), key).not.toEqual(ref);
    }
    const layers = generateWaveLayers(lemniscate(), BASE, []);
    const ref = buildToolpath(layers, BASE, VIEWBOX.height);
    for (const key of TOOLPATH_PARAMS) {
      expect(buildToolpath(layers, perturbed(BASE, key), VIEWBOX.height), key).not.toEqual(ref);
    }
  });
});
