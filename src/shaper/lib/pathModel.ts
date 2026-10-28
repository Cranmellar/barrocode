import type { Pt } from './families';

/**
 * One anchor of a closed cubic path, with its two handles as absolute
 * positions; mm, y up. A handle sitting on its anchor makes that side
 * straight, and a segment with both of its handles retracted is a line.
 * Node 0 is the seam.
 */
export interface PathNode {
  x: number;
  y: number;
  inX: number;
  inY: number;
  outX: number;
  outY: number;
  /** Moving one handle swings the other to stay in line. */
  smooth: boolean;
}

const at = <T>(a: T[], i: number) => a[(i % a.length + a.length) % a.length];
const idx = (n: number, i: number) => (i % n + n) % n;

/** Whether the segment from node i to node i + 1 is a straight line. */
export function isStraight(nodes: PathNode[], i: number): boolean {
  const a = at(nodes, i), b = at(nodes, i + 1);
  return a.outX === a.x && a.outY === a.y && b.inX === b.x && b.inY === b.y;
}

function segment(nodes: PathNode[], i: number): [Pt, Pt, Pt, Pt] {
  const a = at(nodes, i), b = at(nodes, i + 1);
  return [{ x: a.x, y: a.y }, { x: a.outX, y: a.outY }, { x: b.inX, y: b.inY }, { x: b.x, y: b.y }];
}

export function bezier([p0, p1, p2, p3]: [Pt, Pt, Pt, Pt], u: number): Pt {
  const w = 1 - u;
  const a = w * w * w, b = 3 * w * w * u, c = 3 * w * u * u, d = u * u * u;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** Points along the closed path from node 0, about `stepMM` apart, no repeated end. */
export function flattenPath(nodes: PathNode[], stepMM = 0.1): Pt[] {
  const out: Pt[] = [];
  nodes.forEach((_, i) => {
    const s = segment(nodes, i);
    if (isStraight(nodes, i)) { out.push(s[0]); return; }
    // The control polygon is never shorter than the curve.
    const hull = Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y) + Math.hypot(s[2].x - s[1].x, s[2].y - s[1].y)
      + Math.hypot(s[3].x - s[2].x, s[3].y - s[2].y);
    const steps = Math.min(2000, Math.max(4, Math.ceil(hull / stepMM)));
    for (let k = 0; k < steps; k++) out.push(bezier(s, k / steps));
  });
  return out;
}

const num = (v: number) => String(+v.toFixed(3)).replace(/^-0$/, '0');

/** SVG path data (y down) with absolute M, L, C and Z. */
export function pathD(nodes: PathNode[]): string {
  const xy = (x: number, y: number) => `${num(x)} ${num(-y)}`;
  let d = `M${xy(nodes[0].x, nodes[0].y)}`;
  nodes.forEach((_, i) => {
    const b = at(nodes, i + 1);
    if (isStraight(nodes, i)) d += `L${xy(b.x, b.y)}`;
    else d += `C${xy(nodes[i].outX, nodes[i].outY)} ${xy(b.inX, b.inY)} ${xy(b.x, b.y)}`;
  });
  return d + 'Z';
}

/**
 * Reads what `pathD` writes: one closed subpath of absolute M, L and C,
 * ending in Z, where the last segment returns to the first point.
 */
export function parsePathD(d: string): PathNode[] {
  const tokens = d.match(/[MLCZ]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/gi) ?? [];
  const nodes: PathNode[] = [];
  let i = 0;
  const n = () => Number(tokens[i++]);
  const pt = () => { const x = n(); return { x, y: -n() }; };
  while (i < tokens.length) {
    const cmd = tokens[i++].toUpperCase();
    if (cmd === 'M' || cmd === 'L') {
      const p = pt();
      nodes.push({ x: p.x, y: p.y, inX: p.x, inY: p.y, outX: p.x, outY: p.y, smooth: false });
    } else if (cmd === 'C') {
      const c1 = pt(), c2 = pt(), p = pt();
      const prev = nodes[nodes.length - 1];
      prev.outX = c1.x; prev.outY = c1.y;
      nodes.push({ x: p.x, y: p.y, inX: c2.x, inY: c2.y, outX: p.x, outY: p.y, smooth: false });
    }
  }
  // The closing segment ends on the first point: fold it into node 0.
  const first = nodes[0], last = nodes[nodes.length - 1];
  if (nodes.length > 1 && Math.hypot(last.x - first.x, last.y - first.y) < 1e-6) {
    first.inX = last.inX; first.inY = last.inY;
    nodes.pop();
  }
  return nodes.map(markSmooth);
}

function markSmooth(p: PathNode): PathNode {
  const ix = p.x - p.inX, iy = p.y - p.inY, ox = p.outX - p.x, oy = p.outY - p.y;
  const li = Math.hypot(ix, iy), lo = Math.hypot(ox, oy);
  const smooth = li > 1e-9 && lo > 1e-9 && (ix * ox + iy * oy) / (li * lo) > Math.cos((2 * Math.PI) / 180);
  return { ...p, smooth };
}

export function moveAnchor(nodes: PathNode[], i: number, x: number, y: number): PathNode[] {
  const p = nodes[i], dx = x - p.x, dy = y - p.y;
  const next = nodes.slice();
  next[i] = { ...p, x, y, inX: p.inX + dx, inY: p.inY + dy, outX: p.outX + dx, outY: p.outY + dy };
  return next;
}

export function moveHandle(nodes: PathNode[], i: number, side: 'in' | 'out', x: number, y: number): PathNode[] {
  const p = nodes[i];
  const q = side === 'in' ? { ...p, inX: x, inY: y } : { ...p, outX: x, outY: y };
  if (p.smooth) {
    // Swing the other handle onto the line through the anchor, keeping its length.
    const [ox, oy] = side === 'in' ? [p.outX, p.outY] : [p.inX, p.inY];
    const len = Math.hypot(ox - p.x, oy - p.y);
    const dx = p.x - x, dy = p.y - y, dl = Math.hypot(dx, dy);
    if (dl > 1e-9) {
      const fx = p.x + (dx / dl) * len, fy = p.y + (dy / dl) * len;
      if (side === 'in') { q.outX = fx; q.outY = fy; } else { q.inX = fx; q.inY = fy; }
    }
  }
  const next = nodes.slice();
  next[i] = q;
  return next;
}

/** Makes node i smooth (handles in line, each keeping its length) or a corner. */
export function setSmooth(nodes: PathNode[], i: number, smooth: boolean): PathNode[] {
  const p = nodes[i];
  const next = nodes.slice();
  if (!smooth) { next[i] = { ...p, smooth }; return next; }
  let ox = p.outX - p.x, oy = p.outY - p.y, ix = p.x - p.inX, iy = p.y - p.inY;
  const lo = Math.hypot(ox, oy), li = Math.hypot(ix, iy);
  // Both handles follow the mean direction; a retracted one gets a third of its neighbour's chord.
  const a = at(nodes, i - 1), b = at(nodes, i + 1);
  if (lo < 1e-9) { ox = b.x - a.x; oy = b.y - a.y; }
  if (li < 1e-9) { ix = b.x - a.x; iy = b.y - a.y; }
  let dx = ox / (Math.hypot(ox, oy) || 1) + ix / (Math.hypot(ix, iy) || 1);
  let dy = oy / (Math.hypot(ox, oy) || 1) + iy / (Math.hypot(ix, iy) || 1);
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl; dy /= dl;
  const lenOut = lo > 1e-9 ? lo : Math.hypot(b.x - p.x, b.y - p.y) / 3;
  const lenIn = li > 1e-9 ? li : Math.hypot(p.x - a.x, p.y - a.y) / 3;
  next[i] = { ...p, smooth, outX: p.x + dx * lenOut, outY: p.y + dy * lenOut, inX: p.x - dx * lenIn, inY: p.y - dy * lenIn };
  return next;
}

/** Turns the segment from node i to i + 1 into a line, or into a curve with handles at its thirds. */
export function setStraight(nodes: PathNode[], i: number, straight: boolean): PathNode[] {
  const j = idx(nodes.length, i + 1);
  const a = nodes[i], b = nodes[j];
  const next = nodes.slice();
  if (straight) {
    next[i] = { ...a, outX: a.x, outY: a.y, smooth: false };
    next[j] = { ...b, inX: b.x, inY: b.y, smooth: false };
  } else {
    next[i] = { ...a, outX: a.x + (b.x - a.x) / 3, outY: a.y + (b.y - a.y) / 3 };
    next[j] = { ...next[j], inX: b.x - (b.x - a.x) / 3, inY: b.y - (b.y - a.y) / 3 };
  }
  return next;
}

/** Splits the segment from node i at u (de Casteljau), without changing the shape. */
export function splitSegment(nodes: PathNode[], i: number, u: number): PathNode[] {
  const j = idx(nodes.length, i + 1);
  const [p0, p1, p2, p3] = segment(nodes, i);
  const lerp = (a: Pt, b: Pt) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  const a = lerp(p0, p1), b = lerp(p1, p2), c = lerp(p2, p3);
  const d = lerp(a, b), e = lerp(b, c), m = lerp(d, e);
  const straight = isStraight(nodes, i);
  const next = nodes.slice();
  next[i] = { ...nodes[i], outX: a.x, outY: a.y };
  next[j] = { ...next[j], inX: c.x, inY: c.y };
  const mid: PathNode = straight
    ? { x: m.x, y: m.y, inX: m.x, inY: m.y, outX: m.x, outY: m.y, smooth: false }
    : { x: m.x, y: m.y, inX: d.x, inY: d.y, outX: e.x, outY: e.y, smooth: true };
  next.splice(i + 1, 0, mid);
  return next;
}

export function deleteNode(nodes: PathNode[], i: number): PathNode[] {
  return nodes.filter((_, k) => k !== i);
}

/** Runs the other way round from the same seam. */
export function reverseNodes(nodes: PathNode[]): PathNode[] {
  return [nodes[0], ...nodes.slice(1).reverse()].map(p =>
    ({ ...p, inX: p.outX, inY: p.outY, outX: p.inX, outY: p.inY }));
}

/** Makes node i the seam. */
export function rotateStart(nodes: PathNode[], i: number): PathNode[] {
  return [...nodes.slice(i), ...nodes.slice(0, i)];
}

export function mapNodes(nodes: PathNode[], f: (p: Pt) => Pt): PathNode[] {
  return nodes.map(p => {
    const a = f({ x: p.x, y: p.y }), h1 = f({ x: p.inX, y: p.inY }), h2 = f({ x: p.outX, y: p.outY });
    return { x: a.x, y: a.y, inX: h1.x, inY: h1.y, outX: h2.x, outY: h2.y, smooth: p.smooth };
  });
}

export function rotatePt(p: Pt, angle: number): Pt {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** The closest point of the path to p: segment index, parameter and distance. */
export function nearestOnPath(nodes: PathNode[], p: Pt): { seg: number; u: number; dist: number } {
  let best = { seg: 0, u: 0, dist: Infinity };
  nodes.forEach((_, i) => {
    const s = segment(nodes, i);
    for (let k = 0; k <= 64; k++) {
      const q = bezier(s, k / 64);
      const dist = Math.hypot(q.x - p.x, q.y - p.y);
      if (dist < best.dist) best = { seg: i, u: k / 64, dist };
    }
  });
  // Refine around the coarse hit.
  const s = segment(nodes, best.seg);
  for (let h = 1 / 128; h > 1e-6; h /= 2) {
    for (const u of [best.u - h, best.u + h]) {
      if (u <= 0 || u >= 1) continue;
      const q = bezier(s, u);
      const dist = Math.hypot(q.x - p.x, q.y - p.y);
      if (dist < best.dist) best = { ...best, u, dist };
    }
  }
  return best;
}

// ── Radial symmetry ─────────────────────────────────────────────────────────
// A path with symmetry N has N·m nodes, and node i + m is node i turned by
// one Nth of a turn about (0, 0), in the path's own direction.

/** Angle from a node to its copy one sector on: ±2π/N, by which way the path runs. */
function sectorAngle(nodes: PathNode[], order: number): number {
  const m = nodes.length / order;
  const a = nodes[0], b = nodes[m % nodes.length];
  const plus = rotatePt(a, (2 * Math.PI) / order), minus = rotatePt(a, (-2 * Math.PI) / order);
  return Math.hypot(plus.x - b.x, plus.y - b.y) <= Math.hypot(minus.x - b.x, minus.y - b.y)
    ? (2 * Math.PI) / order : (-2 * Math.PI) / order;
}

export function canBeSymmetric(nodes: PathNode[], order: number): boolean {
  return order > 1 && nodes.length % order === 0;
}

/** Copies node i's new state onto its copies in every other sector. */
export function propagate(nodes: PathNode[], i: number, order: number): PathNode[] {
  const n = nodes.length, m = n / order, alpha = sectorAngle(nodes, order);
  const next = nodes.slice();
  const src = nodes[i];
  for (let k = 1; k < order; k++) {
    const [copy] = mapNodes([src], p => rotatePt(p, k * alpha));
    next[idx(n, i + k * m)] = copy;
  }
  return next;
}

/** Splits segment i and its copies at the same u, so every sector keeps the same nodes. */
export function splitSymmetric(nodes: PathNode[], i: number, u: number, order: number): PathNode[] {
  const m = nodes.length / order;
  const segs = Array.from({ length: order }, (_, k) => idx(nodes.length, i + k * m)).sort((a, b) => b - a);
  return segs.reduce((acc, s) => splitSegment(acc, s, u), nodes);
}

export function deleteSymmetric(nodes: PathNode[], i: number, order: number): PathNode[] {
  const m = nodes.length / order;
  const gone = new Set(Array.from({ length: order }, (_, k) => idx(nodes.length, i + k * m)));
  return nodes.filter((_, k) => !gone.has(k));
}

/** Indices of node i's copies, i included. */
export function copiesOf(n: number, i: number, order: number): number[] {
  const m = n / order;
  return Array.from({ length: order }, (_, k) => idx(n, i + k * m));
}
