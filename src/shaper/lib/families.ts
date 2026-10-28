// Each family returns a closed outline around (0, 0), counter-clockwise in
// y-up coordinates, with no repeated end point. Size, rotation and seam are
// applied afterwards (shape.ts), so the families only care about form.

export interface Pt { x: number; y: number }

// Samples of the angle for the polar families; resampling by arc length
// later evens them out.
const POLAR_SAMPLES = 4096;
// Fillet arcs get a sample every half degree, fine enough that measuring the
// outline at its own spacing sees a circle and not the chords.
const ARC_STEP = (0.5 * Math.PI) / 180;

function polar(r: (phi: number) => number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < POLAR_SAMPLES; i++) {
    const phi = (2 * Math.PI * i) / POLAR_SAMPLES;
    const rho = r(phi);
    pts.push({ x: rho * Math.cos(phi), y: rho * Math.sin(phi) });
  }
  return pts;
}

/**
 * Gielis' superformula with a = b = 1. |cos| and |sin| repeat every π, so
 * with an odd m the curve only meets itself after 2π when n2 = n3; n3 is
 * forced to n2 then (`superformulaN3`).
 */
export function superformula(m: number, n1: number, n2: number, n3: number): Pt[] {
  const n3c = superformulaN3(m, n2, n3);
  return polar(phi => {
    const x = (m * phi) / 4;
    return Math.pow(Math.abs(Math.cos(x)) ** n2 + Math.abs(Math.sin(x)) ** n3c, -1 / n1);
  });
}

export function superformulaN3(m: number, n2: number, n3: number): number {
  return m % 2 === 1 ? n2 : n3;
}

/**
 * `count` lobes; `depth` (0–1) is how far the valleys sink below the crests.
 * `sharp` 1 is a sine; above 1 the lobes narrow into petals, below 1 the
 * valleys pinch into cusps.
 */
export function lobes(count: number, depth: number, sharp: number): Pt[] {
  return polar(phi => 1 - depth * (1 - ((1 + Math.cos(count * phi)) / 2) ** sharp));
}

/**
 * Regular polygon (`star` = 0) or star (`star` 0–1: inner vertices at
 * (1 − star) of the outer radius), circumradius `radius`, every corner
 * filleted with `fillet` (same units), shrunk where an edge is too short.
 */
export function polygon(sides: number, star: number, radius: number, fillet: number): Pt[] {
  const verts: Pt[] = [];
  const n = star > 0 ? sides * 2 : sides;
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    const r = star > 0 && i % 2 === 1 ? radius * (1 - star) : radius;
    verts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }

  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const v = verts[i];
    const p = verts[(i + n - 1) % n];
    const q = verts[(i + 1) % n];
    const lp = Math.hypot(p.x - v.x, p.y - v.y);
    const lq = Math.hypot(q.x - v.x, q.y - v.y);
    const u1 = { x: (p.x - v.x) / lp, y: (p.y - v.y) / lp };
    const u2 = { x: (q.x - v.x) / lq, y: (q.y - v.y) / lq };
    const half = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y))) / 2;
    // Each edge gives at most half its length to each of its two fillets.
    const t = Math.min(fillet / Math.tan(half), lp / 2, lq / 2);
    const rho = t * Math.tan(half);
    if (rho < 1e-9) { pts.push(v); continue; }

    const bx = u1.x + u2.x, by = u1.y + u2.y;
    const bl = Math.hypot(bx, by);
    const c = { x: v.x + (bx / bl) * (rho / Math.sin(half)), y: v.y + (by / bl) * (rho / Math.sin(half)) };
    const a1 = Math.atan2(v.y + u1.y * t - c.y, v.x + u1.x * t - c.x);
    const a2 = Math.atan2(v.y + u2.y * t - c.y, v.x + u2.x * t - c.x);
    let sweep = a2 - a1;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep <= -Math.PI) sweep += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(Math.abs(sweep) / ARC_STEP));
    for (let s = 0; s <= steps; s++) {
      const a = a1 + (sweep * s) / steps;
      pts.push({ x: c.x + rho * Math.cos(a), y: c.y + rho * Math.sin(a) });
    }
  }
  return pts;
}
