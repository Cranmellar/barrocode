/**
 * Z-hop geometry utilities, applied once in lib/toolpath.ts so the preview
 * and the exported G-code share the same hops.
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
 * Find arc positions (mm along the path) where the path crosses itself,
 * sorted ascending. Uses a spatial grid to reduce the search from O(n²) to
 * O(n) average. Logs a warning (non-silent) when the path is unusually dense.
 *
 * cellSize — grid cell side length in mm; coarser = faster but more
 * false-positive pairs to test.  Caller should pass max(hopRadius*3, 2).
 * gaps — start indices of segments that are travel between paths, not
 * deposited bead; they never cross anything.
 */
const WARN_PTS = 3000;

export function findCrossings(
  arcPath: ArcPt[],
  cellSize = 3,
  gaps: ReadonlySet<number> = new Set(),
): number[] {
  const n = arcPath.length;
  if (n < 3) return [];

  if (n > WARN_PTS) {
    console.warn(`[hopUtils] findCrossings: path has ${n} points — crossing detection may be slow`);
  }

  // Cell range of every segment, computed once and reused by both passes.
  const segCells = new Int32Array(4 * (n - 1));
  let minGx = Infinity, minGy = Infinity, maxGy = -Infinity;
  for (let i = 0; i < n - 1; i++) {
    const a = arcPath[i], b = arcPath[i + 1];
    const x0 = Math.floor(Math.min(a.x, b.x) / cellSize);
    const x1 = Math.floor(Math.max(a.x, b.x) / cellSize);
    const y0 = Math.floor(Math.min(a.y, b.y) / cellSize);
    const y1 = Math.floor(Math.max(a.y, b.y) / cellSize);
    segCells.set([x0, x1, y0, y1], 4 * i);
    if (x0 < minGx) minGx = x0;
    if (y0 < minGy) minGy = y0;
    if (y1 > maxGy) maxGy = y1;
  }
  // Integer cell keys: string keys dominated the cost of this function.
  const rows = maxGy - minGy + 1;
  const cellKey = (gx: number, gy: number) => (gx - minGx) * rows + (gy - minGy);

  // ── Build spatial grid ──────────────────────────────────────────────────
  // Each cell maps to a list of segment start indices, ascending.
  const grid = new Map<number, number[]>();
  for (let i = 0; i < n - 1; i++) {
    if (gaps.has(i)) continue;
    const c = 4 * i;
    for (let gx = segCells[c]; gx <= segCells[c + 1]; gx++) {
      for (let gy = segCells[c + 2]; gy <= segCells[c + 3]; gy++) {
        const key = cellKey(gx, gy);
        const bucket = grid.get(key);
        if (bucket) bucket.push(i);
        else grid.set(key, [i]);
      }
    }
  }

  // ── Test candidate pairs from shared cells ──────────────────────────────
  // testedWith[j] === i marks pair (i, j) as tested when they share several cells.
  const testedWith = new Int32Array(n).fill(-1);
  const crossings: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    if (gaps.has(i)) continue;
    const c = 4 * i;
    for (let gx = segCells[c]; gx <= segCells[c + 1]; gx++) {
      for (let gy = segCells[c + 2]; gy <= segCells[c + 3]; gy++) {
        const bucket = grid.get(cellKey(gx, gy));
        if (!bucket) continue;
        for (const j of bucket) {
          if (j <= i + 1) continue;                         // adjacent or earlier
          if (i === 0 && j === n - 2) continue;             // shared endpoint
          if (testedWith[j] === i) continue;
          testedWith[j] = i;

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
  }

  return crossings.sort((a, b) => a - b);
}

// Index range [start, end) of the sorted crossings that may lie within
// (lo, hi). The range is padded so rounding never drops one; callers keep
// their exact distance test.
function crossingRange(sorted: number[], lo: number, hi: number): [number, number] {
  const pad = 1e-9 * (1 + Math.abs(lo) + Math.abs(hi));
  const firstAbove = (v: number) => {
    let a = 0, b = sorted.length;
    while (a < b) {
      const mid = (a + b) >> 1;
      if (sorted[mid] > v) b = mid; else a = mid + 1;
    }
    return a;
  };
  return [firstAbove(lo - pad), firstAbove(hi + pad)];
}

/**
 * Parabolic z-hop contribution at `arc` given the crossing arcs, sorted
 * ascending as findCrossings returns them.
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
  const [start, end] = crossingRange(crossings, arc - hopRadius, arc + hopRadius);
  for (let i = start; i < end; i++) {
    const d = Math.abs(arc - crossings[i]);
    if (d < hopRadius) {
      hop = Math.max(hop, zHopHeight * (1 - (d / hopRadius) ** 2));
    }
  }
  return hop;
}

const HOP_STEPS = 8;  // samples across each hop window of width 2·hopRadius

/**
 * Arc positions strictly inside (arcFrom, arcTo) where extra points are
 * needed to resolve the hop parabola. Path samples are usually coarser
 * than the hop window, so without these a hop can fall between samples.
 * `crossings` must be sorted ascending.
 */
export function hopSampleArcs(
  arcFrom: number,
  arcTo: number,
  crossings: number[],
  hopRadius: number,
): number[] {
  if (hopRadius <= 0) return [];
  const out: number[] = [];
  const [start, end] = crossingRange(crossings, arcFrom - hopRadius, arcTo + hopRadius);
  for (let i = start; i < end; i++) {
    const c = crossings[i];
    if (c + hopRadius <= arcFrom || c - hopRadius >= arcTo) continue;
    for (let j = 0; j <= HOP_STEPS; j++) {
      const a = c - hopRadius + (2 * hopRadius * j) / HOP_STEPS;
      if (a > arcFrom + 1e-6 && a < arcTo - 1e-6) out.push(a);
    }
  }
  return out.sort((a, b) => a - b).filter((a, i, all) => i === 0 || a - all[i - 1] > 1e-6);
}
