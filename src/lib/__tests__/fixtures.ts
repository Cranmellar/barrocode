import type { PrintParams, SampledPath, SVGViewBox } from '../../types';

export const VIEWBOX: SVGViewBox = { x: 0, y: 0, width: 200, height: 200 };

// scaleFactor 1, origin 0 and no Y flip: with CENTRE as the part centre,
// mm coordinates equal SVG units.
// buildToolpath's centre for tests that place their parts by hand.
export const CENTRE = { x: 0, y: 0 };

export const PARAMS: PrintParams = {
  sampleSpacing: 2,
  lissAmpN: 0, lissAmpT: 0, lissAmpZ: 0,
  lissWlN: 20, lissWlT: 20, lissWlZ: 20,
  lissDelta: 0, lissPhaseZ: 0, lissPhaseOffset: 0, phaseShiftPerLayer: 0,
  layerHeight: 2.5, numLayers: 2, useNumLayers: true, totalHeight: 15,
  nozzleHeightOffset: 1, safeZ: 20,
  softJoin: true, transitionLength: 10,
  scaleFactor: 1, originX: 0, originY: 0, gcodeOrigin: 'centre', flipY: false,
  centerX: 0, centerY: 0, scaleX: 1, scaleY: 1, scaleUniform: true, rotation: 0,
  zHopHeight: 0, hopRadius: 3,
  skirtThreshold: 15,
  printSpeed: 600, travelSpeed: 1500,
  generateE: true, extrusionMultiplier: 0.05,
  reversePath: false, alternateDirection: false, closePath: false,
  dwellAtStart: 0, primingMove: false, primingLength: 20,
};

type P2 = [number, number];

/** Polyline through the corners, resampled so no step exceeds `step`. */
export function polyline(corners: P2[], step = 2): P2[] {
  const out: P2[] = [corners[0]];
  for (let c = 1; c < corners.length; c++) {
    const [ax, ay] = corners[c - 1], [bx, by] = corners[c];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let i = 1; i <= n; i++) out.push([ax + (bx - ax) * i / n, ay + (by - ay) * i / n]);
  }
  return out;
}

export function curve(f: (u: number) => P2, n: number): P2[] {
  return Array.from({ length: n + 1 }, (_, i) => f(i / n));
}

/** SampledPath as parseSVG would build it: arc length + central-difference frame. */
export function sampledPath(id: string, pts: P2[]): SampledPath {
  let arc = 0;
  const points = pts.map(([x, y], i) => {
    if (i > 0) arc += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
    const [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
    const m = Math.hypot(bx - ax, by - ay) || 1;
    const tx = (bx - ax) / m, ty = (by - ay) / m;
    return { x, y, tangentX: tx, tangentY: ty, normalX: -ty, normalY: tx, arcLength: arc };
  });
  return {
    id, tagName: 'path', totalLength: arc, points, enabled: true,
    ampNOverride: null, ampTOverride: null, wlNOverride: null, wlTOverride: null,
  };
}

export interface Move {
  from: { x: number; y: number; z: number };
  to:   { x: number; y: number; z: number };
  extruding: boolean;
  transition: boolean;  // part of a soft-join layer transition
}

/** Tracks absolute X/Y/Z/E through the G1 moves of a program. */
export function interpret(gcode: string): Move[] {
  const pos = { x: 0, y: 0, z: 0 };
  let e = 0;
  const moves: Move[] = [];
  let transition = false;
  for (const raw of gcode.split('\n')) {
    if (raw.startsWith('; ↗ Soft transition')) transition = true;
    if (raw.startsWith('; =====')) transition = false;
    const line = raw.split(';')[0].trim();
    if (!line.startsWith('G1 ')) continue;
    const from = { ...pos };
    let extruding = false;
    for (const word of line.split(/\s+/).slice(1)) {
      const v = parseFloat(word.slice(1));
      switch (word[0]) {
        case 'X': pos.x = v; break;
        case 'Y': pos.y = v; break;
        case 'Z': pos.z = v; break;
        case 'E': extruding = v > e; e = v; break;
      }
    }
    moves.push({ from, to: { ...pos }, extruding, transition });
  }
  return moves;
}
