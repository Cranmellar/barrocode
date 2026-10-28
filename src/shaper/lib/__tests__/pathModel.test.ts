import { describe, it, expect } from 'vitest';
import {
  bezier, canBeSymmetric, copiesOf, deleteNode, deleteSymmetric, flattenPath, isStraight, moveAnchor,
  moveHandle, parsePathD, pathD, propagate, reverseNodes, rotatePt, rotateStart, setSmooth, setStraight,
  splitSegment, splitSymmetric, type PathNode,
} from '../pathModel';
import { familySymmetry, fitOutline, maxDeviation } from '../fit';
import { DEFAULT_SHAPE, shapePoints, type ShapeDoc } from '../shape';

const node = (x: number, y: number, h = 0): PathNode =>
  ({ x, y, inX: x - h, inY: y, outX: x + h, outY: y, smooth: h > 0 });
const square: PathNode[] = [node(10, 0), node(0, 10), node(-10, 0), node(0, -10)];
const flower = fitOutline(shapePoints(DEFAULT_SHAPE), familySymmetry(DEFAULT_SHAPE));

const closeTo = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-9) =>
  Math.hypot(a.x - b.x, a.y - b.y) < eps;

describe('pathD and parsePathD', () => {
  it('round-trips lines and curves', () => {
    for (const nodes of [square, flower.nodes]) {
      const back = parsePathD(pathD(nodes));
      expect(back).toHaveLength(nodes.length);
      back.forEach((p, i) => {
        expect(closeTo(p, nodes[i], 2e-3)).toBe(true);
        expect(closeTo({ x: p.outX, y: p.outY }, { x: nodes[i].outX, y: nodes[i].outY }, 2e-3)).toBe(true);
        expect(closeTo({ x: p.inX, y: p.inY }, { x: nodes[i].inX, y: nodes[i].inY }, 2e-3)).toBe(true);
      });
    }
  });

  it('writes lines as L, curves as C, y down, closed', () => {
    expect(pathD(square)).toBe('M10 0L0 -10L-10 0L0 10L10 0Z');
    expect(pathD(flower.nodes)).toMatch(/^M[^MZ]*C[^MZ]*Z$/);
  });
});

describe('editing', () => {
  it('moves an anchor with its handles', () => {
    const n = moveAnchor(flower.nodes, 2, flower.nodes[2].x + 5, flower.nodes[2].y - 3);
    expect(n[2].outX - n[2].x).toBeCloseTo(flower.nodes[2].outX - flower.nodes[2].x, 9);
    expect(n[2].inY - n[2].y).toBeCloseTo(flower.nodes[2].inY - flower.nodes[2].y, 9);
    expect(n[3]).toBe(flower.nodes[3]);
  });

  it('keeps a smooth node smooth when a handle moves', () => {
    const smooth = flower.nodes.findIndex(p => p.smooth);
    const p = flower.nodes[smooth];
    const n = moveHandle(flower.nodes, smooth, 'out', p.outX + 4, p.outY + 7)[smooth];
    const cross = (n.outX - n.x) * (n.y - n.inY) - (n.outY - n.y) * (n.x - n.inX);
    expect(Math.abs(cross)).toBeLessThan(1e-9);
    expect(Math.hypot(n.inX - n.x, n.inY - n.y)).toBeCloseTo(Math.hypot(p.inX - p.x, p.inY - p.y), 9);
  });

  it('splits a line into two lines on it', () => {
    const n = splitSegment(square, 0, 0.5);
    expect(isStraight(n, 0) && isStraight(n, 1)).toBe(true);
    const m = n[1];
    expect(Math.abs((m.x - 10) * (10 - 0) - (m.y - 0) * (0 - 10))).toBeLessThan(1e-9);
  });

  it('splits a curve without changing it', () => {
    for (const nodes of [flower.nodes]) {
      const n = splitSegment(nodes, 1, 0.3);
      expect(n).toHaveLength(nodes.length + 1);
      const seg = (ns: PathNode[], i: number) => [ns[i], { x: ns[i].outX, y: ns[i].outY },
        { x: ns[(i + 1) % ns.length].inX, y: ns[(i + 1) % ns.length].inY }, ns[(i + 1) % ns.length]] as const;
      for (const u of [0, 0.1, 0.3]) {
        expect(closeTo(bezier([...seg(nodes, 1)] as never, u), bezier([...seg(n, 1)] as never, u / 0.3), 1e-9)).toBe(true);
      }
      for (const u of [0.3, 0.6, 1]) {
        expect(closeTo(bezier([...seg(nodes, 1)] as never, u), bezier([...seg(n, 2)] as never, (u - 0.3) / 0.7), 1e-9)).toBe(true);
      }
      expect(isStraight(n, 1)).toBe(isStraight(nodes, 1));
    }
  });

  it('stays closed when nodes are added or removed', () => {
    for (const n of [splitSegment(square, 3, 0.5), deleteNode(square, 0), deleteNode(flower.nodes, 5)]) {
      const d = pathD(n);
      expect(d.endsWith('Z')).toBe(true);
      expect(d.match(/M/g)).toHaveLength(1);
      expect(parsePathD(d)).toHaveLength(n.length);
    }
  });

  it('turns a segment into a line and back into a curve', () => {
    const line = setStraight(flower.nodes, 0, true);
    expect(isStraight(line, 0)).toBe(true);
    expect(isStraight(setStraight(line, 0, false), 0)).toBe(false);
    expect(pathD(setStraight(square, 0, false))).toMatch(/^M10 0C/);
  });

  it('makes a corner smooth', () => {
    const n = setSmooth(square, 0, true)[0];
    const cross = (n.outX - n.x) * (n.y - n.inY) - (n.outY - n.y) * (n.x - n.inX);
    expect(n.smooth).toBe(true);
    expect(Math.abs(cross)).toBeLessThan(1e-9);
  });

  it('reverses from the same seam, and moves the seam', () => {
    const r = reverseNodes(flower.nodes);
    expect(r[0].x).toBe(flower.nodes[0].x);
    expect(r[1].x).toBe(flower.nodes[flower.nodes.length - 1].x);
    expect(r[1].outX).toBe(flower.nodes[flower.nodes.length - 1].inX);
    expect(rotateStart(square, 2)[0]).toBe(square[2]);
  });
});

describe('symmetry', () => {
  const N = flower.order;

  it('keeps every sector a turned copy when a node moves', () => {
    expect(N).toBe(6);
    expect(canBeSymmetric(flower.nodes, N)).toBe(true);
    let n = moveAnchor(flower.nodes, 1, flower.nodes[1].x + 3, flower.nodes[1].y + 2);
    n = propagate(n, 1, N);
    const m = n.length / N;
    for (const i of copiesOf(n.length, 1, N)) {
      const k = Math.round(((i - 1 + n.length) % n.length) / m);
      const want = rotatePt(n[1], (k * 2 * Math.PI) / N);
      expect(closeTo(n[i], want, 1e-9)).toBe(true);
    }
  });

  it('adds and removes nodes in every sector', () => {
    const more = splitSymmetric(flower.nodes, 0, 0.5, N);
    expect(more).toHaveLength(flower.nodes.length + N);
    expect(canBeSymmetric(more, N)).toBe(true);
    const fewer = deleteSymmetric(more, 1, N);
    expect(fewer).toHaveLength(flower.nodes.length);
  });
});

describe('fitOutline', () => {
  const docs: [string, Partial<ShapeDoc>][] = [
    ['default flower', {}],
    ['cusped flower', { lobeCount: 7, lobeDepthPct: 40, lobeSharp: 0.4, seamAngle: 33 }],
    ['petals', { lobeCount: 5, lobeDepthPct: 50, lobeSharp: 3, clockwise: true }],
    ['hexagon, 8 mm corners', { family: 'polygon' }],
    ['sharp star', { family: 'polygon', polySides: 5, polyStarPct: 55, polyFilletMM: 0, rotation: 10 }],
    ['triangle', { family: 'polygon', polySides: 3, polyFilletMM: 3, sizeMM: 150 }],
    ['superformula', { family: 'superformula' }],
    ['superformula, odd m', { family: 'superformula', sfM: 5, sfN1: 2, sfN2: 7, sfN3: 3 }],
    ['superformula, n2 ≠ n3', { family: 'superformula', sfM: 6, sfN1: 3, sfN2: 4, sfN3: 9 }],
    ['circle', { family: 'superformula', sfM: 0 }],
  ];
  for (const [name, patch] of docs) {
    it(`follows the ${name} within 0.2 mm with few nodes`, () => {
      const doc = { ...DEFAULT_SHAPE, ...patch };
      const outline = shapePoints(doc);
      const { nodes, order } = fitOutline(outline, familySymmetry(doc));
      expect(maxDeviation(outline, nodes)).toBeLessThan(0.2);
      expect(order).toBe(familySymmetry(doc));
      expect(nodes.length / order).toBeLessThanOrEqual(12);
      expect(closeTo(nodes[0], outline[0], 1e-9)).toBe(true);
      // Same direction as the outline.
      const area = (pts: { x: number; y: number }[]) => pts.reduce((a, p, i) => {
        const q = pts[(i + 1) % pts.length];
        return a + p.x * q.y - q.x * p.y;
      }, 0);
      expect(Math.sign(area(flattenPath(nodes)))).toBe(Math.sign(area(outline)));
    });
  }
});
