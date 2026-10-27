/**
 * G-code Generator
 *
 * Soft layer join:
 *   When softJoin=true, buildToolpath ramps Z up over the last
 *   transitionLength mm of each closed path, so the layer already ends at the
 *   next layer's start.  Any gap left (open paths, Z wave, per-layer phase)
 *   is bridged by a continuous print move that interpolates XY to the first
 *   point of layer N+1 while raising Z linearly.  No retract or lift.
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

import type { PrintParams } from '../types';
import type { ToolpathLayer, ToolpathPoint } from './toolpath';
import { skirtArcPoints, type MM2 } from './skirtUtils';
import { layerCount } from './waveGenerator';

const TRAVEL_CLEARANCE = 2;  // mm above the highest bead printed so far
const FINAL_CLEARANCE = 10;  // mm above both safeZ and the top of the part
const PRIME_GAP = 10;        // mm between the priming line and the part

function fmt(n: number, d = 3) { return n.toFixed(d); }

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(bx - ax, by - ay);
}

// Smoothstep: eases both ends of the transition curve.
function smoothstep(t: number) { return t * t * (3 - 2 * t); }

// ── Header ──────────────────────────────────────────────────────────────────

function buildHeader(params: PrintParams): string {
  return [
    '; ============================================================',
    '; BarroCode — Lissajous G-code Generator',
    '; ============================================================',
    `; Lissajous amp N / T   : ${params.lissAmpN} / ${params.lissAmpT} mm`,
    `; Lissajous wl  N / T   : ${params.lissWlN} / ${params.lissWlT} mm`,
    `; Lissajous delta        : ${(params.lissDelta * 180 / Math.PI).toFixed(1)}°`,
    `; Phase offset           : ${(params.lissPhaseOffset * 180 / Math.PI).toFixed(1)}°`,
    `; Phase shift / layer    : ${(params.phaseShiftPerLayer * 180 / Math.PI).toFixed(1)}°`,
    `; Layer height           : ${params.layerHeight} mm`,
    `; Number of layers       : ${layerCount(params)}`,
    `; Nozzle Z offset        : ${params.nozzleHeightOffset} mm`,
    `; Soft join              : ${params.softJoin} (transition ${params.transitionLength} mm)`,
    `; Scale factor           : ${params.scaleFactor}`,
    `; Center (X/Y)           : ${params.centerX} / ${params.centerY} mm`,
    `; Scale X / Y            : ${params.scaleX} / ${params.scaleY}`,
    `; Rotation               : ${params.rotation}°`,
    `; Origin X / Y           : ${params.originX} / ${params.originY} mm`,
    `; Flip Y                 : ${params.flipY}`,
    `; Z-hop height / radius  : ${params.zHopHeight} / ${params.hopRadius} mm`,
    `; Skirt threshold        : ${params.skirtThreshold} mm`,
    `; Print speed            : ${params.printSpeed} mm/min`,
    `; Travel speed           : ${params.travelSpeed} mm/min`,
    `; Generate E             : ${params.generateE}`,
    `; Extrusion multiplier   : ${params.extrusionMultiplier}`,
    '; ============================================================',
    '',
  ].join('\n');
}

// ── Soft transition between layers ──────────────────────────────────────────

/**
 * Build G-code lines for a smooth Z-rise transition from `from` to `to`.
 * The extruder continues extruding throughout (no retract, no lift).
 * Z rises linearly; XY follows a smoothstep interpolation.
 */
function buildTransition(
  from: MM2,
  to: MM2,
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

// ── Priming line ────────────────────────────────────────────────────────────

/**
 * Start of the priming line, which runs along +X beside the first layer's
 * bounding box: below it, or above it when below would turn Y negative on a
 * part that is not already there (corner-origin beds can't reach it).
 */
function primingStart(layer: ToolpathLayer): MM2 {
  let minX = Infinity, minY = Infinity, maxY = -Infinity;
  for (const path of layer.paths) {
    for (const p of path) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  const below = minY - PRIME_GAP;
  return { x: minX, y: below >= 0 || minY < 0 ? below : maxY + PRIME_GAP };
}

// ── Concentric skirt travel ──────────────────────────────────────────────────

/**
 * G-code lines for a concentric skirt arc from `from` → `to`.
 * Short hops (< skirtThreshold) fall back to a direct lift-travel-descend.
 * Longer hops orbit the layer centroid at radius max(rFrom, rTo).
 * The lift clears `topZ`, the highest bead printed so far (z-hop bumps and
 * Z oscillation can sit above the layer's base Z), and the descent lands on
 * the real Z of the next path's first point.
 */
function buildSkirtTravel(
  from: MM2,
  to: ToolpathPoint,
  centroid: MM2,
  topZ: number,
  params: PrintParams,
): string[] {
  const arcPts = skirtArcPoints(from, to, centroid, params.skirtThreshold);

  const lines: string[] = [];
  lines.push(`G1 Z${fmt(topZ + TRAVEL_CLEARANCE)} F${params.travelSpeed}  ; lift`);

  if (!arcPts) {
    // Short hop — direct XY travel
    lines.push(`G1 X${fmt(to.x)} Y${fmt(to.y)} F${params.travelSpeed}  ; short hop`);
  } else {
    const rA = Math.hypot(from.x - centroid.x, from.y - centroid.y);
    const rB = Math.hypot(to.x   - centroid.x, to.y   - centroid.y);
    const R  = Math.max(rA, rB, 1);
    const arcLen = R * Math.abs(Math.atan2(
      (to.y - centroid.y) * (from.x - centroid.x) - (to.x - centroid.x) * (from.y - centroid.y),
      (to.x - centroid.x) * (from.x - centroid.x) + (to.y - centroid.y) * (from.y - centroid.y),
    ));
    lines.push(`; ↻ Skirt arc r=${fmt(R, 1)} mm ~${fmt(arcLen, 1)} mm`);
    for (const pt of arcPts) {
      lines.push(`G1 X${fmt(pt.x)} Y${fmt(pt.y)} F${params.travelSpeed}`);
    }
  }

  lines.push(`G1 Z${fmt(to.z)} F${params.travelSpeed}  ; descend`);
  return lines;
}

// ── Single path on one layer ─────────────────────────────────────────────────

/**
 * Emit G-code for one continuous print path.
 * Travel to the path start must be handled by the caller BEFORE this call.
 */
function pathToGcode(
  pts: ToolpathPoint[],
  params: PrintParams,
  eRef: { value: number },
  zRef: { value: number },  // tracks current nozzle Z across calls
): string[] {
  const lines: string[] = [];

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const d = dist(prev.x, prev.y, curr.x, curr.y);
    if (d < 1e-6) continue;

    eRef.value += d * params.extrusionMultiplier;
    const eStr = params.generateE ? ` E${fmt(eRef.value)}` : '';
    const zChanged = Math.abs(curr.z - zRef.value) > 0.001;
    const zStr = zChanged ? ` Z${fmt(curr.z)}` : '';
    if (zChanged) zRef.value = curr.z;

    lines.push(`G1 X${fmt(curr.x)} Y${fmt(curr.y)}${zStr}${eStr} F${params.printSpeed}`);
  }

  return lines;
}

// ── Main entry point ─────────────────────────────────────────────────────────

export function generateGcode(
  toolpath: ToolpathLayer[],
  params: PrintParams,
): string {
  if (toolpath.length === 0) return '; No layers to generate.\n';

  const blocks: string[] = [];
  blocks.push(buildHeader(params));

  // M82 guards against a relative-E mode left over from a previous job; it is
  // skipped for motion-only output, where controllers may reject E-axis codes.
  blocks.push(
    'G21       ; mm units\nG90       ; absolute positioning\n' +
    (params.generateE ? 'M82       ; absolute extrusion\n' : '') +
    'G92 E0    ; reset E\n',
  );
  blocks.push(`G1 Z${fmt(params.safeZ)} F${params.travelSpeed}  ; safe Z\n`);

  const eRef = { value: 0 };
  const zRef = { value: params.safeZ };
  let isFirstMove = true;
  let joined = false;  // arrived at this path through a soft transition

  if (params.primingMove) {
    const pz = toolpath[0].z;
    const { x: px, y: py } = primingStart(toolpath[0]);
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
  }

  const topZ: number[] = [];
  let top = -Infinity;
  for (const layer of toolpath) {
    for (const path of layer.paths) for (const p of path) top = Math.max(top, p.z);
    topZ.push(top);
  }

  let cur: MM2 = { x: params.originX, y: params.originY };

  for (let li = 0; li < toolpath.length; li++) {
    const layer = toolpath[li];
    const nextLayer = toolpath[li + 1] ?? null;

    blocks.push(`\n; ===== Layer ${li + 1} / ${toolpath.length}   Z = ${fmt(layer.z)} mm =====`);
    if (layer.crossings > 0) {
      blocks.push(`; Z-hop: ${layer.crossings} crossing(s) detected`);
    }

    for (let pi = 0; pi < layer.paths.length; pi++) {
      const pts = layer.paths[pi];
      const start = pts[0];

      blocks.push(`; --- Layer ${li + 1}, Path ${pi + 1} ---`);

      if (isFirstMove) {
        blocks.push(`G1 X${fmt(start.x)} Y${fmt(start.y)} F${params.travelSpeed}  ; travel to start`);
        blocks.push(`G1 Z${fmt(start.z)} F${params.travelSpeed}  ; descend`);
        zRef.value = start.z;
        if (params.dwellAtStart > 0) {
          blocks.push(`G4 P${params.dwellAtStart}  ; dwell — wait for clay flow`);
        }
      } else if (!joined) {
        const skirtLines = buildSkirtTravel(cur, start, layer.centroid, topZ[li], params);
        blocks.push(skirtLines.join('\n'));
        zRef.value = start.z;
      }

      blocks.push(pathToGcode(pts, params, eRef, zRef).join('\n'));
      isFirstMove = false;
      joined = false;
      cur = pts[pts.length - 1];

      if (params.softJoin && nextLayer !== null && pi === layer.paths.length - 1) {
        const next = nextLayer.paths[0]?.[0];
        if (next && Math.hypot(next.x - cur.x, next.y - cur.y, next.z - zRef.value) > 0.001) {
          const tLines = buildTransition(
            cur, next, zRef.value, next.z, params.transitionLength, params, eRef,
          );
          zRef.value = next.z;
          joined = true;
          blocks.push(tLines.join('\n'));
        }
      }
    }
  }

  blocks.push('\n; ===== End =====');
  const finalZ = Math.max(params.safeZ, topZ[topZ.length - 1]) + FINAL_CLEARANCE;
  blocks.push(`G1 Z${fmt(finalZ)} F${params.travelSpeed}  ; final lift`);
  blocks.push('M84  ; disable motors');

  return blocks.join('\n');
}

// ── Download helper ──────────────────────────────────────────────────────────

export function downloadGcode(gcode: string, filename = 'barrocode.gcode'): void {
  const blob = new Blob([gcode], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
