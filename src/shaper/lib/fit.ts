import type { Pt } from './families';
import { superformulaN3 } from './families';
import { flattenPath, mapNodes, rotatePt, setStraight, type PathNode } from './pathModel';
import type { ShapeDoc } from './shape';

// A corner: the outline turns more than this within CORNER_SPAN mm either side.
const CORNER_TURN = (30 * Math.PI) / 180;
const CORNER_SPAN = 0.5;
// Handles that differ by less than this make a smooth node.
const SMOOTH_TURN = (10 * Math.PI) / 180;
// Mm either side of a node where its tangent is read.
const TANGENT_SPAN = 0.5;
// An edge this close to a line through two of its points counts as straight.
const STRAIGHT_MM = 0.01;
// Deep enough for a long imported contour with no fixed node for hundreds of mm.
const MAX_DEPTH = 12;

/** How many times the family's outline repeats around its centre. */
export function familySymmetry(doc: ShapeDoc): number {
  switch (doc.family) {
    case 'lobes': return doc.lobeCount;
    case 'polygon': return doc.polySides;
    case 'superformula': {
      if (doc.sfM === 0) return 1;
      // |cos|^n2 + |sin|^n3 repeats every π of mφ/4, or every π/2 when n2 = n3.
      const even = doc.sfN2 === superformulaN3(doc.sfM, doc.sfN2, doc.sfN3);
      return even ? doc.sfM : doc.sfM % 2 === 0 ? doc.sfM / 2 : doc.sfM;
    }
  }
}

class Loop {
  readonly cum: number[];
  readonly length: number;
  constructor(readonly pts: Pt[]) {
    const n = pts.length;
    this.cum = [0];
    for (let i = 1; i <= n; i++) {
      const a = pts[i - 1], b = pts[i % n];
      this.cum.push(this.cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    this.length = this.cum[n];
  }
  at(s: number): Pt {
    const L = this.length, n = this.pts.length;
    s = ((s % L) + L) % L;
    let lo = 0, hi = n;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (this.cum[mid] <= s) lo = mid; else hi = mid; }
    const a = this.pts[lo], b = this.pts[(lo + 1) % n];
    const f = (s - this.cum[lo]) / (this.cum[lo + 1] - this.cum[lo] || 1);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }
  /** Unit direction from s − h to s (side −1) or from s to s + h (side +1). */
  dir(s: number, side: 1 | -1, h = TANGENT_SPAN): Pt {
    const a = this.at(side > 0 ? s : s - h), b = this.at(side > 0 ? s + h : s);
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  }
}

const angleBetween = (u: Pt, v: Pt) => Math.abs(Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y));

/** Node at arc position s, its handles a third of the arc to its neighbours along the outline. */
function nodeAt(loop: Loop, s: number, before: number, after: number): PathNode {
  const p = loop.at(s);
  let tin = loop.dir(s, -1), tout = loop.dir(s, 1);
  const smooth = angleBetween(tin, tout) < SMOOTH_TURN;
  if (smooth) {
    const x = tin.x + tout.x, y = tin.y + tout.y, l = Math.hypot(x, y) || 1;
    tin = tout = { x: x / l, y: y / l };
  }
  return {
    x: p.x, y: p.y,
    inX: p.x - (tin.x * before) / 3, inY: p.y - (tin.y * before) / 3,
    outX: p.x + (tout.x * after) / 3, outY: p.y + (tout.y * after) / 3,
    smooth,
  };
}

/**
 * A corner between straight edges: its tangents are read a little before and
 * after the corner, and the node sits where those two lines meet. Samples
 * rarely fall on the corner itself, and a tangent read across it would bend
 * the whole edge. A corner between curves (a cusp) keeps the plain node.
 */
function cornerAt(loop: Loop, s: number, before: number, after: number): PathNode {
  const d = Math.min(1, Math.max(before, after) / 4);
  const a1 = loop.at(s - 2 * d), a2 = loop.at(s - d), b1 = loop.at(s + d), b2 = loop.at(s + 2 * d);
  const unit = (p: Pt, q: Pt) => { const l = Math.hypot(q.x - p.x, q.y - p.y) || 1; return { x: (q.x - p.x) / l, y: (q.y - p.y) / l }; };
  const tin = unit(a1, a2), tout = unit(b1, b2);
  const offLine = (o: Pt, q: Pt, t: Pt) => Math.abs((q.x - o.x) * t.y - (q.y - o.y) * t.x);
  const cross = tin.x * tout.y - tin.y * tout.x;
  const straight = offLine(a1, loop.at(s - 3 * d), tin) < STRAIGHT_MM && offLine(b1, loop.at(s + 3 * d), tout) < STRAIGHT_MM;
  if (!straight || Math.abs(cross) < 1e-6) return { ...nodeAt(loop, s, before, after), smooth: false };
  const t = ((b1.x - a2.x) * tout.y - (b1.y - a2.y) * tout.x) / cross;
  const p = { x: a2.x + tin.x * t, y: a2.y + tin.y * t };
  return {
    x: p.x, y: p.y,
    inX: p.x - (tin.x * before) / 3, inY: p.y - (tin.y * before) / 3,
    outX: p.x + (tout.x * after) / 3, outY: p.y + (tout.y * after) / 3,
    smooth: false,
  };
}

/** Largest distance from the outline between arcs s0 and s1 to the cubic path given, and where. */
function deviation(loop: Loop, s0: number, s1: number, curve: Pt[]): { dist: number; s: number } {
  let worst = 0, where = (s0 + s1) / 2;
  const steps = Math.max(4, Math.ceil((s1 - s0) / 0.25));
  for (let k = 0; k <= steps; k++) {
    const p = loop.at(s0 + ((s1 - s0) * k) / steps);
    let best = Infinity;
    for (let j = 0; j < curve.length - 1; j++) {
      const a = curve[j], b = curve[j + 1];
      const ex = b.x - a.x, ey = b.y - a.y, ll = ex * ex + ey * ey;
      const t = ll > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / ll)) : 0;
      best = Math.min(best, Math.hypot(a.x + ex * t - p.x, a.y + ey * t - p.y));
    }
    if (best > worst) { worst = best; where = s0 + ((s1 - s0) * k) / steps; }
  }
  return { dist: worst, s: where };
}

function sampleCubic(a: PathNode, b: PathNode): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k <= 32; k++) {
    const u = k / 32, w = 1 - u;
    const c0 = w * w * w, c1 = 3 * w * w * u, c2 = 3 * w * u * u, c3 = u * u * u;
    out.push({ x: c0 * a.x + c1 * a.outX + c2 * b.inX + c3 * b.x, y: c0 * a.y + c1 * a.outY + c2 * b.inY + c3 * b.y });
  }
  return out;
}

/** Arc positions in [0, sector) where the outline turns sharply. */
function corners(loop: Loop, sector: number): number[] {
  // Finer than the window, or a corner between two coarse samples slips through.
  const step = Math.min(loop.length / loop.pts.length, CORNER_SPAN / 2);
  const out: number[] = [];
  let run: { s: number; turn: number } | null = null;
  for (let s = 0; s < sector; s += step) {
    const turn = angleBetween(loop.dir(s, -1, CORNER_SPAN), loop.dir(s, 1, CORNER_SPAN));
    if (turn > CORNER_TURN) {
      if (!run || turn > run.turn) run = { s, turn };
    } else if (run) {
      out.push(run.s);
      run = null;
    }
  }
  if (run) out.push(run.s);
  return out;
}

/** Arc positions in [0, sector) farthest from and nearest to the centre. */
function extremes(loop: Loop, sector: number): number[] {
  const step = loop.length / loop.pts.length;
  let far = { s: 0, r: -Infinity }, near = { s: 0, r: Infinity };
  for (let s = 0; s < sector; s += step) {
    const p = loop.at(s), r = Math.hypot(p.x, p.y);
    if (r > far.r) far = { s, r };
    if (r < near.r) near = { s, r };
  }
  return [far.s, near.s];
}

/**
 * A few editable nodes that follow the outline (shapePoints, from the seam)
 * within `tolMM`. With `order` > 1 the outline repeats that many times; one
 * sector is fitted and turned into the others, so the nodes are exactly
 * symmetric and editing one can move its copies.
 */
export function fitOutline(outline: Pt[], order: number, tolMM = 0.2): { nodes: PathNode[]; order: number } {
  const loop = new Loop(outline);
  const sector = loop.length / order;
  const minGap = Math.min(1, sector / 8);

  // Fixed nodes: the seam (sector start), corners, and the tip and valley.
  const fixed = [0];
  const cornerArcs = new Set<number>();
  for (const s of corners(loop, sector)) {
    if (s < minGap || sector - s < minGap) cornerArcs.add(0);
    else if (fixed.every(f => Math.abs(f - s) > minGap)) { fixed.push(s); cornerArcs.add(s); }
  }
  for (const s of extremes(loop, sector)) {
    if (fixed.every(f => Math.abs(f - s) > minGap) && sector - s > minGap) fixed.push(s);
  }
  fixed.sort((a, b) => a - b);
  // The sector's end is the next sector's seam.
  const node = (s: number, before: number, after: number) =>
    cornerArcs.has(s) || (s === sector && cornerArcs.has(0)) ? cornerAt(loop, s, before, after) : nodeAt(loop, s, before, after);

  // Split each gap where its cubic strays most, until every piece is within tolerance.
  const split = (a: number, b: number, depth: number): number[] => {
    const dev = deviation(loop, a, b, sampleCubic(node(a, 0, b - a), node(b, b - a, 0)));
    if (dev.dist <= tolMM || depth >= MAX_DEPTH) return [a];
    const m = Math.min(b - (b - a) * 0.2, Math.max(a + (b - a) * 0.2, dev.s));
    return [...split(a, m, depth + 1), ...split(m, b, depth + 1)];
  };
  const arcs: number[] = [];
  for (let g = 0; g < fixed.length; g++) {
    const s0 = fixed[g], s1 = g + 1 < fixed.length ? fixed[g + 1] : sector;
    // A lone circle still needs a few nodes to hold its shape.
    if (order === 1 && fixed.length === 1) {
      for (let q = 0; q < 4; q++) arcs.push(...split(s0 + (sector * q) / 4, s0 + (sector * (q + 1)) / 4, 0));
    } else {
      arcs.push(...split(s0, s1, 0));
    }
  }

  const sectorNodes = arcs.map((s, k) => {
    const prev = k > 0 ? arcs[k - 1] : arcs[arcs.length - 1] - sector;
    const next = k + 1 < arcs.length ? arcs[k + 1] : sector;
    return node(s, s - prev, next - s);
  });
  // Turn sector 0 into the others, the way the outline runs.
  const p0 = loop.at(0), p1 = loop.at(sector);
  const plus = rotatePt(p0, (2 * Math.PI) / order);
  const alpha = (Math.hypot(plus.x - p1.x, plus.y - p1.y) < Math.hypot(p0.x - p1.x, p0.y - p1.y) || order === 1 ? 1 : -1)
    * (2 * Math.PI) / order;
  let nodes = Array.from({ length: order }, (_, k) => mapNodes(sectorNodes, p => rotatePt(p, k * alpha))).flat();
  // Edges that are straight on the outline become lines, which read and edit as such.
  nodes.forEach((_, i) => { if (onChord(nodes, i)) nodes = setStraight(nodes, i, true); });

  // A family that is less symmetric than expected: fit the whole loop instead.
  if (order > 1 && maxDeviation(outline, nodes) > 2 * tolMM) return fitOutline(outline, 1, tolMM);
  return { nodes, order };
}

/** Whether segment i's handles both lie on its chord, between its ends. */
function onChord(nodes: PathNode[], i: number): boolean {
  const a = nodes[i], b = nodes[(i + 1) % nodes.length];
  const ex = b.x - a.x, ey = b.y - a.y, l = Math.hypot(ex, ey);
  if (l < 1e-9) return false;
  const off = (x: number, y: number) => {
    const t = ((x - a.x) * ex + (y - a.y) * ey) / (l * l);
    return t >= 0 && t <= 1 && Math.abs((x - a.x) * ey - (y - a.y) * ex) / l < 0.01;
  };
  return off(a.outX, a.outY) && off(b.inX, b.inY);
}

/** Largest distance from any outline point to the path. */
export function maxDeviation(outline: Pt[], nodes: PathNode[]): number {
  // flattenPath gives a line only its start; fill it in to measure against.
  const coarse = flattenPath(nodes, 0.05);
  const path: Pt[] = [];
  coarse.forEach((a, i) => {
    const b = coarse[(i + 1) % coarse.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.05));
    for (let k = 0; k < steps; k++) path.push({ x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps });
  });
  const cell = 2;
  const grid = new Map<string, Pt[]>();
  for (const p of path) {
    const key = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
    (grid.get(key) ?? grid.set(key, []).get(key)!).push(p);
  }
  let worst = 0;
  for (const p of outline) {
    let best = Infinity;
    for (let r = 1; best === Infinity || r <= 2; r++) {
      const gx = Math.floor(p.x / cell), gy = Math.floor(p.y / cell);
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        for (const q of grid.get(`${gx + dx},${gy + dy}`) ?? []) best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y));
      }
      if (r > 50) break;
    }
    worst = Math.max(worst, best);
  }
  return worst;
}
