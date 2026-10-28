/**
 * Lissajous Wave Generator
 *
 * The extruder traces a Lissajous figure in its own local reference frame
 * (T = tangent, N = normal) while following the SVG centerline globally.
 *
 * Combined toolpath point at arc length s, layer li:
 *
 *   phase_base = lissPhaseOffset + li * phaseShiftPerLayer
 *                (with keyframes: offset(t_li) + Σ_{j<li} shift(t_j), both
 *                sampled at each layer's start, so a layer keeps one phase
 *                and still closes at the seam)
 *   cyc_X(s)   = ∫₀ˢ 2π / wlX(u) du        (= 2π·s / wlX when wlX is constant)
 *   offset_N   = ampN * sin( cyc_N(s)  +  lissDelta  +  phase_base )
 *   offset_T   = ampT * sin( cyc_T(s)              +  phase_base )
 *   point      = centerline(s) + N(s)·offset_N + T(s)·offset_T
 *
 * If keyframes are provided, ampN/ampT/wlN/wlT/delta/centerX/Y/scaleX/Y/rotation
 * and the two phase fields are interpolated along the flattened trajectory (t ∈ [0,1] across all layers).
 * Scale, then rotation, is applied per-point in SVG space around the
 * interpolated center.
 *
 * The phase is integrated rather than computed as 2π·s/wl: with a wavelength
 * that varies along the path, 2π·s/wl(s) has derivative 2π(1/wl − s·wl'/wl²),
 * so the local frequency overshoots badly far from s = 0.
 *
 * On a closed path each cyc_X is scaled so the path holds a whole number of
 * cycles and the wave meets itself at the seam (wl changes by ≤ wl/2L).
 */

import type {
  SampledPath, SampledPoint, WavePoint, WaveLayer, PrintParams, WaveKeyframe,
} from '../types';

const TWO_PI = 2 * Math.PI;

// Thinnest bead the Z wave may leave, as a fraction of layerHeight.
const MIN_LAYER_GAP = 0.5;

// ── Local params struct ─────────────────────────────────────────────────────

export interface LocalParams {
  ampN: number; ampT: number; ampZ: number;
  wlN: number;  wlT: number;  wlZ: number;
  delta: number;
  phaseZ: number;
  centerX: number; centerY: number;  // mm
  scaleX:  number; scaleY:  number;  // multipliers
  rotation: number;                  // degrees
  phaseOffset: number; phaseShift: number;  // radians
}

// ── Keyframe interpolation ──────────────────────────────────────────────────

function baseToLocal(base: PrintParams): LocalParams {
  return {
    ampN: base.lissAmpN, ampT: base.lissAmpT, ampZ: base.lissAmpZ,
    wlN:  base.lissWlN,  wlT:  base.lissWlT,  wlZ:  base.lissWlZ,
    delta: base.lissDelta,
    phaseZ: base.lissPhaseZ,
    centerX: base.centerX, centerY: base.centerY,
    scaleX:  base.scaleX,  scaleY:  base.scaleY,
    rotation: base.rotation,
    phaseOffset: base.lissPhaseOffset, phaseShift: base.phaseShiftPerLayer,
  };
}

function kfToLocal(k: WaveKeyframe, base: PrintParams): LocalParams {
  return {
    ampN: k.ampN, ampT: k.ampT, ampZ: k.ampZ ?? base.lissAmpZ,
    wlN:  k.wlN,  wlT:  k.wlT,  wlZ:  k.wlZ  ?? base.lissWlZ,
    delta: k.delta,
    phaseZ: k.phaseZ ?? base.lissPhaseZ,
    centerX: k.centerX ?? base.centerX,
    centerY: k.centerY ?? base.centerY,
    scaleX:  k.scaleX  ?? base.scaleX,
    scaleY:  k.scaleY  ?? base.scaleY,
    rotation: k.rotation ?? base.rotation,
    phaseOffset: k.phaseOffset ?? base.lissPhaseOffset,
    phaseShift:  k.phaseShift  ?? base.phaseShiftPerLayer,
  };
}

function lerpLocal(loF: LocalParams, hiF: LocalParams, alpha: number): LocalParams {
  return lerpLocalInto({} as LocalParams, loF, hiF, alpha);
}

// Writes into `out` so a per-point sampler allocates nothing.
function lerpLocalInto(out: LocalParams, loF: LocalParams, hiF: LocalParams, alpha: number): LocalParams {
  const lerp = (a: number, b: number) => a + (b - a) * alpha;
  out.ampN = lerp(loF.ampN, hiF.ampN);
  out.ampT = lerp(loF.ampT, hiF.ampT);
  out.ampZ = lerp(loF.ampZ, hiF.ampZ);
  out.wlN = Math.max(0.1, lerp(loF.wlN, hiF.wlN));
  out.wlT = Math.max(0.1, lerp(loF.wlT, hiF.wlT));
  out.wlZ = Math.max(0.1, lerp(loF.wlZ, hiF.wlZ));
  out.delta = lerp(loF.delta, hiF.delta);
  out.phaseZ = lerp(loF.phaseZ, hiF.phaseZ);
  out.centerX = lerp(loF.centerX, hiF.centerX);
  out.centerY = lerp(loF.centerY, hiF.centerY);
  out.scaleX = lerp(loF.scaleX, hiF.scaleX);
  out.scaleY = lerp(loF.scaleY, hiF.scaleY);
  // Plain lerp, no wrap to ±180°: 0° → 360° is a full twist.
  out.rotation = lerp(loF.rotation, hiF.rotation);
  out.phaseOffset = lerp(loF.phaseOffset, hiF.phaseOffset);
  out.phaseShift = lerp(loF.phaseShift, hiF.phaseShift);
  return out;
}

// Fraction of the way from lo to hi at segment fraction a. A cubic Hermite
// whose end slopes are 0 at a smooth keyframe and 1 (straight) otherwise:
// both straight gives a, both smooth gives smoothstep.
export function segmentAlpha(lo: WaveKeyframe, hi: WaveKeyframe, a: number): number {
  const m0 = lo.smooth ? 0 : 1;
  const m1 = hi.smooth ? 0 : 1;
  if (m0 === 1 && m1 === 1) return a;
  const a2 = a * a, a3 = a2 * a;
  return (a3 - 2 * a2 + a) * m0 + (3 * a2 - 2 * a3) + (a3 - a2) * m1;
}

// Tolerance in t under which the timeline cursor counts as sitting on a keyframe,
// so "add" never creates a second keyframe on top of an existing one.
const KF_MATCH_TOL = 0.005;

export function findKeyframeAt(keyframes: WaveKeyframe[], t: number): WaveKeyframe | null {
  let best: WaveKeyframe | null = null;
  for (const k of keyframes) {
    const d = Math.abs(k.t - t);
    if (d < KF_MATCH_TOL && (!best || d < Math.abs(best.t - t))) best = k;
  }
  return best;
}

// Point lookup for arbitrary t — used by Preview2D for the timeline indicator.
export function getParamsAtT(
  t: number,
  keyframes: WaveKeyframe[],
  base: PrintParams,
): LocalParams {
  if (keyframes.length === 0) return baseToLocal(base);

  const sorted = [...keyframes].sort((a, b) => a.t - b.t);
  const expanded = sorted.map(k => kfToLocal(k, base));

  if (t <= sorted[0].t) return expanded[0];
  if (t >= sorted[sorted.length - 1].t) return expanded[sorted.length - 1];

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].t <= t && t <= sorted[i + 1].t) {
      const alpha = (sorted[i + 1].t - sorted[i].t) > 0
        ? (t - sorted[i].t) / (sorted[i + 1].t - sorted[i].t)
        : 0;
      return lerpLocal(expanded[i], expanded[i + 1], segmentAlpha(sorted[i], sorted[i + 1], alpha));
    }
  }
  return expanded[expanded.length - 1];
}

// Sampler for monotonically increasing t — avoids O(n log n) sort per point.
// Call once before a layer loop, then call the returned function for each point.
// Between keyframes it reuses one object: read the result before the next call.
export function createKeyframeSampler(
  keyframes: WaveKeyframe[],
  base: PrintParams,
): (t: number) => LocalParams {
  const baseFull = baseToLocal(base);
  if (keyframes.length === 0) return () => baseFull;

  const sorted = [...keyframes].sort((a, b) => a.t - b.t);
  const expanded = sorted.map(k => kfToLocal(k, base));
  let cursor = 0;
  const scratch = { ...baseFull };

  return (t: number): LocalParams => {
    if (t <= sorted[0].t) return expanded[0];
    if (t >= sorted[sorted.length - 1].t) return expanded[sorted.length - 1];

    // Advance cursor forward — valid only for monotonically increasing t.
    while (cursor < sorted.length - 2 && t > sorted[cursor + 1].t) cursor++;

    const alpha = (sorted[cursor + 1].t - sorted[cursor].t) > 0
      ? (t - sorted[cursor].t) / (sorted[cursor + 1].t - sorted[cursor].t)
      : 0;
    return lerpLocalInto(scratch, expanded[cursor], expanded[cursor + 1], segmentAlpha(sorted[cursor], sorted[cursor + 1], alpha));
  };
}

// ── Single-point Lissajous offset ───────────────────────────────────────────

function lissajousPoint(
  p: SampledPoint,
  ampN: number,
  ampT: number,
  ampZ: number,
  cycN: number,
  cycT: number,
  cycZ: number,
  delta: number,
  phaseZ: number,
  phaseBase: number,
): WavePoint {
  const oN = ampN * Math.sin(cycN + delta + phaseBase);
  const oT = ampT * Math.sin(cycT         + phaseBase);
  const zOffset = ampZ * Math.sin(cycZ + phaseZ + phaseBase);
  return {
    x: p.x + p.normalX * oN + p.tangentX * oT,
    y: p.y + p.normalY * oN + p.tangentY * oT,
    zOffset,
  };
}

// ── Scale + rotation around center in SVG space ─────────────────────────────
//
// centerX/Y are mm offsets from the part's centre (partCentreSVG), which
// svgToMM puts at (originX, originY) on the bed. In SVG units the pivot is
//
//   svgCX = cx + centerX_mm / sf
//   svgCY = cy ± centerY_mm / sf     (minus with flipY)
//
// which svgToMM maps to (originX + centerX, originY + centerY).
//
// Scale goes first so scaleX/Y stay on the shape's own axes: an oval turns
// rigidly instead of shearing.

/**
 * Centre of the bounding box of the enabled centerlines, in SVG units. The
 * part is printed with this point at (originX, originY), wherever the SVG
 * placed it on its artboard.
 */
export function partCentreSVG(paths: SampledPath[]): { x: number; y: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const path of paths) {
    if (!path.enabled) continue;
    for (const p of path.points) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
  }
  return minX === Infinity ? { x: 0, y: 0 } : { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

// Transforms `pt` in place; callers pass a point they just created.
function applyTransformSVG(
  pt: WavePoint,
  centre: { x: number; y: number },  // SVG units
  centerX: number,   // mm offset from centre
  centerY: number,   // mm offset from centre
  scaleX: number,
  scaleY: number,
  rotation: number,  // degrees
  sf: number,        // scaleFactor
  flipY: boolean,
): WavePoint {
  if (scaleX === 1 && scaleY === 1 && rotation === 0) return pt;
  const cxSVG = centre.x + centerX / sf;
  const cySVG = centre.y + (flipY ? -centerY : centerY) / sf;
  const dx = (pt.x - cxSVG) * scaleX;
  const dy = (pt.y - cySVG) * scaleY;
  if (rotation === 0) {
    pt.x = cxSVG + dx;
    pt.y = cySVG + dy;
    return pt;
  }
  // With flipY the SVG's Y runs opposite to the bed's, so CCW on the bed
  // is CW in SVG space.
  const a = (flipY ? -rotation : rotation) * Math.PI / 180;
  const c = Math.cos(a), s = Math.sin(a);
  pt.x = cxSVG + dx * c - dy * s;
  pt.y = cySVG + dx * s + dy * c;
  return pt;
}

// getPointAtLength works in float32, so a closed source can miss its start
// by a little more than 0.001 units on large coordinates.
function isLoop({ points: pts, totalLength }: SampledPath): boolean {
  if (pts.length < 2) return false;
  const a = pts[0], b = pts[pts.length - 1];
  return Math.hypot(a.x - b.x, a.y - b.y) <= Math.max(0.001, totalLength * 1e-5);
}

// ── Corner rounding ─────────────────────────────────────────────────────────
//
// The wave is offset along the normal, which turns all at once at a corner:
// on the outside the offset jumps and leaves a straight chord, on the inside
// it folds into a cusp or a small loop (and the loop got a z-hop). Wherever
// the centerline turns tighter than the wave can follow, it is replaced by a
// circular fillet tangent to both legs.

// Margin over the tightest radius the wave can follow without folding.
const CORNER_RADIUS_FACTOR = 1.25;

/**
 * Tightest centerline radius (mm) the wave follows without folding. On a
 * curve of curvature κ the inner edge moves forward at 1 − κ·ampN, and the
 * T wave takes up to ampT·2π/wlT of that, so a loop forms once κ exceeds
 * (1 − ampT·2π/wlT) / ampN. A T wave that loops on its own is a design
 * choice: the radius stops growing at 2·ampN there. At least ampT, or a
 * corner would still throw the T offset across it.
 */
export function cornerRadius(ampN: number, ampT: number, wlT: number): number {
  const margin = Math.min(1, Math.max(0.5, 1 - Math.abs(ampT) * 2 * Math.PI / Math.max(wlT, 0.1)));
  return CORNER_RADIUS_FACTOR * Math.max(Math.abs(ampN) / margin, Math.abs(ampT));
}

/** Corner radius (mm) for the whole part: the tightest any keyframe needs, else the global wave's. */
export function waveCornerRadius(params: PrintParams, keyframes: WaveKeyframe[]): number {
  return keyframes.length > 0
    ? Math.max(0, ...keyframes.map(k => cornerRadius(k.ampN, k.ampT, k.wlT)))
    : cornerRadius(params.lissAmpN, params.lissAmpT, params.lissWlT);
}

interface FramePoint { x: number; y: number; tx: number; ty: number; seg: number }

function turnAngle(a: FramePoint, b: FramePoint, c: FramePoint): number {
  const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
  return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
}

/**
 * Vertices where the centerline turns tighter than `radius`, measured on the
 * chords and on the sample tangents the wave is offset along: a corner that
 * falls between two samples splits its chord turn in two, but the tangents
 * still jump by all of it across one segment.
 */
function sharpVertices(pts: FramePoint[], radius: number, cyclic: boolean): boolean[] {
  const n = pts.length;
  const at = (i: number) => pts[(i + n) % n];
  const jump = (i: number) => {  // across the segment from i to i + 1
    const a = at(i), b = at(i + 1);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const turn = Math.abs(Math.atan2(a.tx * b.ty - a.ty * b.tx, a.tx * b.tx + a.ty * b.ty));
    return len > 0 && turn > len / radius;
  };
  return pts.map((b, i) => {
    if (!cyclic && (i === 0 || i === n - 1)) return false;
    const a = at(i - 1), c = at(i + 1);
    const len = (Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - b.x, c.y - b.y)) / 2;
    return (len > 0 && Math.abs(turnAngle(a, b, c)) > len / radius) || jump(i - 1) || jump(i);
  });
}

/** Fillets every run of sharp vertices of an open polyline; ends stay put. */
function filletPolyline(pts: FramePoint[], radius: number, step: number): FramePoint[] {
  const n = pts.length;
  const runs: [number, number][] = [];
  const sharp = sharpVertices(pts, radius, false);
  for (let i = 1; i < n - 1; i++) {
    if (!sharp[i]) continue;
    const last = runs[runs.length - 1];
    // One smooth vertex between two sharp ones still belongs to the corner.
    if (last && i - last[1] <= 2) last[1] = i;
    else runs.push([i, i]);
  }
  if (runs.length === 0) return pts;

  const out: FramePoint[] = [];
  // A tangent point can land on or next to a sample; a step that short
  // would read as a cusp, or extrude less than E's printed resolution.
  let dropped = false;
  const push = (pt: FramePoint) => {
    const prev = out[out.length - 1];
    const gap = prev ? Math.hypot(pt.x - prev.x, pt.y - prev.y) : Infinity;
    if (gap < step / 8) { dropped = true; return; }
    out.push(dropped ? { ...pt, seg: gap } : pt);
    dropped = false;
  };
  let kept = 0;  // first point not yet copied
  runs.forEach(([i, j], r) => {
    // The previous fillet already took this corner's incoming leg.
    if (i - 1 < kept) return;
    let turned = 0;
    for (let k = i; k <= j; k++) turned += turnAngle(pts[k - 1], pts[k], pts[k + 1]);
    // A turn near 180° or more (a hairpin, a loop smaller than the wave)
    // has no fillet; leave it as it is.
    if (Math.abs(turned) > 3) return;

    // The legs' own tangents, not chords: a corner usually falls between two
    // samples, and the chord across it would give the fillet a wrong exit.
    const a0 = pts[i - 1], b0 = pts[j + 1];
    const u = { x: a0.tx, y: a0.ty }, v = { x: b0.tx, y: b0.ty };
    const cross = u.x * v.y - u.y * v.x;
    const theta = Math.atan2(cross, u.x * v.x + u.y * v.y);
    if (Math.abs(cross) < 1e-9 || Math.abs(theta) < 1e-3) return;
    // Apex: where the incoming and outgoing tangent lines meet.
    const a = ((b0.x - a0.x) * v.y - (b0.y - a0.y) * v.x) / cross;
    const X = { x: a0.x + a * u.x, y: a0.y + a * u.y };

    const lo = kept, hi = r + 1 < runs.length ? runs[r + 1][0] - 1 : n - 1;
    const back = (k: number) => -((pts[k].x - X.x) * u.x + (pts[k].y - X.y) * u.y);
    const ahead = (k: number) => (pts[k].x - X.x) * v.x + (pts[k].y - X.y) * v.y;
    // Where the fillet leaves and rejoins the path: on it, with its own
    // tangent, rather than on the tangent lines, which drift off a curved leg.
    const along = (k0: number, k1: number, f: number): FramePoint => {
      const A = pts[k0], B = pts[k1];
      const tx = A.tx + (B.tx - A.tx) * f, ty = A.ty + (B.ty - A.ty) * f;
      const l = Math.hypot(tx, ty) || 1;
      return { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f, tx: tx / l, ty: ty / l, seg: 0 };
    };
    const clamp01 = (f: number) => Math.min(1, Math.max(0, f));
    const cut = (want: number) => {
      let p = i - 1;
      while (p > lo && back(p) < want) p--;
      let q = j + 1;
      while (q < hi && ahead(q) < want) q++;
      // Too little room on a leg: a tighter fillet that still fits, cut
      // back no further than it needs on the other leg.
      const d = Math.min(want, back(p), ahead(q));
      while (p + 1 < i && back(p + 1) >= d) p++;
      while (q - 1 > j && ahead(q - 1) >= d) q--;
      const bp = back(p), bp1 = back(p + 1), aq = ahead(q), aq1 = ahead(q - 1);
      const start = along(p, p + 1, bp > bp1 ? clamp01((bp - d) / (bp - bp1)) : 0);
      const end = along(q - 1, q, aq > aq1 ? clamp01((d - aq1) / (aq - aq1)) : 1);
      const turn = Math.atan2(start.tx * end.ty - start.ty * end.tx, start.tx * end.tx + start.ty * end.ty);
      const chord = Math.hypot(end.x - start.x, end.y - start.y);
      const arcRadius = Math.abs(turn) > 1e-6 ? chord / (2 * Math.sin(Math.abs(turn) / 2)) : 0;
      return { p, q, d, start, end, turn, chord, arcRadius, fits: d >= want };
    };
    let c = cut(radius * Math.tan(Math.abs(theta) / 2));
    if (!(c.d > 0)) return;
    // Legs that bend inward make the fillet tighter than the tangents at
    // the corner suggest: cut further out until it has the radius.
    for (let k = 0; k < 6 && c.fits && c.arcRadius > 0 && c.arcRadius < radius * 0.98; k++) {
      c = cut(c.d * radius / c.arcRadius);
    }
    const { p, q, start, end, turn, chord, arcRadius } = c;

    // A cubic tangent to both ends; between straight legs it is the
    // circular fillet of the given radius, its curvature within 6 % up to 150°.
    const h = arcRadius > 0 ? (4 / 3) * Math.tan(Math.abs(turn) / 4) * arcRadius : chord / 3;
    const c1 = { x: start.x + h * start.tx, y: start.y + h * start.ty };
    const c2 = { x: end.x - h * end.tx, y: end.y - h * end.ty };
    // Spaced for the wave's outer edge, which runs on a wider arc.
    const length = arcRadius > 0 ? (arcRadius + radius / CORNER_RADIUS_FACTOR) * Math.abs(turn) : chord;
    const m = Math.max(1, Math.ceil(length / step));

    for (let k = kept; k <= p; k++) push(pts[k]);
    for (let k = 0; k <= m; k++) {
      const t = k / m, w = 1 - t;
      const x = w * w * w * start.x + 3 * w * w * t * c1.x + 3 * w * t * t * c2.x + t * t * t * end.x;
      const y = w * w * w * start.y + 3 * w * w * t * c1.y + 3 * w * t * t * c2.y + t * t * t * end.y;
      let dx = 3 * w * w * (c1.x - start.x) + 6 * w * t * (c2.x - c1.x) + 3 * t * t * (end.x - c2.x);
      let dy = 3 * w * w * (c1.y - start.y) + 6 * w * t * (c2.y - c1.y) + 3 * t * t * (end.y - c2.y);
      const dl = Math.hypot(dx, dy);
      if (dl > 1e-12) { dx /= dl; dy /= dl; } else { dx = start.tx; dy = start.ty; }
      const prev = out[out.length - 1];
      push({ x, y, tx: dx, ty: dy, seg: Math.hypot(x - prev.x, y - prev.y) });
    }
    const prev = out[out.length - 1];
    push({ ...pts[q], seg: Math.hypot(pts[q].x - prev.x, pts[q].y - prev.y) });
    kept = q + 1;
  });
  for (let k = kept; k < n; k++) push(pts[k]);
  return out;
}

/**
 * A closed path whose two seam samples share one frame. The parser gives
 * them one-sided tangents, which differ when the seam sits on a corner or
 * when a `Z` closes a tiny gap (its direction is all the end sample sees),
 * and the wave would push the two ends apart. The shared tangent follows
 * the chord between the seam's neighbours.
 */
function joinSeamFrame(path: SampledPath): SampledPath {
  const pts = path.points, a = pts[0], b = pts[pts.length - 1];
  if (pts.length < 4 || (a.tangentX === b.tangentX && a.tangentY === b.tangentY)) return path;
  const next = pts[1], prev = pts[pts.length - 2];
  const tx = next.x - prev.x, ty = next.y - prev.y;
  const len = Math.hypot(tx, ty);
  if (len < 1e-9) return path;
  const frame = { tangentX: tx / len, tangentY: ty / len, normalX: -ty / len, normalY: tx / len };
  const points = [{ ...a, ...frame }, ...pts.slice(1, -1), { ...b, ...frame }];
  return { ...path, points };
}

/**
 * The path with every corner tighter than `radius` (SVG units) rounded.
 * Returns the same object when nothing needed rounding.
 */
export function roundCorners(path: SampledPath, radius: number): SampledPath {
  const src = path.points;
  if (!(radius > 0) || src.length < 3) return path;
  const frame: FramePoint[] = src.map((p, i) => ({
    x: p.x, y: p.y, tx: p.tangentX, ty: p.tangentY,
    seg: i > 0 ? p.arcLength - src[i - 1].arcLength : 0,
  }));
  const first = src[0];
  const loop = isLoop(path);
  const step = path.totalLength / (src.length - 1);

  let pts: FramePoint[];
  if (!loop) {
    pts = filletPolyline(frame, radius, step);
  } else {
    // Cut the loop open where it is smoothest, so a corner on the seam is
    // rounded too, then start again as close to the original start as possible.
    const ring = frame.slice(0, -1);
    const m = ring.length;
    const sharp = sharpVertices(ring, radius, true);
    if (!sharp.some(Boolean)) return path;
    if (sharp.every(Boolean)) return path;
    let best = 0, bestLen = -1;
    for (let i = 0; i < m; i++) {
      if (sharp[i] || !sharp[(i + m - 1) % m]) continue;
      let len = 0;
      while (!sharp[(i + len) % m]) len++;
      if (len > bestLen) { bestLen = len; best = (i + Math.floor(len / 2)) % m; }
    }
    // The closing segment's length belongs to the point after it.
    const closing = frame[frame.length - 1].seg;
    const open = [...ring.slice(best), ...ring.slice(0, best), ring[best]]
      .map((p, k) => ({ ...p, seg: k === 0 ? 0 : p === ring[0] ? closing : p.seg }));
    const rounded = filletPolyline(open, radius, step);
    if (rounded === open) return path;
    const body = rounded.slice(0, -1);
    const wrap = rounded[rounded.length - 1].seg;
    let start = body.indexOf(open[(m - best) % m]);
    if (start < 0) {
      let bestD = Infinity;
      body.forEach((p, k) => {
        const dd = Math.hypot(p.x - first.x, p.y - first.y);
        if (dd < bestD) { bestD = dd; start = k; }
      });
    }
    const ordered = [...body.slice(start), ...body.slice(0, start)];
    pts = [...ordered, ordered[0]].map((p, k) => ({
      ...p,
      seg: k === 0 ? 0 : k === body.length - start ? wrap : p.seg,
    }));
  }
  if (pts === frame) return path;

  let arc = 0;
  const points: SampledPoint[] = pts.map((p, k) => {
    if (k > 0) arc += p.seg;
    return { x: p.x, y: p.y, tangentX: p.tx, tangentY: p.ty, normalX: -p.ty, normalY: p.tx, arcLength: arc };
  });
  return { ...path, points, totalLength: arc };
}

// ── All layers ───────────────────────────────────────────────────────────────

// Every PrintParams field generateWaveLayers reads; App keys its memo on
// these so G-code-only edits don't rebuild the layers. A test pins the list.
export const WAVE_PARAMS = [
  'lissAmpN', 'lissAmpT', 'lissAmpZ', 'lissWlN', 'lissWlT', 'lissWlZ',
  'lissDelta', 'lissPhaseZ', 'lissPhaseOffset', 'phaseShiftPerLayer',
  'layerHeight', 'numLayers', 'useNumLayers', 'totalHeight', 'nozzleHeightOffset',
  'reversePath', 'alternateDirection', 'closePath',
  'centerX', 'centerY', 'scaleX', 'scaleY', 'rotation',
  'scaleFactor', 'flipY',
] as const satisfies readonly (keyof PrintParams)[];

// Past this the pipeline takes seconds per edit and the G-code tens of MB.
export const MAX_LAYERS = 500;

export function layerCount(params: PrintParams): number {
  const n = params.useNumLayers
    ? params.numLayers
    : Math.ceil(params.totalHeight / params.layerHeight);
  return Math.min(MAX_LAYERS, Math.max(1, n));
}

export function generateWaveLayers(
  sampledPaths: SampledPath[],
  params: PrintParams,
  keyframes: WaveKeyframe[] = [],
): WaveLayer[] {
  if (!sampledPaths.some(p => p.enabled)) return [];

  const numLayers = layerCount(params);

  const sf = params.scaleFactor > 0 ? params.scaleFactor : 1;
  const useKeyframes = keyframes.length > 0;

  const kfRadius = waveCornerRadius(params, keyframes);
  const enabled = sampledPaths.filter(p => p.enabled).map(path => {
    const radius = useKeyframes ? kfRadius : cornerRadius(
      path.ampNOverride ?? params.lissAmpN,
      path.ampTOverride ?? params.lissAmpT,
      path.wlTOverride ?? params.lissWlT,
    );
    const rounded = roundCorners(path, radius / sf);
    return isLoop(rounded) ? joinSeamFrame(rounded) : rounded;
  });

  let totalFlatPoints = 0;
  for (let li = 0; li < numLayers; li++) {
    for (const path of enabled) {
      totalFlatPoints += path.points.length;
      if (params.closePath && path.points.length > 1) totalFlatPoints += 1;
    }
  }
  const tDenom = Math.max(1, totalFlatPoints - 1);

  const kfSampler = useKeyframes ? createKeyframeSampler(keyframes, params) : null;
  // Walks the same t values as kfSampler, one path ahead, to count cycles.
  const cycleSampler = useKeyframes ? createKeyframeSampler(keyframes, params) : null;
  let flatIdx = 0;

  const loops = enabled.map(isLoop);
  const centre = partCentreSVG(sampledPaths);
  const closed = loops.map(l => l || params.closePath);

  const layers: WaveLayer[] = [];
  // Absolute Z of each point on the previous layer, in sampling order.
  let prevZ: number[][] = [];

  // Sum of the keyframed per-layer shifts of the layers below.
  let shiftBelow = 0;

  for (let li = 0; li < numLayers; li++) {
    const z = li * params.layerHeight + params.nozzleHeightOffset;
    let phaseBase = params.lissPhaseOffset + li * params.phaseShiftPerLayer;
    if (useKeyframes) {
      const lp = getParamsAtT(flatIdx / tDenom, keyframes, params);
      phaseBase = lp.phaseOffset + shiftBelow;
      shiftBelow += lp.phaseShift;
    }

    const isAlt = params.alternateDirection && li % 2 === 1;
    const reverse = params.reversePath !== isAlt;

    const layerZ: number[][] = [];

    const pathPoints: WavePoint[][] = enabled.map((path, pi) => {
      const pts = reverse ? [...path.points].reverse() : path.points;
      const n = pts.length;
      const below = prevZ[pi];
      const pathZ: number[] = new Array(n);
      layerZ.push(pathZ);
      const arcAt = (p: SampledPoint) => reverse ? path.totalLength - p.arcLength : p.arcLength;
      const pathLocal: LocalParams = {
        ampN: (path.ampNOverride ?? params.lissAmpN) / sf,
        ampT: (path.ampTOverride ?? params.lissAmpT) / sf,
        ampZ: params.lissAmpZ,  // Z amplitude stays in mm (not scaled by sf)
        wlN:  (path.wlNOverride  ?? params.lissWlN)  / sf,
        wlT:  (path.wlTOverride  ?? params.lissWlT)  / sf,
        wlZ:  params.lissWlZ / sf,
        delta: params.lissDelta,
        phaseZ: params.lissPhaseZ,
        centerX: params.centerX, centerY: params.centerY,
        scaleX:  params.scaleX,  scaleY:  params.scaleY,
        rotation: params.rotation,
        phaseOffset: params.lissPhaseOffset, phaseShift: params.phaseShiftPerLayer,
      };
      // Wavelengths in SVG units; keyframe values are still in mm.
      const wlScale = useKeyframes ? sf : 1;

      // A closed path holds a whole number of cycles of each wave, so it
      // ends in the phase it started with instead of up to 2·amp to the
      // side, which left a step at the seam on every layer.
      let fitN = 1, fitT = 1, fitZ = 1;
      if (loops[pi]) {
        let cN = 0, cT = 0, cZ = 0, prev = 0;
        pts.forEach((p, i) => {
          const s = arcAt(p), ds = s - prev;
          prev = s;
          const lp = cycleSampler ? cycleSampler((flatIdx + i) / tDenom) : pathLocal;
          cN += ds / (lp.wlN / wlScale); cT += ds / (lp.wlT / wlScale); cZ += ds / (lp.wlZ / wlScale);
        });
        const fit = (c: number) => c > 0 ? Math.max(1, Math.round(c)) / c : 1;
        fitN = fit(cN); fitT = fit(cT); fitZ = fit(cZ);
      }

      let prevS = 0, cycN = 0, cycT = 0, cycZ = 0;

      const result: WavePoint[] = pts.map((p, i) => {
        const s = arcAt(p);
        const ds = s - prevS;
        prevS = s;

        const lp = kfSampler ? kfSampler(flatIdx / tDenom) : pathLocal;
        flatIdx++;

        const aN = useKeyframes ? lp.ampN / sf : lp.ampN;
        const aT = useKeyframes ? lp.ampT / sf : lp.ampT;
        const aZ = lp.ampZ;  // always mm — not converted to SVG units
        const wN = lp.wlN / wlScale, wT = lp.wlT / wlScale, wZ = lp.wlZ / wlScale;

        cycN += TWO_PI * fitN * ds / wN;
        cycT += TWO_PI * fitT * ds / wT;
        cycZ += TWO_PI * fitZ * ds / wZ;

        const wavePt = lissajousPoint(
          p, aN, aT, aZ, cycN, cycT, cycZ, lp.delta, lp.phaseZ, phaseBase,
        );

        // The first layer never dips below its set height, and each later
        // point stays a thin bead above the same sample on the layer below,
        // so the Z wave can't drive the nozzle into the bed or the part.
        const si = reverse ? n - 1 - i : i;
        const floor = below
          ? below[si] + params.layerHeight * MIN_LAYER_GAP
          : z;
        wavePt.zOffset = Math.max(wavePt.zOffset, floor - z);
        pathZ[si] = z + wavePt.zOffset;

        return applyTransformSVG(
          wavePt,
          centre, lp.centerX, lp.centerY,
          lp.scaleX,  lp.scaleY, lp.rotation,
          sf, params.flipY,
        );
      });

      if (params.closePath && result.length > 1) {
        const a = result[0], b = result[result.length - 1];
        if (Math.hypot(a.x - b.x, a.y - b.y) > 0.001) {
          result.push({ ...a });
          flatIdx++;
        }
      }

      return result;
    });

    layers.push({ index: li, z, paths: pathPoints, closed });
    prevZ = layerZ;
  }

  return layers;
}

// ── Coordinate conversion ────────────────────────────────────────────────────
// Scale-around-center is handled inside generateWaveLayers, so svgToMM is a
// pure SVG→mm projection: the part's centre (partCentreSVG) goes to
// (originX, originY), then scaleFactor and an optional Y-flip.

export function svgToMM(
  pt: { x: number; y: number },
  scaleFactor: number,
  originX: number,
  originY: number,
  flipY: boolean,
  centre: { x: number; y: number },  // SVG units
): { x: number; y: number } {
  const x = (pt.x - centre.x) * scaleFactor + originX;
  const y = (flipY ? centre.y - pt.y : pt.y - centre.y) * scaleFactor + originY;
  return { x, y };
}

// ── Lissajous preview figure ─────────────────────────────────────────────────

export function computeLissajousFigure(
  lissAmpN: number,
  lissAmpT: number,
  lissWlN: number,
  lissWlT: number,
  lissDelta: number,
  totalArc: number,
  numPoints = 600,
): Array<{ t: number; n: number }> {
  const pts: Array<{ t: number; n: number }> = [];
  for (let i = 0; i <= numPoints; i++) {
    const s = (i / numPoints) * totalArc;
    const phaseN = TWO_PI * (s / lissWlN) + lissDelta;
    const phaseT = TWO_PI * (s / lissWlT);
    pts.push({
      n: lissAmpN * Math.sin(phaseN),
      t: lissAmpT * Math.sin(phaseT),
    });
  }
  return pts;
}
