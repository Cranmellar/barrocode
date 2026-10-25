/**
 * Shared z-hop geometry utilities.
 * Used by both gcodeGenerator (for G-code output) and Preview2D (for 3D
 * visualisation).  Keeping them in one place ensures the visual preview
 * and the exported G-code always agree.
 */

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
 * Returns s ∈ (0,1) on CD if they properly cross, null otherwise.
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
  if (t > 0.01 && t < 0.99 && s > 0.01 && s < 0.99) return s;
  return null;
}

/**
 * Find arc positions (mm along the path) where the path crosses itself.
 * Uses a spatial grid to reduce the search from O(n²) to O(n) average.
 * Logs a warning (non-silent) when the path is unusually dense.
 *
 * cellSize — grid cell side length in mm; coarser = faster but more
 * false-positive pairs to test.  Caller should pass max(hopRadius*3, 2).
 */
const WARN_PTS = 3000;

export function findCrossings(arcPath: ArcPt[], cellSize = 3): number[] {
  const n = arcPath.length;
  if (n < 3) return [];

  if (n > WARN_PTS) {
    console.warn(`[hopUtils] findCrossings: path has ${n} points — crossing detection may be slow`);
  }

  // ── Build spatial grid ──────────────────────────────────────────────────
  // Each cell maps to a list of segment start indices.
  const grid = new Map<string, number[]>();

  function cellKey(gx: number, gy: number) { return `${gx},${gy}`; }

  function cellsForSegment(i: number): Array<[number, number]> {
    const ax = arcPath[i].x,     ay = arcPath[i].y;
    const bx = arcPath[i + 1].x, by = arcPath[i + 1].y;
    const minGx = Math.floor(Math.min(ax, bx) / cellSize);
    const maxGx = Math.floor(Math.max(ax, bx) / cellSize);
    const minGy = Math.floor(Math.min(ay, by) / cellSize);
    const maxGy = Math.floor(Math.max(ay, by) / cellSize);
    const cells: Array<[number, number]> = [];
    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gy = minGy; gy <= maxGy; gy++) {
        cells.push([gx, gy]);
      }
    }
    return cells;
  }

  for (let i = 0; i < n - 1; i++) {
    for (const [gx, gy] of cellsForSegment(i)) {
      const key = cellKey(gx, gy);
      const bucket = grid.get(key);
      if (bucket) bucket.push(i);
      else grid.set(key, [i]);
    }
  }

  // ── Test candidate pairs from shared cells ──────────────────────────────
  const tested = new Set<number>(); // encoded pair to avoid duplicates
  const crossings: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    for (const [gx, gy] of cellsForSegment(i)) {
      const bucket = grid.get(cellKey(gx, gy));
      if (!bucket) continue;
      for (const j of bucket) {
        if (j <= i + 1) continue;                         // adjacent or earlier
        if (i === 0 && j === n - 2) continue;             // shared endpoint
        const pairKey = i * n + j;
        if (tested.has(pairKey)) continue;
        tested.add(pairKey);

        const s = segSegIntersect(
          arcPath[i].x,     arcPath[i].y,     arcPath[i + 1].x, arcPath[i + 1].y,
          arcPath[j].x,     arcPath[j].y,     arcPath[j + 1].x, arcPath[j + 1].y,
        );
        if (s !== null) {
          // Hop on the later pass (j > i): that is where the nozzle meets
          // the bead already deposited by segment i.
          const crossArc = arcPath[j].arc + s * (arcPath[j + 1].arc - arcPath[j].arc);
          crossings.push(crossArc);
        }
      }
    }
  }

  return crossings;
}

/**
 * Parabolic z-hop contribution at `arc` given the list of crossing arcs.
 * hopRadius — arc distance on each side of a crossing where the lift applies.
 */
export function hopAtArc(
  arc: number,
  crossings: number[],
  zHopHeight: number,
  hopRadius: number,
): number {
  if (zHopHeight <= 0 || hopRadius <= 0 || crossings.length === 0) return 0;
  let hop = 0;
  for (const crossArc of crossings) {
    const d = Math.abs(arc - crossArc);
    if (d < hopRadius) {
      hop = Math.max(hop, zHopHeight * (1 - (d / hopRadius) ** 2));
    }
  }
  return hop;
}
