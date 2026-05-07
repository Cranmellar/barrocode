/**
 * G-code Generator
 *
 * Soft layer join:
 *   When softJoin=true, the transition from layer N → N+1 is a continuous
 *   print move that interpolates XY from the last point of layer N to the
 *   first point of layer N+1, while raising Z linearly.  No retract or lift.
 *   This gives clay a smooth, unbroken extrusion across layers.
 *
 * Extrusion model:
 *   E is cumulative.  Each move of distance d:   E += d * extrusionMultiplier
 *   extrusionMultiplier ≈ 0.02–0.1 for clay systems (tune to pump/auger).
 *   Set generateE=false for motion-only G-code.
 *
 * Z-hop:
 *   When zHopHeight > 0, the nozzle arcs smoothly over self-intersecting path
 *   crossings (same layer). A parabolic lift of ±hopRadius mm around each
 *   crossing provides clearance without stopping extrusion.
 */

import type { WaveLayer, WavePoint, PrintParams, SVGViewBox } from '../types';
import { svgToMM } from './waveGenerator';
import { buildArcPath, findCrossings, hopAtArc, HOP_RADIUS } from './hopUtils';

function fmt(n: number, d = 3) { return n.toFixed(d); }

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(bx - ax, by - ay);
}

// Smoothstep: eases both ends of the transition curve.
function smoothstep(t: number) { return t * t * (3 - 2 * t); }

// ── Header ──────────────────────────────────────────────────────────────────

function buildHeader(params: PrintParams, numLayers: number): string {
  const eff = params.useNumLayers
    ? params.numLayers
    : Math.max(1, Math.ceil(params.totalHeight / params.layerHeight));
  return [
    '; ============================================================',
    '; CurvaBarro — Lissajous G-code Generator',
    '; ============================================================',
    `; Lissajous amp N / T   : ${params.lissAmpN} / ${params.lissAmpT} mm`,
    `; Lissajous wl  N / T   : ${params.lissWlN} / ${params.lissWlT} mm`,
    `; Lissajous delta        : ${(params.lissDelta * 180 / Math.PI).toFixed(1)}°`,
    `; Phase offset           : ${(params.lissPhaseOffset * 180 / Math.PI).toFixed(1)}°`,
    `; Phase shift / layer    : ${(params.phaseShiftPerLayer * 180 / Math.PI).toFixed(1)}°`,
    `; Layer height           : ${params.layerHeight} mm`,
    `; Number of layers       : ${eff}`,
    `; Nozzle Z offset        : ${params.nozzleHeightOffset} mm`,
    `; Soft join              : ${params.softJoin} (transition ${params.transitionLength} mm)`,
    `; Scale factor           : ${params.scaleFactor}`,
    `; Center (X/Y)           : ${params.centerX} / ${params.centerY} mm`,
    `; Scale X / Y            : ${params.scaleX} / ${params.scaleY}`,
    `; Origin X / Y           : ${params.originX} / ${params.originY} mm`,
    `; Flip Y                 : ${params.flipY}`,
    `; Z-hop height           : ${params.zHopHeight} mm`,
    `; Print speed            : ${params.printSpeed} mm/min`,
    `; Travel speed           : ${params.travelSpeed} mm/min`,
    `; Generate E             : ${params.generateE}`,
    `; Extrusion multiplier   : ${params.extrusionMultiplier}`,
    '; ============================================================',
    '',
  ].join('\n');
}

// ── Coordinate helpers ───────────────────────────────────────────────────────

interface MMPoint { x: number; y: number }

function toMM(
  pt: WavePoint,
  params: PrintParams,
  svgH: number,
): MMPoint {
  return svgToMM(
    pt, params.scaleFactor, params.originX, params.originY, params.flipY, svgH,
    params.centerX, params.centerY, params.scaleX, params.scaleY,
  );
}

// ── Soft transition between layers ──────────────────────────────────────────

/**
 * Build G-code lines for a smooth Z-rise transition from `from` to `to`.
 * The extruder continues extruding throughout (no retract, no lift).
 * Z rises linearly; XY follows a smoothstep interpolation.
 */
function buildTransition(
  from: MMPoint,
  to: MMPoint,
  zFrom: number,
  zTo: number,
  transitionLength: number,
  params: PrintParams,
  eRef: { value: number },
): string[] {
  const nSteps = Math.max(6, Math.ceil(transitionLength / 2));
  const lines: string[] = [
    `; ↗ Soft transition Z ${fmt(zFrom)} → ${fmt(zTo)} mm`,
  ];
  let prevX = from.x, prevY = from.y;

  for (let i = 1; i <= nSteps; i++) {
    const t = i / nSteps;
    const st = smoothstep(t);
    const x = from.x + (to.x - from.x) * st;
    const y = from.y + (to.y - from.y) * st;
    const z = zFrom + (zTo - zFrom) * t;

    const segD = dist(prevX, prevY, x, y);
    eRef.value += segD * params.extrusionMultiplier;
    const eStr = params.generateE ? ` E${fmt(eRef.value)}` : '';
    lines.push(`G1 X${fmt(x)} Y${fmt(y)} Z${fmt(z)}${eStr} F${params.printSpeed}`);
    prevX = x; prevY = y;
  }
  return lines;
}

// ── Single path on one layer ─────────────────────────────────────────────────

function pathToGcode(
  svgPts: WavePoint[],
  z: number,
  params: PrintParams,
  svgH: number,
  eRef: { value: number },
  travelToStart: boolean,
  crossings: number[],    // arc positions (mm) of intersections in the full layer path
  arcOffset: number,      // cumulative arc at start of this path segment
): string[] {
  if (svgPts.length < 2) return [];

  const mmPts = svgPts.map(p => toMM(p, params, svgH));
  const lines: string[] = [];

  if (travelToStart) {
    const s = mmPts[0];
    lines.push(`G1 X${fmt(s.x)} Y${fmt(s.y)} F${params.travelSpeed}  ; travel to path start`);
    lines.push(`G1 Z${fmt(z)} F${params.travelSpeed}  ; descend`);
  }

  // Build arc-length accumulator for this path (local arc + offset = global arc)
  let localArc = arcOffset;

  for (let i = 1; i < mmPts.length; i++) {
    const prev = mmPts[i - 1];
    const curr = mmPts[i];
    const d = dist(prev.x, prev.y, curr.x, curr.y);
    if (d < 1e-6) continue;

    localArc += d;
    const hop = hopAtArc(localArc, crossings, params.zHopHeight);
    const zOut = z + hop;

    eRef.value += d * params.extrusionMultiplier;
    const eStr = params.generateE ? ` E${fmt(eRef.value)}` : '';
    const zStr = (hop > 0.001 || i === 1) ? ` Z${fmt(zOut)}` : '';
    lines.push(`G1 X${fmt(curr.x)} Y${fmt(curr.y)}${zStr}${eStr} F${params.printSpeed}`);
  }

  return lines;
}

// ── Nearest-neighbour path reordering ───────────────────────────────────────

function reorderPaths(
  paths: WavePoint[][],
  startX: number,
  startY: number,
  params: PrintParams,
  svgH: number,
): WavePoint[][] {
  if (paths.length <= 1) return paths;

  const remaining = paths.map((_, i) => i);
  const ordered: WavePoint[][] = [];
  let cx = startX, cy = startY;

  while (remaining.length > 0) {
    let bestDist = Infinity;
    let bestSlot = 0;

    for (let s = 0; s < remaining.length; s++) {
      const idx = remaining[s];
      const p = paths[idx];
      if (!p.length) continue;
      const mm = toMM(p[0], params, svgH);
      const d  = dist(cx, cy, mm.x, mm.y);
      if (d < bestDist) { bestDist = d; bestSlot = s; }
    }

    const chosen = paths[remaining[bestSlot]];
    ordered.push(chosen);
    remaining.splice(bestSlot, 1);
    const last = toMM(chosen[chosen.length - 1], params, svgH);
    cx = last.x; cy = last.y;
  }

  return ordered;
}

// ── Main entry point ─────────────────────────────────────────────────────────

export function generateGcode(
  layers: WaveLayer[],
  params: PrintParams,
  viewBox: SVGViewBox,
): string {
  if (layers.length === 0) return '; No layers to generate.\n';

  const svgH = viewBox.height;
  const blocks: string[] = [];
  blocks.push(buildHeader(params, layers.length));

  blocks.push('G21       ; mm units\nG90       ; absolute positioning\nG92 E0    ; reset E\n');
  blocks.push(`G1 Z${fmt(params.safeZ)} F${params.travelSpeed}  ; safe Z\n`);

  const eRef = { value: 0 };
  let isFirstMove = true;

  if (params.primingMove) {
    const pz = layers[0].z;
    const px = params.originX - 5;
    const py = params.originY - 5;
    blocks.push(
      `; --- Priming ---\n` +
      `G1 X${fmt(px)} Y${fmt(py)} F${params.travelSpeed}\n` +
      `G1 Z${fmt(pz)} F${params.travelSpeed}\n`,
    );
    eRef.value += params.primingLength * params.extrusionMultiplier;
    const eStr = params.generateE ? ` E${fmt(eRef.value)}` : '';
    blocks.push(
      `G1 X${fmt(px + params.primingLength)} Y${fmt(py)}${eStr} F${params.printSpeed}\n` +
      `G1 Z${fmt(params.safeZ)} F${params.travelSpeed}\n; --- End priming ---\n`,
    );
    isFirstMove = false;
  }

  let curX = params.originX, curY = params.originY;

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const nextLayer = layers[li + 1] ?? null;

    blocks.push(`\n; ===== Layer ${li + 1} / ${layers.length}   Z = ${fmt(layer.z)} mm =====`);

    const orderedPaths = reorderPaths(layer.paths, curX, curY, params, svgH);

    // ── Z-hop pre-processing: build full layer arc path & find crossings ──
    let layerCrossings: number[] = [];
    if (params.zHopHeight > 0) {
      const fullMmPts: MMPoint[] = [];
      for (const svgPts of orderedPaths) {
        for (const p of svgPts) fullMmPts.push(toMM(p, params, svgH));
      }
      const arcPath = buildArcPath(fullMmPts);
      layerCrossings = findCrossings(arcPath);
      if (layerCrossings.length > 0) {
        blocks.push(`; Z-hop: ${layerCrossings.length} crossing(s) detected`);
      }
    }

    // Track running arc offset so each path knows its global arc position
    let arcOffset = 0;

    for (let pi = 0; pi < orderedPaths.length; pi++) {
      const svgPts = orderedPaths[pi];
      if (svgPts.length < 2) continue;

      blocks.push(`; --- Layer ${li + 1}, Path ${pi + 1} ---`);

      const needsTravel = isFirstMove || !params.softJoin;
      if (!isFirstMove && !params.softJoin) {
        blocks.push(`G1 Z${fmt(params.safeZ)} F${params.travelSpeed}  ; safe lift`);
      }

      const lines = pathToGcode(svgPts, layer.z, params, svgH, eRef, needsTravel, layerCrossings, arcOffset);
      blocks.push(lines.join('\n'));
      isFirstMove = false;

      // Update arc offset for next path
      const mmPts = svgPts.map(p => toMM(p, params, svgH));
      for (let i = 1; i < mmPts.length; i++) {
        arcOffset += dist(mmPts[i - 1].x, mmPts[i - 1].y, mmPts[i].x, mmPts[i].y);
      }

      const lastPt = toMM(svgPts[svgPts.length - 1], params, svgH);
      curX = lastPt.x; curY = lastPt.y;

      if (params.softJoin && nextLayer !== null && pi === orderedPaths.length - 1) {
        const firstNextSvgPt = nextLayer.paths[0]?.[0];
        if (firstNextSvgPt) {
          const fromMM = toMM(svgPts[svgPts.length - 1], params, svgH);
          const toMM2 = toMM(firstNextSvgPt, params, svgH);
          const tLines = buildTransition(
            fromMM, toMM2,
            layer.z, nextLayer.z,
            params.transitionLength,
            params, eRef,
          );
          blocks.push(tLines.join('\n'));
        }
      }
    }
  }

  blocks.push('\n; ===== End =====');
  blocks.push(`G1 Z${fmt(params.safeZ + 10)} F${params.travelSpeed}  ; final lift`);
  blocks.push('M84  ; disable motors');

  return blocks.join('\n');
}

// ── Download helper ──────────────────────────────────────────────────────────

export function downloadGcode(gcode: string, filename = 'clay-wave.gcode'): void {
  const blob = new Blob([gcode], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
