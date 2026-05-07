/**
 * Shared z-hop geometry utilities.
 * Used by both gcodeGenerator (for G-code output) and Preview2D (for 3D
 * visualisation).  Keeping them in one place ensures the visual preview
 * and the exported G-code always agree.
 */

export const HOP_RADIUS = 5; // mm — arc distance on each side of a crossing

export interface ArcPt { x: number; y: number; arc: number }

function dist2D(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(bx - ax, by - ay);
}

/** Build a cumulative arc-length path from a flat array of XY points. */
export function buildArcPath(pts: { x: number; y: number }[]): ArcPt[] {
  const out: ArcPt[] = [];
  let arc = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) arc += dist2D(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    out.push({ x: pts[i].x, y: pts[i].y, arc });
  }
  return out;
}

/**
 * Segment AB × CD intersection test.
 * Returns t ∈ (0,1) on AB if they properly cross, null otherwise.
 */
function segSegIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): number | null {
  const dxAB = bx - ax, dyAB = by - ay;
  const dxCD = dx - cx, dyCD = dy - cy;
  const denom = dxAB * dyCD - dyAB * dxCD;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((cx - ax) * dyCD - (cy - ay) * dxCD) / denom;
  const s = ((cx - ax) * dyAB - (cy - ay) * dxAB) / denom;
  if (t > 0.01 && t < 0.99 && s > 0.01 && s < 0.99) return t;
  return null;
}

/**
 * Find arc positions (mm along the path) where the path crosses itself.
 * Only checks non-adjacent segments.  Skips detection if the path has
 * more than MAX_PTS points (performance guard for dense meshes).
 */
const MAX_PTS = 600;

export function findCrossings(arcPath: ArcPt[]): number[] {
  const crossings: number[] = [];
  const n = arcPath.length;
  if (n > MAX_PTS) return crossings; // too dense — skip
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 2; j < n - 1; j++) {
      if (i === 0 && j === n - 2) continue; // shared endpoint
      const t = segSegIntersect(
        arcPath[i].x, arcPath[i].y, arcPath[i + 1].x, arcPath[i + 1].y,
        arcPath[j].x, arcPath[j].y, arcPath[j + 1].x, arcPath[j + 1].y,
      );
      if (t !== null) {
        const crossArc = arcPath[i].arc + t * (arcPath[i + 1].arc - arcPath[i].arc);
        crossings.push(crossArc);
      }
    }
  }
  return crossings;
}

/** Parabolic z-hop contribution at `arc` given the list of crossing arcs. */
export function hopAtArc(arc: number, crossings: number[], zHopHeight: number): number {
  if (zHopHeight <= 0 || crossings.length === 0) return 0;
  let hop = 0;
  for (const crossArc of crossings) {
    const d = Math.abs(arc - crossArc);
    if (d < HOP_RADIUS) {
      hop = Math.max(hop, zHopHeight * (1 - (d / HOP_RADIUS) ** 2));
    }
  }
  return hop;
}
