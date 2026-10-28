import { superformulaN3 } from './families';
import { FAMILY_PARAMS, type FamilyKey, type ParamSpec, type ShapeDoc } from './shape';

/** A batch of variations: the same seed and spread around the same base give the same grid. */
export interface Batch {
  /** The shape the batch was drawn around; only its family and family parameters count. */
  base: ShapeDoc;
  /** 1 draws from each parameter's whole explore range; less draws from a window that fraction of it wide, centred on the base. */
  spread: number;
  seed: number;
}

export type Variant = Partial<Pick<ShapeDoc, FamilyKey>>;

export const GRID_SIZE = 9;
// "Más como esta" multiplies the spread by this, down to MIN_SPREAD.
export const NARROW = 0.4;
export const MIN_SPREAD = 0.05;

/** mulberry32: a small seeded PRNG, uniform in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function snap(v: number, spec: ParamSpec): number {
  const stepped = Math.round(v / spec.step) * spec.step;
  const decimals = String(spec.step).split('.')[1]?.length ?? 0;
  return +Math.min(spec.max, Math.max(spec.min, stepped)).toFixed(decimals);
}

function draw(spec: ParamSpec, base: number, spread: number, u: number): number {
  const [lo, hi] = spec.explore;
  if (spread >= 1) {
    return snap(spec.log && lo > 0 ? lo * (hi / lo) ** u : lo + (hi - lo) * u, spec);
  }
  const t = 2 * u - 1;
  if (spec.log && lo > 0) return snap(Math.max(base, spec.min) * (hi / lo) ** (t * spread / 2), spec);
  return snap(base + t * spread * (hi - lo) / 2, spec);
}

export function variations(batch: Batch, count = GRID_SIZE): Variant[] {
  const next = rng(batch.seed);
  const specs = FAMILY_PARAMS[batch.base.family];
  return Array.from({ length: count }, () => {
    const v: Variant = {};
    for (const spec of specs) v[spec.key] = draw(spec, batch.base[spec.key], batch.spread, next());
    // Store the n3 the outline uses, so the caption and the adopted shape agree.
    if (v.sfM !== undefined) v.sfN3 = superformulaN3(v.sfM, v.sfN2!, v.sfN3!);
    return v;
  });
}

/** Whether the shape already has this variant's parameters. */
export function isVariantOf(doc: ShapeDoc, v: Variant): boolean {
  return (Object.keys(v) as FamilyKey[]).every(k => doc[k] === v[k]);
}
