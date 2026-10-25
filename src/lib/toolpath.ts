/**
 * Final print trajectory in mm: path order, Z oscillation and z-hop applied.
 *
 * Both the G-code emitter and the 3D preview consume this, so what the
 * preview draws is exactly what gets printed.
 */

import type { WaveLayer, PrintParams } from '../types';
import { svgToMM } from './waveGenerator';
import { buildArcPath, findCrossings, hopAtArc } from './hopUtils';
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

export function buildToolpath(
  layers: WaveLayer[],
  params: PrintParams,
  svgH: number,
): ToolpathLayer[] {
  const out: ToolpathLayer[] = [];
  // Each layer is ordered starting from where the previous one ended.
  let cur: MM2 = { x: params.originX, y: params.originY };

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
      const gaps = new Set<number>();
      let end = -1;
      for (const path of ordered.slice(0, -1)) { end += path.length; gaps.add(end); }
      crossings = findCrossings(arcPath, Math.max(params.hopRadius * 3, 2), gaps);
    }

    let k = 0;
    const paths = ordered.map(path => path.map(p => ({
      x: p.x,
      y: p.y,
      z: layer.z + p.zOffset
        + hopAtArc(arcPath[k++].arc, crossings, params.zHopHeight, params.hopRadius),
    })));

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
