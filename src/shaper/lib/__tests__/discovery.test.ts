import { describe, it, expect } from 'vitest';
import { GRID_SIZE, isVariantOf, rng, variations, type Batch } from '../discovery';
import { DEFAULT_SHAPE, FAMILY_PARAMS, shapePoints, type Family } from '../shape';

const FAMILIES: Family[] = ['lobes', 'polygon', 'superformula'];
const batch = (family: Family, spread = 1, seed = 42): Batch => ({ base: { ...DEFAULT_SHAPE, family }, spread, seed });

describe('rng', () => {
  it('repeats for a seed and stays in [0, 1)', () => {
    const a = rng(7), b = rng(7), c = rng(8);
    const xs = Array.from({ length: 1000 }, a);
    expect(Array.from({ length: 1000 }, b)).toEqual(xs);
    expect(Array.from({ length: 1000 }, c)).not.toEqual(xs);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
  });
});

describe('variations', () => {
  for (const family of FAMILIES) {
    describe(family, () => {
      it('gives the same grid for the same seed, another for another seed', () => {
        expect(variations(batch(family))).toEqual(variations(batch(family)));
        expect(variations(batch(family, 1, 43))).not.toEqual(variations(batch(family)));
        expect(variations(batch(family))).toHaveLength(GRID_SIZE);
      });

      it('sets only the family parameters, on their slider steps', () => {
        const specs = FAMILY_PARAMS[family];
        for (const v of variations(batch(family))) {
          expect(Object.keys(v).sort()).toEqual(specs.map(s => s.key).sort());
          for (const s of specs) {
            const x = v[s.key]!;
            expect(x).toBeGreaterThanOrEqual(s.min);
            expect(x).toBeLessThanOrEqual(s.max);
            expect(Math.abs(x / s.step - Math.round(x / s.step))).toBeLessThan(1e-6);
          }
        }
      });

      it('draws a fresh batch from the explore ranges', () => {
        for (const v of variations(batch(family), 200)) {
          for (const s of FAMILY_PARAMS[family]) {
            expect(v[s.key]!).toBeGreaterThanOrEqual(s.explore[0] - s.step);
            expect(v[s.key]!).toBeLessThanOrEqual(s.explore[1] + s.step);
          }
        }
      });

      it('stays near the base when narrowed', () => {
        const wide = variations(batch(family, 1), 200);
        const narrow = variations(batch(family, 0.1), 200);
        for (const s of FAMILY_PARAMS[family]) {
          const base = DEFAULT_SHAPE[s.key];
          const dev = (vs: typeof wide) => Math.max(...vs.map(v => Math.abs(v[s.key]! - base)));
          expect(dev(narrow)).toBeLessThan(dev(wide));
          const [lo, hi] = s.explore;
          const limit = s.log ? base * ((hi / lo) ** 0.05 - 1) : 0.05 * (hi - lo);
          expect(dev(narrow)).toBeLessThanOrEqual(limit + s.step);
        }
      });

      it('makes shapes that can be drawn', () => {
        for (const v of variations(batch(family))) {
          const pts = shapePoints({ ...DEFAULT_SHAPE, family, ...v });
          expect(pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
        }
      });
    });
  }

  it('ties n3 to n2 for odd symmetries, as the outline does', () => {
    for (const v of variations(batch('superformula'), 200)) {
      if (v.sfM! % 2 === 1) expect(v.sfN3).toBe(v.sfN2);
    }
  });

  it('tells which variant the shape already has', () => {
    const [v] = variations(batch('lobes'));
    expect(isVariantOf({ ...DEFAULT_SHAPE, ...v }, v)).toBe(true);
    expect(isVariantOf(DEFAULT_SHAPE, v)).toBe(false);
  });
});
