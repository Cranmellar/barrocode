import type { Pt } from './families';

/** What the print workspace's wave needs from a centerline. */
export interface WaveLimit {
  /** Tightest radius (mm) the wave follows without folding; 0 with no wave. */
  radiusMM: number;
  /** Impresión's sample spacing (mm): the scale its corner rounding looks at. */
  spacingMM: number;
  /** The wave in a few words, for the warning ("N 3 mm"). */
  label: string;
  /** How far the wave swings to each side of the line (mm): the largest N amplitude. */
  ampNMM: number;
}

/**
 * The two lines `amp` mm to either side of a closed outline, along its
 * normals: the band the wave sweeps. Where the outline bends tighter than
 * `amp`, the inner line crosses itself.
 */
export function waveBand(pts: Pt[], amp: number): [Pt[], Pt[]] {
  const n = pts.length;
  const left: Pt[] = [], right: Pt[] = [];
  pts.forEach((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1;
    const nx = -ty / l, ny = tx / l;
    left.push({ x: p.x + nx * amp, y: p.y + ny * amp });
    right.push({ x: p.x - nx * amp, y: p.y - ny * amp });
  });
  return [left, right];
}

/** A stretch of the outline tighter than the wave can follow. */
export interface TightSpot {
  /** Tightest sample, and the run of samples [from, to] (may wrap past 0). */
  index: number;
  from: number;
  to: number;
  radiusMM: number;
}

export interface PrintCheck {
  /** Tightest radius of the outline itself, from neighbouring samples, mm. */
  minRadiusMM: number;
  tight: TightSpot[];
}

/**
 * Radius of the outline at each sample, measured the way Impresión's corner
 * rounding measures it: the turn between the chords to the samples one
 * print spacing either side, against their mean length.
 */
function radii(pts: Pt[], k: number): number[] {
  const n = pts.length;
  return pts.map((b, i) => {
    const a = pts[(i - k + n) % n], c = pts[(i + k) % n];
    const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    const turn = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
    const legs = (Math.hypot(ux, uy) + Math.hypot(vx, vy)) / 2;
    return turn > 1e-9 ? legs / turn : Infinity;
  });
}

export function checkShape(pts: Pt[], wave: Pick<WaveLimit, 'radiusMM' | 'spacingMM'>): PrintCheck {
  const n = pts.length;
  let len = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  // Samples per print spacing.
  const k = Math.max(1, Math.min(Math.floor(n / 4), Math.round(wave.spacingMM / (len / n))));
  const r = radii(pts, k);
  const minRadiusMM = Math.min(...radii(pts, 1));
  const sharp = r.map(v => v < wave.radiusMM);
  if (!sharp.some(Boolean)) return { minRadiusMM, tight: [] };
  if (sharp.every(Boolean)) {
    const min = Math.min(...r);
    return { minRadiusMM, tight: [{ index: r.indexOf(min), from: 0, to: n - 1, radiusMM: min }] };
  }

  // Walk the loop from a smooth sample so no run is split at index 0.
  const start = sharp.indexOf(false);
  const tight: TightSpot[] = [];
  for (let s = 0; s < n; s++) {
    const i = (start + s) % n;
    if (!sharp[i]) continue;
    const last = tight[tight.length - 1];
    if (last && last.to === (i + n - 1) % n) {
      last.to = i;
      if (r[i] < last.radiusMM) { last.index = i; last.radiusMM = r[i]; }
    } else {
      tight.push({ index: i, from: i, to: i, radiusMM: r[i] });
    }
  }
  return { minRadiusMM, tight };
}

/** Samples of a spot's run, in order. */
export function spotIndices(spot: TightSpot, n: number): number[] {
  const out: number[] = [];
  for (let i = spot.from; ; i = (i + 1) % n) {
    out.push(i);
    if (i === spot.to) break;
  }
  return out;
}
