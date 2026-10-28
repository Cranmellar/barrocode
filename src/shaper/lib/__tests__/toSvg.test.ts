import { describe, it, expect } from 'vitest';
import { DEFAULT_SHAPE, shapePath, seamPoint } from '../shape';
import { shapeToSvg } from '../toSvg';

function cubics(d: string): number[][] {
  const nums = d.match(/-?\d*\.?\d+(?:e-?\d+)?/g)!.map(Number);
  const start = nums.slice(0, 2);
  const segs: number[][] = [];
  let p = start;
  for (let i = 2; i + 6 <= nums.length; i += 6) {
    segs.push([...p, ...nums.slice(i, i + 6)]);
    p = nums.slice(i + 4, i + 6);
  }
  return segs;
}

function bezier(s: number[], t: number): [number, number] {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
  return [a * s[0] + b * s[2] + c * s[4] + e * s[6], a * s[1] + b * s[3] + c * s[5] + e * s[7]];
}

describe('shapeToSvg', () => {
  it('states its size in mm with one user unit per mm', () => {
    const svg = shapeToSvg({ family: 'circle', sizeMM: 80 });
    expect(svg).toContain('viewBox="-40 -40 80 80"');
    expect(svg).toContain('width="80mm"');
    expect(svg).toContain('height="80mm"');
  });

  it('draws one closed contour', () => {
    const d = shapePath(DEFAULT_SHAPE);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.endsWith('Z')).toBe(true);
    const segs = cubics(d);
    expect(segs).toHaveLength(4);
    const last = segs[3];
    expect([last[6], last[7]]).toEqual([segs[0][0], segs[0][1]]);
  });

  it('stays on the circle within 0.03 mm and starts at the seam', () => {
    const doc = { family: 'circle' as const, sizeMM: 80 };
    const segs = cubics(shapePath(doc));
    expect([segs[0][0], segs[0][1]]).toEqual([seamPoint(doc).x, seamPoint(doc).y]);
    for (const s of segs) {
      for (let i = 0; i <= 20; i++) {
        const [x, y] = bezier(s, i / 20);
        expect(Math.abs(Math.hypot(x, y) - 40)).toBeLessThan(0.03);
      }
    }
  });
});
