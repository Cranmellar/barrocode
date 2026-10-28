/**
 * Final print trajectory in mm: path order, Z oscillation, z-hop and the
 * soft-join seam ramp applied.
 *
 * Both the G-code emitter and the 3D preview consume this, so what the
 * preview draws is exactly what gets printed.
 */

import type { WaveLayer, PrintParams } from '../types';
import { arcLengths, findCrossings, hopAtArc, hopSampleArcs } from './hopUtils';
import { computeCentroid, type MM2 } from './skirtUtils';

export interface ToolpathPoint { x: number; y: number; z: number }

export interface ToolpathLayer {
  index: number;
  z: number;                  // base layer Z (mm), without oscillation or hop
  paths: ToolpathPoint[][];   // print order; every path has ≥ 2 points
  centroid: MM2;              // orbit centre for skirt travel
  crossings: number;          // self-crossings that received a z-hop
}

// Every PrintParams field buildToolpath reads; a test pins the list.
export const TOOLPATH_PARAMS = [
  'scaleFactor', 'originX', 'originY', 'flipY', 'zHopHeight', 'hopRadius',
  'softJoin', 'transitionLength', 'alternateDirection',
] as const satisfies readonly (keyof PrintParams)[];

function nearestNeighbourOrder<T extends MM2>(paths: T[][], start: MM2): T[][] {
  const remaining = [...paths];
  const ordered: T[][] = [];
  let cur = start;

  while (remaining.length > 0) {
    let best = 0, bestDist = Infinity;
    for (let s = 0; s < remaining.length; s++) {
      const p0 = remaining[s][0];
      const d = Math.hypot(p0.x - cur.x, p0.y - cur.y);
      if (d < bestDist) { bestDist = d; best = s; }
    }
    const [chosen] = remaining.splice(best, 1);
    ordered.push(chosen);
    cur = chosen[chosen.length - 1];
  }
  return ordered;
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Lift over the last `length` mm of a closed path, 0 → `step`, so it ends at
 * the next layer's height instead of climbing straight up at the seam. Each
 * layer's ramp lies on the one below, keeping the bead height constant;
 * only layer 0's ramp has the flat bed under it. With alternateDirection the
 * next layer would start over this ramp, so the caller skips it there.
 */
function seamRamp(arc: number, endArc: number, length: number, step: number): number {
  const t = (arc - (endArc - length)) / length;
  return t <= 0 ? 0 : step * smoothstep(Math.min(1, t));
}

function sameXY(a: MM2[][], b: MM2[][]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i], pb = b[i];
    if (pa.length !== pb.length) return false;
    for (let k = 0; k < pa.length; k++) {
      if (pa[k].x !== pb[k].x || pa[k].y !== pb[k].y) return false;
    }
  }
  return true;
}

export function buildToolpath(
  layers: WaveLayer[],
  params: PrintParams,
  centre: { x: number; y: number },  // partCentreSVG of the source paths
): ToolpathLayer[] {
  const out: ToolpathLayer[] = [];
  // Each layer is ordered starting from where the previous one ended.
  let cur: MM2 = { x: params.originX, y: params.originY };
  // Crossings of the last two layers. Without keyframes or a per-layer
  // phase shift every layer (every other one with alternateDirection) has
  // the same XY, so detection runs once instead of once per layer.
  const recent: { ordered: MM2[][]; crossings: number[] }[] = [];
  const rampStep = params.softJoin && !params.alternateDirection && layers.length > 1
    ? layers[1].z - layers[0].z
    : 0;

  // svgToMM, inlined: one object per point instead of two.
  const { scaleFactor: sf, originX, originY, flipY } = params;

  for (const layer of layers) {
    const closed = new Set<MM2[]>();
    const mmPaths = layer.paths.flatMap((path, pi) => {
      if (path.length < 2) return [];
      const mm = path.map(p => ({
        x: (p.x - centre.x) * sf + originX,
        y: (flipY ? centre.y - p.y : p.y - centre.y) * sf + originY,
        zOffset: p.zOffset,
      }));
      if (layer.closed[pi]) closed.add(mm);
      return [mm];
    });

    const ordered = nearestNeighbourOrder(mmPaths, cur);
    const flat = ordered.flat();
    const arcs = arcLengths(flat);

    let crossings: number[] = [];
    if (params.zHopHeight > 0) {
      const same = recent.find(r => sameXY(r.ordered, ordered));
      if (same) {
        crossings = same.crossings;
      } else {
        const gaps = new Set<number>();
        let end = -1;
        for (const path of ordered.slice(0, -1)) { end += path.length; gaps.add(end); }
        crossings = findCrossings(flat, arcs, Math.max(params.hopRadius * 3, 2), gaps);
      }
      recent.unshift({ ordered, crossings });
      if (recent.length > 2) recent.pop();
    }

    const zAt = (zOffset: number, arc: number) =>
      layer.z + zOffset + hopAtArc(arc, crossings, params.zHopHeight, params.hopRadius);

    let k = 0;
    const paths = ordered.map(path => {
      const out: ToolpathPoint[] = [];
      const startArc = arcs[k], endArc = arcs[k + path.length - 1];
      const rampLength = Math.min(params.transitionLength, endArc - startArc);
      const ramp = (arc: number) => rampStep > 0 && rampLength > 0 && closed.has(path)
        ? seamRamp(arc, endArc, rampLength, rampStep)
        : 0;
      path.forEach((p, i) => {
        const arc = arcs[k++];
        if (i > 0 && crossings.length > 0) {
          const prev = path[i - 1], prevArc = arcs[k - 2];
          for (const a of hopSampleArcs(prevArc, arc, crossings, params.hopRadius)) {
            const f = (a - prevArc) / (arc - prevArc);
            out.push({
              x: prev.x + (p.x - prev.x) * f,
              y: prev.y + (p.y - prev.y) * f,
              z: zAt(prev.zOffset + (p.zOffset - prev.zOffset) * f, a) + ramp(a),
            });
          }
        }
        out.push({ x: p.x, y: p.y, z: zAt(p.zOffset, arc) + ramp(arc) });
      });
      return out;
    });

    if (flat.length > 0) cur = flat[flat.length - 1];
    out.push({
      index: layer.index,
      z: layer.z,
      paths,
      centroid: computeCentroid(flat),
      crossings: crossings.length,
    });
  }

  return out;
}
