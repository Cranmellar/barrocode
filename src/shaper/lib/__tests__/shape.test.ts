import { describe, it, expect } from 'vitest';
import { DEFAULT_SHAPE, shapeBounds, shapePoints, type ShapeDoc } from '../shape';
import { superformulaN3, type Pt } from '../families';
import { shapeToSvg } from '../toSvg';

const CASES: Partial<ShapeDoc>[] = [
  { family: 'lobes' },
  { family: 'lobes', lobeCount: 9, lobeDepthPct: 45, lobeSharp: 0.4 },
  { family: 'lobes', lobeCount: 3, lobeDepthPct: 60, lobeSharp: 4 },
  { family: 'polygon' },
  { family: 'polygon', polySides: 3, polyFilletMM: 0 },
  { family: 'polygon', polySides: 5, polyStarPct: 50, polyFilletMM: 4 },
  { family: 'polygon', polySides: 12, polyStarPct: 20, polyFilletMM: 40 },
  { family: 'superformula' },
  { family: 'superformula', sfM: 5, sfN1: 2, sfN2: 7, sfN3: 7 },
  { family: 'superformula', sfM: 5, sfN1: 1, sfN2: 3, sfN3: 9 },
  { family: 'superformula', sfM: 0, sfN1: 1, sfN2: 1, sfN3: 1 },
];

const docs: ShapeDoc[] = CASES.flatMap(c => [
  { ...DEFAULT_SHAPE, ...c },
  { ...DEFAULT_SHAPE, ...c, sizeMM: 137, rotation: 23, seamAngle: 200, clockwise: true },
]);

const label = (d: ShapeDoc) => `${d.family} m${d.sfM} s${d.polySides} n${d.lobeCount} Ø${d.sizeMM} ${d.clockwise ? 'cw' : 'ccw'}`;

function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

describe('shapePoints', () => {
  for (const doc of docs) {
    describe(label(doc), () => {
      const pts = shapePoints(doc);

      it('closes on itself with no step over 0.25 mm', () => {
        const steps = pts.map((p, i) => dist(p, pts[(i + 1) % pts.length]));
        expect(Math.max(...steps)).toBeLessThan(0.2502);
        expect(Math.min(...steps)).toBeGreaterThan(0);
      });

      // A sharp tip can fall between two samples, a few hundredths short.
      it('reaches the requested diameter', () => {
        const r = Math.max(...pts.map(p => Math.hypot(p.x, p.y)));
        expect(r).toBeLessThanOrEqual(doc.sizeMM / 2 + 1e-9);
        expect(r).toBeGreaterThan(doc.sizeMM / 2 - 0.05);
      });

      it('starts at the seam angle', () => {
        const a = (Math.atan2(pts[0].y, pts[0].x) * 180) / Math.PI;
        const diff = ((a - doc.seamAngle) % 360 + 540) % 360 - 180;
        expect(Math.abs(diff)).toBeLessThan(1e-6);
      });

      it('runs in the chosen direction', () => {
        expect(Math.sign(signedArea(pts))).toBe(doc.clockwise ? -1 : 1);
      });

      it('gives the same points every time', () => {
        expect(shapePoints(doc)).toEqual(pts);
      });
    });
  }

  it('makes odd symmetries close by tying n3 to n2', () => {
    expect(superformulaN3(5, 3, 9)).toBe(3);
    expect(superformulaN3(6, 3, 9)).toBe(9);
  });

  it('fillets polygon corners with the radius asked for', () => {
    const doc = { ...DEFAULT_SHAPE, family: 'polygon' as const, polySides: 6, polyFilletMM: 8, seamAngle: 0 };
    const pts = shapePoints(doc);
    // The seam sits on the corner at 0°; take a circle through points either side.
    const a = pts[pts.length - 8], b = pts[0], c = pts[8];
    const ab = dist(a, b), bc = dist(b, c), ca = dist(c, a);
    const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
    expect((ab * bc * ca) / (4 * area)).toBeCloseTo(8, 1);
  });
});

describe('shapeToSvg', () => {
  it('states its size in mm with one user unit per mm', () => {
    const doc = { ...DEFAULT_SHAPE, family: 'polygon' as const, polySides: 4, polyFilletMM: 0, rotation: 45, sizeMM: 80 };
    const b = shapeBounds(shapePoints(doc));
    const svg = shapeToSvg(doc);
    const w = svg.match(/width="([\d.]+)mm"/)![1];
    const vb = svg.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number);
    expect(Number(w)).toBeCloseTo(b.width, 3);
    expect(vb[2]).toBeCloseTo(Number(w), 9);
    expect(b.width).toBeCloseTo(80 / Math.SQRT2, 1);
  });

  it('draws one closed contour starting at the seam, y down', () => {
    const doc = { ...DEFAULT_SHAPE, seamAngle: 90 };
    const svg = shapeToSvg(doc);
    const d = svg.match(/d="([^"]+)"/)![1];
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.endsWith('Z')).toBe(true);
    const [x, y] = d.slice(1).split(/[ L]/).map(Number);
    expect(x).toBeCloseTo(0, 2);
    expect(y).toBeLessThan(0);
  });
});
