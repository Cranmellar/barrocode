/**
 * G-code Generator
 *
 * Soft layer join:
 *   When softJoin=true, buildToolpath ramps Z up over the last
 *   transitionLength mm of each closed path, so the layer already ends at the
 *   next layer's start.  Any gap left (open paths, Z wave, per-layer phase)
 *   is bridged by a continuous print move that interpolates XY to the first
 *   point of layer N+1 while raising Z linearly.  No retract or lift.
 *   When the next layer starts more than transitionLength away in XY (open
 *   paths end at the far end), the join would extrude a chord across the
 *   part, so a normal lift-and-travel is used instead.
 *
 * Extrusion model:
 *   E is cumulative.  Each move of distance d:   E += d * ePerMM(params)
 *   Clay: ePerMM = extrusionMultiplier, ≈ 0.02–0.1 (tune to pump/auger).
 *   Filament: the bead's volume over the filament's section, times flowRatio.
 *   Set generateE=false for motion-only G-code.
 *
 * Machine:
 *   startGcode / endGcode are templates ({nozzleTemp}, {bedTemp}, …; see
 *   templateVars) around the program. With filament, travel between paths
 *   retracts retractLength, the fan turns on at fanFromLayer, and layers
 *   faster than minLayerTime slow down. Clay never retracts.
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
import { emptyBox, growBox, type GcodeBox, type GcodeStats } from './gcodeStats';
import { FIRMWARE_LABEL, profileName } from './machineProfiles';

const TRAVEL_CLEARANCE = 2;  // mm above the highest bead printed so far
const FINAL_CLEARANCE = 10;  // mm above both safeZ and the top of the part
const PRIME_GAP = 10;        // mm between the priming line and the part

function fmt(n: number, d = 3) { return n.toFixed(d); }

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(bx - ax, by - ay);
}

// ── Moves ───────────────────────────────────────────────────────────────────

// Machine position plus the program summary, kept as each move is written so
// the viewer needn't parse the G-code back. It reads the rounded values that
// are written, as summarizeGcode would.
interface Machine extends GcodeStats { x: number; y: number; z: number; e: number; eHigh: number }

function newMachine(): Machine {
  return { x: 0, y: 0, z: 0, e: 0, eHigh: 0, timeSec: 0, printLength: 0, travelLength: 0, eTotal: 0, box: emptyBox() };
}

function statsOf({ timeSec, printLength, travelLength, eTotal, box }: Machine): GcodeStats {
  return { timeSec, printLength, travelLength, eTotal, box: { ...box } };
}

/** E per mm of nozzle travel. */
export function ePerMM(params: PrintParams): number {
  if (params.material !== 'filament') return params.extrusionMultiplier;
  const section = Math.PI * (params.filamentDiameter / 2) ** 2;
  return params.lineWidth * params.layerHeight / section * params.flowRatio / 100;
}

function move(
  m: Machine,
  to: { x?: number; y?: number; z?: number; e?: number },
  feed: number,
  comment?: string,
): string {
  let line = 'G1';
  let x = m.x, y = m.y, z = m.z, e = m.e;
  if (to.x !== undefined) { const v = fmt(to.x); line += ` X${v}`; x = +v; }
  if (to.y !== undefined) { const v = fmt(to.y); line += ` Y${v}`; y = +v; }
  if (to.z !== undefined) { const v = fmt(to.z); line += ` Z${v}`; z = +v; }
  if (to.e !== undefined) { const v = fmt(to.e); line += ` E${v}`; e = +v; }
  line += ` F${feed}`;

  const d = Math.hypot(x - m.x, y - m.y, z - m.z);
  if (feed > 0) m.timeSec += d / (feed / 60);
  if (e > m.e) {
    m.printLength += d;
    if (e > m.eHigh) { m.eTotal += e - m.eHigh; m.eHigh = e; }
  } else {
    m.travelLength += d;
  }
  growBox(m.box, to.x !== undefined ? x : undefined, to.y !== undefined ? y : undefined, to.z !== undefined ? z : undefined);
  m.x = x; m.y = y; m.z = z; m.e = e;
  return comment ? `${line}  ; ${comment}` : line;
}

function dwell(m: Machine, ms: number): string {
  m.timeSec += ms / 1000;
  return `G4 P${ms}  ; dwell — wait for clay flow`;
}

// Smoothstep: eases both ends of the transition curve.
function smoothstep(t: number) { return t * t * (3 - 2 * t); }

// ── Header ──────────────────────────────────────────────────────────────────

function buildHeader(params: PrintParams, box: GcodeBox): string {
  const deg = (r: number) => (r * 180 / Math.PI).toFixed(1);
  const filament = params.material === 'filament';
  return [
    '; ============================================================',
    '; BarroCode — Lissajous G-code Generator',
    '; ============================================================',
    `; Machine                : ${profileName(params.machineProfile)} · ${FIRMWARE_LABEL[params.firmware]}`,
    `; Material               : ${filament ? `filament ${params.filamentDiameter} mm, flow ${params.flowRatio} %` : 'clay'}`,
    `; Nozzle / line width    : ${params.nozzleDiameter} / ${params.lineWidth} mm`,
    `; Box X ${fmt(box.minX)}…${fmt(box.maxX)}  Y ${fmt(box.minY)}…${fmt(box.maxY)}  Z ${fmt(box.minZ)}…${fmt(box.maxZ)} mm`,
    `; Lissajous amp N / T   : ${params.lissAmpN} / ${params.lissAmpT} mm`,
    `; Lissajous wl  N / T   : ${params.lissWlN} / ${params.lissWlT} mm`,
    `; Lissajous amp / wl Z  : ${params.lissAmpZ} / ${params.lissWlZ} mm, phase ${deg(params.lissPhaseZ)}°`,
    `; Lissajous delta        : ${(params.lissDelta * 180 / Math.PI).toFixed(1)}°`,
    `; Phase offset           : ${(params.lissPhaseOffset * 180 / Math.PI).toFixed(1)}°`,
    `; Phase shift / layer    : ${(params.phaseShiftPerLayer * 180 / Math.PI).toFixed(1)}°`,
    `; Layer height           : ${params.layerHeight} mm`,
    `; Number of layers       : ${layerCount(params)}`,
    `; Nozzle Z offset        : ${params.nozzleHeightOffset} mm`,
    `; Soft join              : ${params.softJoin} (transition ${params.transitionLength} mm)`,
    `; Scale factor           : ${params.scaleFactor}`,
    `; Pivot from part centre : ${params.centerX} / ${params.centerY} mm`,
    `; Scale X / Y            : ${params.scaleX} / ${params.scaleY}`,
    `; Rotation               : ${params.rotation}°`,
    params.gcodeOrigin === 'corner'
      ? `; Margin X / Y (corner)  : ${params.marginX} / ${params.marginY} mm`
      : `; Part centre at X / Y   : ${params.originX} / ${params.originY} mm`,
    `; Flip Y                 : ${params.flipY}`,
    `; Alternate direction    : ${params.alternateDirection}`,
    `; Safe Z                 : ${params.safeZ} mm`,
    `; Z-hop height / radius  : ${params.zHopHeight} / ${params.hopRadius} mm`,
    `; Skirt threshold        : ${params.skirtThreshold} mm`,
    `; Print speed            : ${params.printSpeed} mm/min`
      + (params.firstLayerSpeed > 0 ? `, first layer ${params.firstLayerSpeed}` : '')
      + (params.minLayerTime > 0 ? `, min layer time ${params.minLayerTime} s` : ''),
    `; Travel speed           : ${params.travelSpeed} mm/min`,
    `; Generate E             : ${params.generateE}`,
    filament
      ? `; E per mm               : ${ePerMM(params).toFixed(5)} (retract ${params.retractLength} mm)`
      : `; Extrusion multiplier   : ${params.extrusionMultiplier}`,
    filament
      ? `; Temperatures           : nozzle ${params.nozzleTemp} °C, bed ${params.bedTemp} °C, fan ${params.fanSpeed} % from layer ${params.fanFromLayer}`
      : `; Dwell / priming        : ${params.dwellAtStart} ms / ${params.primingMove ? `${params.primingLength} mm` : 'off'}`,
    '; ============================================================',
    `;LAYER_COUNT:${layerCount(params)}`,
    '',
  ].join('\n');
}

// ── Soft transition between layers ──────────────────────────────────────────

const MIN_STEP = 0.25;  // mm
// Below this the seam ramp counts as having reached the next layer's start;
// its first move absorbs the rest.
const JOIN_TOLERANCE = 0.05;  // mm

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
  m: Machine,
  feed: number,
): string[] {
  // Steps shorter than this would extrude less than E's printed resolution.
  const span = Math.hypot(to.x - from.x, to.y - from.y, zTo - zFrom);
  const nSteps = Math.min(Math.max(6, Math.ceil(transitionLength / 2)), Math.max(1, Math.ceil(span / MIN_STEP)));
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
    eRef.value += segD * ePerMM(params);
    const e = params.generateE ? eRef.value : undefined;
    lines.push(move(m, { x, y, z, e }, feed));
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

// ── Corner origin ───────────────────────────────────────────────────────────

/**
 * The toolpath moved so the bottom-left corner of the part's XY box sits at
 * (marginX, marginY) instead of its centre at (originX, originY), for beds whose origin is a
 * corner. Only the G-code moves; the preview keeps the toolpath centred.
 */
/** What the G-code adds to the toolpath's X and Y: zero unless the origin is the corner. */
export function gcodeOffset(toolpath: ToolpathLayer[], params: PrintParams): MM2 {
  if (params.gcodeOrigin !== 'corner') return { x: 0, y: 0 };
  let minX = Infinity, minY = Infinity;
  for (const layer of toolpath) {
    for (const path of layer.paths) {
      for (const p of path) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
      }
    }
  }
  return minX === Infinity ? { x: 0, y: 0 } : { x: params.marginX - minX, y: params.marginY - minY };
}

function toCornerOrigin(toolpath: ToolpathLayer[], params: PrintParams): ToolpathLayer[] {
  const { x: dx, y: dy } = gcodeOffset(toolpath, params);
  return toolpath.map(layer => ({
    ...layer,
    centroid: { x: layer.centroid.x + dx, y: layer.centroid.y + dy },
    paths: layer.paths.map(path => path.map(p => ({ x: p.x + dx, y: p.y + dy, z: p.z }))),
  }));
}

// ── Concentric skirt travel ──────────────────────────────────────────────────

/**
 * G-code lines for a concentric skirt arc from `from` → `to`.
 * Short hops (< skirtThreshold) fall back to a direct lift-travel-descend.
 * Longer hops orbit the layer centroid at radius max(rFrom, rTo).
 * The lift clears `topZ`, the highest bead printed so far (z-hop bumps and
 * Z oscillation can sit above the layer's base Z), and the descent lands on
 * the real Z of the next path's first point.
 * With a `floor`, the arc keeps X and Y at or above it: an orbit can swing
 * past the part's box (the corners of a square), which a corner-origin bed
 * may refuse. The lift already clears everything printed, so cutting the
 * arc along the box edge hits nothing.
 */
function buildSkirtTravel(
  from: MM2,
  to: ToolpathPoint,
  centroid: MM2,
  topZ: number,
  params: PrintParams,
  m: Machine,
  floor: MM2 | null,
  retract: number,
): string[] {
  const arcPts = skirtArcPoints(from, to, centroid, params.skirtThreshold);

  const lines: string[] = [];
  const e = m.e;
  if (retract > 0) lines.push(move(m, { e: e - retract }, params.retractSpeed, 'retract'));
  lines.push(move(m, { z: topZ + TRAVEL_CLEARANCE }, params.travelSpeed, 'lift'));

  if (!arcPts) {
    // Short hop — direct XY travel
    lines.push(move(m, { x: to.x, y: to.y }, params.travelSpeed, 'short hop'));
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
      const x = floor ? Math.max(pt.x, floor.x) : pt.x;
      const y = floor ? Math.max(pt.y, floor.y) : pt.y;
      lines.push(move(m, { x, y }, params.travelSpeed));
    }
  }

  lines.push(move(m, { z: to.z }, params.travelSpeed, 'descend'));
  if (retract > 0) lines.push(move(m, { e }, params.retractSpeed, 'unretract'));
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
  m: Machine,
  feed: number,
): string[] {
  const lines: string[] = [];

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const d = dist(prev.x, prev.y, curr.x, curr.y);
    if (d < 1e-6) continue;

    eRef.value += d * ePerMM(params);
    const zChanged = Math.abs(curr.z - zRef.value) > 0.001;
    if (zChanged) zRef.value = curr.z;

    lines.push(move(m, {
      x: curr.x,
      y: curr.y,
      z: zChanged ? curr.z : undefined,
      e: params.generateE ? eRef.value : undefined,
    }, feed));
  }

  return lines;
}

// ── Machine templates and pacing ─────────────────────────────────────────────

export const TEMPLATE_VARS = [
  'nozzleTemp', 'bedTemp', 'bedX', 'bedY', 'bedZ', 'firstLayerZ', 'topZ', 'parkZ',
  'minX', 'maxX', 'minY', 'maxY',
] as const;

/** Names in the start and end templates that have no value. */
export function unknownTemplateVars(params: PrintParams): string[] {
  const known = new Set<string>(TEMPLATE_VARS);
  const names = [...`${params.startGcode}\n${params.endGcode}`.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
  return [...new Set(names.filter(n => !known.has(n)))];
}

function fillTemplate(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (all, k: string) => k in vars ? String(vars[k]) : all);
}

/** Printed length of a layer, mm. */
export function layerLength(layer: ToolpathLayer): number {
  let len = 0;
  for (const path of layer.paths) {
    for (let i = 1; i < path.length; i++) len += dist(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y);
  }
  return len;
}

/**
 * Print feed of each layer, mm/min: the first-layer speed on layer 0, and
 * slower when a layer would take less than minLayerTime.
 */
export function layerFeeds(toolpath: ToolpathLayer[], params: PrintParams): number[] {
  return toolpath.map((layer, li) => {
    const base = li === 0 && params.firstLayerSpeed > 0 ? params.firstLayerSpeed : params.printSpeed;
    if (params.minLayerTime <= 0) return base;
    const capped = layerLength(layer) / params.minLayerTime * 60;
    return capped < base ? Math.max(1, Math.round(capped)) : base;
  });
}

// ── Layer markers ────────────────────────────────────────────────────────────

/**
 * Comments that tell slicer viewers where a layer starts: `;LAYER:` for Cura,
 * `;LAYER_CHANGE` / `;Z:` / `;HEIGHT:` for PrusaSlicer and its forks.
 * Without them a viewer guesses layers from Z, and every point of a z-hop,
 * the seam ramp or the Z wave sits at a Z of its own, so the line shows cut
 * into pieces there although the nozzle never stops extruding.
 */
function layerMarkers(index: number, z: number, height: number): string {
  return `;LAYER_CHANGE\n;Z:${fmt(z)}\n;HEIGHT:${height}\n;LAYER:${index}`;
}

// ── Main entry point ─────────────────────────────────────────────────────────

export interface GcodeProgram {
  text: string;
  stats: GcodeStats;
}

export function generateGcode(
  centred: ToolpathLayer[],
  params: PrintParams,
): GcodeProgram {
  const m = newMachine();
  if (centred.length === 0) return { text: '; No layers to generate.\n', stats: statsOf(m) };
  const corner = params.gcodeOrigin === 'corner';
  const toolpath = corner ? toCornerOrigin(centred, params) : centred;
  const floor = corner ? { x: params.marginX, y: params.marginY } : null;
  const filament = params.material === 'filament';
  const retract = filament && params.generateE ? params.retractLength : 0;
  const feeds = layerFeeds(toolpath, params);

  const blocks: string[] = [];

  // M82 guards against a relative-E mode left over from a previous job; it is
  // skipped for motion-only output, where controllers may reject E-axis codes.
  // It comes after the start template, whose purge may leave E anywhere.
  blocks.push(
    'G21       ; mm units\nG90       ; absolute positioning\n' +
    (params.generateE ? 'M82       ; absolute extrusion\n' : '') +
    'G92 E0    ; reset E\n' +
    (params.accel > 0
      ? (params.firmware === 'klipper' ? `SET_VELOCITY_LIMIT ACCEL=${params.accel}\n` : `M204 S${params.accel}  ; acceleration\n`)
      : '') +
    (filament ? 'M107      ; fan off for the first layers\n' : ''),
  );
  blocks.push(`${move(m, { z: params.safeZ }, params.travelSpeed, 'safe Z')}\n`);

  const eRef = { value: 0 };
  const zRef = { value: params.safeZ };
  let isFirstMove = true;
  let joined = false;  // arrived at this path through a soft transition

  if (params.primingMove) {
    const pz = toolpath[0].z;
    const { x: px, y: py } = primingStart(toolpath[0]);
    blocks.push(
      `; --- Priming ---\n` +
      `${move(m, { x: px, y: py }, params.travelSpeed)}\n` +
      `${move(m, { z: pz }, params.travelSpeed)}\n`,
    );
    eRef.value += params.primingLength * ePerMM(params);
    const e = params.generateE ? eRef.value : undefined;
    blocks.push(
      `${move(m, { x: px + params.primingLength, y: py, e }, params.printSpeed)}\n` +
      `${move(m, { z: params.safeZ }, params.travelSpeed)}\n; --- End priming ---\n`,
    );
  }

  const topZ: number[] = [];
  let top = -Infinity;
  for (const layer of toolpath) {
    for (const path of layer.paths) for (const p of path) top = Math.max(top, p.z);
    topZ.push(top);
  }
  const fanLayer = Math.max(0, Math.round(params.fanFromLayer) - 1);

  let cur: MM2 = { x: params.originX, y: params.originY };

  for (let li = 0; li < toolpath.length; li++) {
    const layer = toolpath[li];
    const nextLayer = toolpath[li + 1] ?? null;
    const feed = feeds[li];

    blocks.push(`\n; ===== Layer ${li + 1} / ${toolpath.length}   Z = ${fmt(layer.z)} mm =====`);
    blocks.push(layerMarkers(li, layer.z, params.layerHeight));
    if (filament && params.fanSpeed > 0 && li === fanLayer) {
      blocks.push(`M106 S${Math.round(Math.min(100, params.fanSpeed) * 2.55)}  ; fan ${params.fanSpeed} %`);
    }
    if (feed !== params.printSpeed && (li === 0 || feed !== feeds[li - 1])) blocks.push(`; Print speed ${feed} mm/min`);
    if (layer.crossings > 0) {
      blocks.push(`; Z-hop: ${layer.crossings} crossing(s) detected`);
    }

    for (let pi = 0; pi < layer.paths.length; pi++) {
      const pts = layer.paths[pi];
      const start = pts[0];

      blocks.push(`; --- Layer ${li + 1}, Path ${pi + 1} ---`);

      if (isFirstMove) {
        blocks.push(move(m, { x: start.x, y: start.y }, params.travelSpeed, 'travel to start'));
        blocks.push(move(m, { z: start.z }, params.travelSpeed, 'descend'));
        zRef.value = start.z;
        if (params.dwellAtStart > 0) blocks.push(dwell(m, params.dwellAtStart));
      } else if (!joined) {
        const skirtLines = buildSkirtTravel(cur, start, layer.centroid, topZ[li], params, m, floor, retract);
        blocks.push(skirtLines.join('\n'));
        zRef.value = start.z;
      }

      blocks.push(pathToGcode(pts, params, eRef, zRef, m, feed).join('\n'));
      isFirstMove = false;
      joined = false;
      cur = pts[pts.length - 1];

      if (params.softJoin && nextLayer !== null && pi === layer.paths.length - 1) {
        const next = nextLayer.paths[0]?.[0];
        const gap = next ? dist(cur.x, cur.y, next.x, next.y) : Infinity;
        if (next && gap <= params.transitionLength) {
          if (Math.hypot(gap, next.z - zRef.value) > JOIN_TOLERANCE) {
            const tLines = buildTransition(
              cur, next, zRef.value, next.z, params.transitionLength, params, eRef, m, feed,
            );
            zRef.value = next.z;
            blocks.push(tLines.join('\n'));
          }
          joined = true;
        }
      }
    }
  }

  blocks.push('\n; ===== End =====');
  const partTop = topZ[topZ.length - 1];
  const lift = Math.max(params.safeZ, partTop) + FINAL_CLEARANCE;
  // A machine refuses moves past its Z travel; any lift above the part will do.
  const finalZ = params.bedZ > partTop ? Math.min(lift, params.bedZ) : lift;
  blocks.push(move(m, { z: finalZ }, params.travelSpeed, 'final lift'));

  const box = m.box;
  const vars: Record<string, string | number> = {
    nozzleTemp: params.nozzleTemp, bedTemp: params.bedTemp,
    bedX: params.bedX, bedY: params.bedShape === 'circle' ? params.bedX : params.bedY, bedZ: params.bedZ,
    firstLayerZ: fmt(toolpath[0].z), topZ: fmt(partTop), parkZ: fmt(finalZ),
    minX: fmt(box.minX), maxX: fmt(box.maxX), minY: fmt(box.minY), maxY: fmt(box.maxY),
  };
  if (params.endGcode.trim()) blocks.push('; --- End G-code ---', fillTemplate(params.endGcode.trimEnd(), vars));
  else blocks.push('M84  ; disable motors');

  const head = [buildHeader(params, box)];
  if (params.startGcode.trim()) head.push(`; --- Start G-code ---\n${fillTemplate(params.startGcode.trimEnd(), vars)}\n; --- End of start G-code ---`);

  return { text: [...head, ...blocks].join('\n'), stats: statsOf(m) };
}

// ── Download helper ──────────────────────────────────────────────────────────

export function downloadGcode(gcode: string, filename = 'barrocode.gcode'): void {
  const blob = new Blob([gcode], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
