import { lobes, polygon, superformula, type Pt } from './families';

export type Family = 'superformula' | 'polygon' | 'lobes';

/**
 * A generated shape. Angles are degrees, counter-clockwise seen from above
 * (the shaper's canvas and Impresión's top view, with *Invertir eje Y* on).
 * Percentages are 0–100.
 */
export interface ShapeDoc {
  family: Family;
  /** Twice the distance from the centre to the farthest point, in mm. */
  sizeMM: number;
  rotation: number;
  /** Where the outline starts and ends: the layer's seam. */
  seamAngle: number;
  clockwise: boolean;
  sfM: number;
  sfN1: number;
  sfN2: number;
  sfN3: number;
  polySides: number;
  polyStarPct: number;
  /** Corner fillet radius in mm. */
  polyFilletMM: number;
  lobeCount: number;
  lobeDepthPct: number;
  lobeSharp: number;
}

export const DEFAULT_SHAPE: ShapeDoc = {
  family: 'lobes',
  sizeMM: 80,
  rotation: 0,
  seamAngle: 0,
  clockwise: false,
  sfM: 6,
  sfN1: 4,
  sfN2: 8,
  sfN3: 8,
  polySides: 6,
  polyStarPct: 0,
  polyFilletMM: 8,
  lobeCount: 6,
  lobeDepthPct: 20,
  lobeSharp: 1,
};

/** The family parameters' numeric fields. */
export type FamilyKey =
  | 'sfM' | 'sfN1' | 'sfN2' | 'sfN3'
  | 'polySides' | 'polyStarPct' | 'polyFilletMM'
  | 'lobeCount' | 'lobeDepthPct' | 'lobeSharp';

export interface ParamSpec {
  key: FamilyKey;
  min: number;
  max: number;
  step: number;
  /** Sample on a log scale: the shape changes as much from 0.5 to 1 as from 5 to 10. */
  log?: boolean;
  /** Where a fresh discovery batch draws from: the slider's range minus its extremes. */
  explore: [number, number];
}

export const FAMILY_PARAMS: Record<Family, ParamSpec[]> = {
  lobes: [
    { key: 'lobeCount', min: 2, max: 24, step: 1, explore: [3, 12] },
    { key: 'lobeDepthPct', min: 0, max: 90, step: 1, explore: [5, 60] },
    { key: 'lobeSharp', min: 0.2, max: 5, step: 0.1, log: true, explore: [0.3, 4] },
  ],
  polygon: [
    { key: 'polySides', min: 3, max: 24, step: 1, explore: [3, 10] },
    { key: 'polyStarPct', min: 0, max: 90, step: 1, explore: [0, 60] },
    { key: 'polyFilletMM', min: 0, max: 40, step: 0.5, explore: [0, 15] },
  ],
  superformula: [
    { key: 'sfM', min: 0, max: 24, step: 1, explore: [2, 12] },
    { key: 'sfN1', min: 0.2, max: 20, step: 0.1, log: true, explore: [0.3, 12] },
    { key: 'sfN2', min: 0.2, max: 20, step: 0.1, log: true, explore: [0.3, 12] },
    { key: 'sfN3', min: 0.2, max: 20, step: 0.1, log: true, explore: [0.3, 12] },
  ],
};

export function paramSpec(key: FamilyKey): ParamSpec {
  for (const specs of Object.values(FAMILY_PARAMS)) {
    const spec = specs.find(s => s.key === key);
    if (spec) return spec;
  }
  throw new Error(key);
}

// Spacing of the output outline; parseSVG samples it again at sampleSpacing.
const SPACING_MM = 0.25;
const MIN_PTS = 64;
const MAX_PTS = 6000;

function familyOutline(doc: ShapeDoc): Pt[] {
  switch (doc.family) {
    case 'superformula':
      return superformula(doc.sfM, doc.sfN1, doc.sfN2, doc.sfN3);
    case 'lobes':
      return lobes(doc.lobeCount, doc.lobeDepthPct / 100, doc.lobeSharp);
    case 'polygon': {
      // The fillets pull the corners in, so the circumradius grows until the
      // farthest point lands on the requested size with the fillet in mm.
      const star = doc.polyStarPct / 100;
      let radius = doc.sizeMM / 2;
      for (let i = 0; i < 4; i++) radius *= doc.sizeMM / 2 / maxRadius(polygon(doc.polySides, star, radius, doc.polyFilletMM));
      return polygon(doc.polySides, star, radius, doc.polyFilletMM);
    }
  }
}

function maxRadius(pts: Pt[]): number {
  let m = 0;
  for (const p of pts) m = Math.max(m, Math.hypot(p.x, p.y));
  return m;
}

/** Where the ray from (0, 0) at `angle` (radians) leaves the outline. */
function seamCut(pts: Pt[], angle: number): { index: number; at: Pt } {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let best = { index: 0, at: pts[0], dist: Infinity };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (a.x * ey - a.y * ex) / den;
    const u = (a.x * dy - a.y * dx) / den;
    if (t <= 0 || u < 0 || u > 1) continue;
    // A ray can cross a concave stretch more than once; keep the outermost.
    if (best.dist === Infinity || t > best.dist) best = { index: i, at: { x: a.x + u * ex, y: a.y + u * ey }, dist: t };
  }
  return best;
}

function resample(loop: Pt[], count: number): Pt[] {
  const n = loop.length;
  const cum = [0];
  for (let i = 1; i <= n; i++) {
    const a = loop[i - 1], b = loop[i % n];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cum[n];
  const out: Pt[] = [];
  let seg = 0;
  for (let k = 0; k < count; k++) {
    const s = (total * k) / count;
    while (cum[seg + 1] < s) seg++;
    const a = loop[seg], b = loop[(seg + 1) % n];
    const len = cum[seg + 1] - cum[seg];
    const f = len > 0 ? (s - cum[seg]) / len : 0;
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return out;
}

function perimeter(pts: Pt[]): number {
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

/**
 * The outline in mm, y up, centred on (0, 0): evenly spaced, starting at the
 * seam, in the chosen direction, with no repeated end point.
 */
export function shapePoints(doc: ShapeDoc): Pt[] {
  const rot = (doc.rotation * Math.PI) / 180;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  let pts = familyOutline(doc).map(p => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
  const k = doc.sizeMM / 2 / maxRadius(pts);
  pts = pts.map(p => ({ x: p.x * k, y: p.y * k }));

  const cut = seamCut(pts, (doc.seamAngle * Math.PI) / 180);
  const loop = [cut.at, ...pts.slice(cut.index + 1), ...pts.slice(0, cut.index + 1)];
  const count = Math.min(MAX_PTS, Math.max(MIN_PTS, Math.round(perimeter(loop) / SPACING_MM)));
  const out = resample(loop, count);
  return doc.clockwise ? [out[0], ...out.slice(1).reverse()] : out;
}

export interface Bounds { x: number; y: number; width: number; height: number }

/** Bounding box in SVG coordinates (y down), mm. */
export function shapeBounds(pts: Pt[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, -p.y); maxY = Math.max(maxY, -p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Path data in SVG coordinates (y down), mm. */
export function shapePath(pts: Pt[]): string {
  const xy = (p: Pt) => `${fmt(p.x, 2)} ${fmt(-p.y, 2)}`;
  return `M${xy(pts[0])}L${pts.slice(1).map(xy).join(' ')}Z`;
}

const FAMILY_NAMES: Record<Family, string> = {
  superformula: 'Superfórmula',
  polygon: 'Polígono',
  lobes: 'Lóbulos',
};

/** ASCII name for the G-code file. */
export const FAMILY_FILES: Record<Family, string> = {
  superformula: 'superformula',
  polygon: 'poligono',
  lobes: 'lobulos',
};

export function familyName(f: Family): string {
  return FAMILY_NAMES[f];
}

export function shapeLabel(doc: ShapeDoc): string {
  return `${FAMILY_NAMES[doc.family]} · Ø ${fmt(doc.sizeMM, 1)} mm`;
}

export function fmt(v: number, decimals = 3): string {
  const s = String(+v.toFixed(decimals));
  return s === '-0' ? '0' : s;
}
