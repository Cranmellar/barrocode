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

import type { WaveLayer, PrintParams, SVGViewBox } from '../types';
import { buildToolpath, type ToolpathPoint } from './toolpath';
import { skirtArcPoints, type MM2 } from './skirtUtils';

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
    '; BarroCode — Lissajous G-code Generator',
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

// ── Concentric skirt travel ──────────────────────────────────────────────────

/**
 * G-code lines for a concentric skirt arc from `from` → `to`.
 * Short hops (< skirtThreshold) fall back to a direct lift-travel-descend.
 * Longer hops orbit the layer centroid at radius max(rFrom, rTo).
 */
function buildSkirtTravel(
  from: MM2,
  to: MM2,
  centroid: MM2,
  z: number,
  params: PrintParams,
): string[] {
  const arcPts = skirtArcPoints(from, to, centroid, params.skirtThreshold);

  const lines: string[] = [];
  lines.push(`G1 Z${fmt(z + 2)} F${params.travelSpeed}  ; lift`);

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

  lines.push(`G1 Z${fmt(z)} F${params.travelSpeed}  ; descend`);
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
  layers: WaveLayer[],
  params: PrintParams,
  viewBox: SVGViewBox,
): string {
  if (layers.length === 0) return '; No layers to generate.\n';

  const toolpath = buildToolpath(layers, params, viewBox.height);
  const blocks: string[] = [];
  blocks.push(buildHeader(params, layers.length));

  blocks.push('G21       ; mm units\nG90       ; absolute positioning\nG92 E0    ; reset E\n');
  blocks.push(`G1 Z${fmt(params.safeZ)} F${params.travelSpeed}  ; safe Z\n`);

  const eRef = { value: 0 };
  const zRef = { value: params.safeZ };
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
        blocks.push(`G1 Z${fmt(layer.z)} F${params.travelSpeed}  ; descend`);
        zRef.value = layer.z;
        if (params.dwellAtStart > 0) {
          blocks.push(`G4 P${params.dwellAtStart}  ; dwell — wait for clay flow`);
        }
      } else if (!params.softJoin || pi > 0) {
        // Inter-path travel: skirt arc (or short hop).
        // Always needed for pi > 0 even with softJoin; only the layer→layer
        // transition (pi === 0, softJoin) arrives via continuous extrusion.
        const skirtLines = buildSkirtTravel(cur, start, layer.centroid, layer.z, params);
        blocks.push(skirtLines.join('\n'));
        // skirt travel lands at layer.z; first point's Z applied on first G1
        zRef.value = layer.z;
      }

      blocks.push(pathToGcode(pts, params, eRef, zRef).join('\n'));
      isFirstMove = false;
      cur = pts[pts.length - 1];

      if (params.softJoin && nextLayer !== null && pi === layer.paths.length - 1) {
        const next = nextLayer.paths[0]?.[0];
        if (next) {
          const tLines = buildTransition(
            cur, next, zRef.value, next.z, params.transitionLength, params, eRef,
          );
          zRef.value = next.z;
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
