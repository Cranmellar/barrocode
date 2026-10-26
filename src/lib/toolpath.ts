/**
 * Final print trajectory in mm: path order, Z oscillation and z-hop applied.
 *
 * Both the G-code emitter and the 3D preview consume this, so what the
 * preview draws is exactly what gets printed.
 */

import type { WaveLayer, PrintParams } from '../types';
import { svgToMM } from './waveGenerator';
import { buildArcPath, findCrossings, hopAtArc, hopSampleArcs } from './hopUtils';
import { computeCentroid, type MM2 } from './skirtUtils';

export interface ToolpathPoint { x: number; y: number; z: number }

export interface ToolpathLayer {
  index: number;
  z: number;                  // base layer Z (mm), without oscillation or hop
  paths: ToolpathPoint[][];   // print order; every path has ≥ 2 points
  centroid: MM2;              // orbit centre for skirt travel
  crossings: number;          // self-crossings that received a z-hop
}

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
  svgH: number,
): ToolpathLayer[] {
  const out: ToolpathLayer[] = [];
  // Each layer is ordered starting from where the previous one ended.
  let cur: MM2 = { x: params.originX, y: params.originY };
  // Crossings of the last two layers. Without keyframes or a per-layer
  // phase shift every layer (every other one with alternateDirection) has
  // the same XY, so detection runs once instead of once per layer.
  const recent: { ordered: MM2[][]; crossings: number[] }[] = [];

  for (const layer of layers) {
    const mmPaths = layer.paths
      .filter(path => path.length >= 2)
      .map(path => path.map(p => ({
        ...svgToMM(p, params.scaleFactor, params.originX, params.originY, params.flipY, svgH),
        zOffset: p.zOffset,
      })));

    const ordered = nearestNeighbourOrder(mmPaths, cur);
    const flat = ordered.flat();
    const arcPath = buildArcPath(flat);

    let crossings: number[] = [];
    if (params.zHopHeight > 0) {
      const same = recent.find(r => sameXY(r.ordered, ordered));
      if (same) {
        crossings = same.crossings;
      } else {
        const gaps = new Set<number>();
        let end = -1;
        for (const path of ordered.slice(0, -1)) { end += path.length; gaps.add(end); }
        crossings = findCrossings(arcPath, Math.max(params.hopRadius * 3, 2), gaps);
      }
      recent.unshift({ ordered, crossings });
      if (recent.length > 2) recent.pop();
    }

    const zAt = (zOffset: number, arc: number) =>
      layer.z + zOffset + hopAtArc(arc, crossings, params.zHopHeight, params.hopRadius);

    let k = 0;
    const paths = ordered.map(path => {
      const out: ToolpathPoint[] = [];
      path.forEach((p, i) => {
        const arc = arcPath[k++].arc;
        if (i > 0 && crossings.length > 0) {
          const prev = path[i - 1], prevArc = arcPath[k - 2].arc;
          for (const a of hopSampleArcs(prevArc, arc, crossings, params.hopRadius)) {
            const f = (a - prevArc) / (arc - prevArc);
            out.push({
              x: prev.x + (p.x - prev.x) * f,
              y: prev.y + (p.y - prev.y) * f,
              z: zAt(prev.zOffset + (p.zOffset - prev.zOffset) * f, a),
            });
          }
        }
        out.push({ x: p.x, y: p.y, z: zAt(p.zOffset, arc) });
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
