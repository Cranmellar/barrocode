/**
 * Lissajous Wave Generator
 *
 * The extruder traces a Lissajous figure in its own local reference frame
 * (T = tangent, N = normal) while following the SVG centerline globally.
 *
 * Combined toolpath point at arc length s, layer li:
 *
 *   phase_base = lissPhaseOffset + li * phaseShiftPerLayer
 *   offset_N   = ampN * sin( 2π·s / wlN  +  lissDelta  +  phase_base )
 *   offset_T   = ampT * sin( 2π·s / wlT              +  phase_base )
 *   point      = centerline(s) + N(s)·offset_N + T(s)·offset_T
 *
 * If keyframes are provided, ampN/ampT/wlN/wlT/delta/centerX/Y/scaleX/Y are
 * interpolated along the flattened trajectory (t ∈ [0,1] across all layers).
 * Scale is applied per-point in SVG space around the interpolated center.
 */

import type {
  SampledPath, SampledPoint, WavePoint, WaveLayer, PrintParams, WaveKeyframe,
} from '../types';

const TWO_PI = 2 * Math.PI;

// ── Local params struct ─────────────────────────────────────────────────────

export interface LocalParams {
  ampN: number; ampT: number; ampZ: number;
  wlN: number;  wlT: number;  wlZ: number;
  delta: number;
  phaseZ: number;
  centerX: number; centerY: number;  // mm
  scaleX:  number; scaleY:  number;  // multipliers
}

// ── Keyframe interpolation ──────────────────────────────────────────────────

function baseToLocal(base: PrintParams): LocalParams {
  return {
    ampN: base.lissAmpN, ampT: base.lissAmpT, ampZ: base.lissAmpZ,
    wlN:  base.lissWlN,  wlT:  base.lissWlT,  wlZ:  base.lissWlZ,
    delta: base.lissDelta,
    phaseZ: base.lissPhaseZ,
    centerX: base.centerX, centerY: base.centerY,
    scaleX:  base.scaleX,  scaleY:  base.scaleY,
  };
}

function kfToLocal(k: WaveKeyframe, base: PrintParams): LocalParams {
  return {
    ampN: k.ampN, ampT: k.ampT, ampZ: k.ampZ ?? base.lissAmpZ,
    wlN:  k.wlN,  wlT:  k.wlT,  wlZ:  k.wlZ  ?? base.lissWlZ,
    delta: k.delta,
    phaseZ: k.phaseZ ?? base.lissPhaseZ,
    centerX: k.centerX ?? base.centerX,
    centerY: k.centerY ?? base.centerY,
    scaleX:  k.scaleX  ?? base.scaleX,
    scaleY:  k.scaleY  ?? base.scaleY,
  };
}

function lerpLocal(loF: LocalParams, hiF: LocalParams, alpha: number): LocalParams {
  const lerp = (a: number, b: number) => a + (b - a) * alpha;
  return {
    ampN:    lerp(loF.ampN,    hiF.ampN),
    ampT:    lerp(loF.ampT,    hiF.ampT),
    ampZ:    lerp(loF.ampZ,    hiF.ampZ),
    wlN:     Math.max(0.1, lerp(loF.wlN,  hiF.wlN)),
    wlT:     Math.max(0.1, lerp(loF.wlT,  hiF.wlT)),
    wlZ:     Math.max(0.1, lerp(loF.wlZ,  hiF.wlZ)),
    delta:   lerp(loF.delta,   hiF.delta),
    phaseZ:  lerp(loF.phaseZ,  hiF.phaseZ),
    centerX: lerp(loF.centerX, hiF.centerX),
    centerY: lerp(loF.centerY, hiF.centerY),
    scaleX:  lerp(loF.scaleX,  hiF.scaleX),
    scaleY:  lerp(loF.scaleY,  hiF.scaleY),
  };
}

// Point lookup for arbitrary t — used by Preview2D for the timeline indicator.
export function getParamsAtT(
  t: number,
  keyframes: WaveKeyframe[],
  base: PrintParams,
): LocalParams {
  if (keyframes.length === 0) return baseToLocal(base);

  const sorted = [...keyframes].sort((a, b) => a.t - b.t);
  const expanded = sorted.map(k => kfToLocal(k, base));

  if (t <= sorted[0].t) return expanded[0];
  if (t >= sorted[sorted.length - 1].t) return expanded[sorted.length - 1];

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].t <= t && t <= sorted[i + 1].t) {
      const alpha = (sorted[i + 1].t - sorted[i].t) > 0
        ? (t - sorted[i].t) / (sorted[i + 1].t - sorted[i].t)
        : 0;
      return lerpLocal(expanded[i], expanded[i + 1], alpha);
    }
  }
  return expanded[expanded.length - 1];
}

// Sampler for monotonically increasing t — avoids O(n log n) sort per point.
// Call once before a layer loop, then call the returned function for each point.
export function createKeyframeSampler(
  keyframes: WaveKeyframe[],
  base: PrintParams,
): (t: number) => LocalParams {
  const baseFull = baseToLocal(base);
  if (keyframes.length === 0) return () => baseFull;

  const sorted = [...keyframes].sort((a, b) => a.t - b.t);
  const expanded = sorted.map(k => kfToLocal(k, base));
  let cursor = 0;

  return (t: number): LocalParams => {
    if (t <= sorted[0].t) return expanded[0];
    if (t >= sorted[sorted.length - 1].t) return expanded[sorted.length - 1];

    // Advance cursor forward — valid only for monotonically increasing t.
    while (cursor < sorted.length - 2 && t > sorted[cursor + 1].t) cursor++;

    const alpha = (sorted[cursor + 1].t - sorted[cursor].t) > 0
      ? (t - sorted[cursor].t) / (sorted[cursor + 1].t - sorted[cursor].t)
      : 0;
    return lerpLocal(expanded[cursor], expanded[cursor + 1], alpha);
  };
}

// ── Single-point Lissajous offset ───────────────────────────────────────────

function lissajousPoint(
  p: SampledPoint,
  ampN: number,
  ampT: number,
  ampZ: number,
  wlN: number,
  wlT: number,
  wlZ: number,
  delta: number,
  phaseZ: number,
  phaseBase: number,
): WavePoint {
  const s = p.arcLength;
  const phaseN = TWO_PI * (s / wlN) + delta + phaseBase;
  const phaseT = TWO_PI * (s / wlT)         + phaseBase;
  const oN = ampN * Math.sin(phaseN);
  const oT = ampT * Math.sin(phaseT);
  const zOffset = ampZ * Math.sin(TWO_PI * (s / wlZ) + phaseZ + phaseBase);
  return {
    x: p.x + p.normalX * oN + p.tangentX * oT,
    y: p.y + p.normalY * oN + p.tangentY * oT,
    zOffset,
  };
}

// ── Scale-around-center in SVG space ────────────────────────────────────────
//
// The center is given in mm; we convert to SVG units then apply the scale.
// This correctly round-trips through svgToMM(pt, sf, ox, oy, flipY, svgH).
//
//   svgCX = (centerX_mm - originX) / sf
//   svgCY = flipY ? (svgH - (centerY_mm - originY) / sf) : (centerY_mm - originY) / sf
//
// Proof: applying scaleX around svgCX and then svgToMM gives
//   x_out_mm = centerX_mm + (x_in_mm - centerX_mm) * scaleX   ✓

function applyScaleSVG(
  pt: WavePoint,
  centerX: number,   // mm
  centerY: number,   // mm
  scaleX: number,
  scaleY: number,
  sf: number,        // scaleFactor
  originX: number,
  originY: number,
  flipY: boolean,
  svgH: number,
): WavePoint {
  if (scaleX === 1 && scaleY === 1) return pt;
  const cxSVG = (centerX - originX) / sf;
  const cySVG = flipY
    ? svgH - (centerY - originY) / sf
    : (centerY - originY) / sf;
  return {
    x: cxSVG + (pt.x - cxSVG) * scaleX,
    y: cySVG + (pt.y - cySVG) * scaleY,
    zOffset: pt.zOffset,
  };
}

// ── All layers ───────────────────────────────────────────────────────────────

export function generateWaveLayers(
  sampledPaths: SampledPath[],
  params: PrintParams,
  keyframes: WaveKeyframe[] = [],
  svgHeight = 0,  // required when scaleX/Y may differ from 1
): WaveLayer[] {
  const enabled = sampledPaths.filter(p => p.enabled);
  if (enabled.length === 0) return [];

  const numLayers = params.useNumLayers
    ? params.numLayers
    : Math.max(1, Math.ceil(params.totalHeight / params.layerHeight));

  const sf = params.scaleFactor > 0 ? params.scaleFactor : 1;

  let totalFlatPoints = 0;
  for (let li = 0; li < numLayers; li++) {
    for (const path of enabled) {
      totalFlatPoints += path.points.length;
      if (params.closePath && path.points.length > 1) totalFlatPoints += 1;
    }
  }
  const tDenom = Math.max(1, totalFlatPoints - 1);

  const useKeyframes = keyframes.length > 0;
  const kfSampler = useKeyframes ? createKeyframeSampler(keyframes, params) : null;
  let flatIdx = 0;

  const layers: WaveLayer[] = [];

  for (let li = 0; li < numLayers; li++) {
    const z = li * params.layerHeight + params.nozzleHeightOffset;
    const phaseBase = params.lissPhaseOffset + li * params.phaseShiftPerLayer;

    const isAlt = params.alternateDirection && li % 2 === 1;
    const reverse = params.reversePath !== isAlt;

    const pathPoints: WavePoint[][] = enabled.map(path => {
      const pts = reverse ? [...path.points].reverse() : path.points;

      const result: WavePoint[] = pts.map(p => {
        const s = reverse ? path.totalLength - p.arcLength : p.arcLength;
        const adjusted: SampledPoint = { ...p, arcLength: s };

        let lp: LocalParams;
        if (kfSampler) {
          lp = kfSampler(flatIdx / tDenom);
        } else {
          lp = {
            ampN: (path.ampNOverride ?? params.lissAmpN) / sf,
            ampT: (path.ampTOverride ?? params.lissAmpT) / sf,
            ampZ: params.lissAmpZ,  // Z amplitude stays in mm (not scaled by sf)
            wlN:  (path.wlNOverride  ?? params.lissWlN)  / sf,
            wlT:  (path.wlTOverride  ?? params.lissWlT)  / sf,
            wlZ:  params.lissWlZ / sf,
            delta: params.lissDelta,
            phaseZ: params.lissPhaseZ,
            centerX: params.centerX, centerY: params.centerY,
            scaleX:  params.scaleX,  scaleY:  params.scaleY,
          };
        }
        flatIdx++;

        const aN = useKeyframes ? lp.ampN / sf : lp.ampN;
        const aT = useKeyframes ? lp.ampT / sf : lp.ampT;
        const aZ = lp.ampZ;  // always mm — not converted to SVG units
        const wN = useKeyframes ? lp.wlN  / sf : lp.wlN;
        const wT = useKeyframes ? lp.wlT  / sf : lp.wlT;
        const wZ = useKeyframes ? lp.wlZ  / sf : lp.wlZ;

        const wavePt = lissajousPoint(
          adjusted, aN, aT, aZ, wN, wT, wZ, lp.delta, lp.phaseZ, phaseBase,
        );

        // Apply per-point scale around center (in SVG space)
        return applyScaleSVG(
          wavePt,
          lp.centerX, lp.centerY,
          lp.scaleX,  lp.scaleY,
          sf, params.originX, params.originY, params.flipY, svgHeight,
        );
      });

      if (params.closePath && result.length > 1) {
        const a = result[0], b = result[result.length - 1];
        if (Math.hypot(a.x - b.x, a.y - b.y) > 0.001) {
          result.push({ ...a });
          flatIdx++;
        }
      }

      return result;
    });

    layers.push({ index: li, z, paths: pathPoints });
  }

  return layers;
}

// ── Coordinate conversion ────────────────────────────────────────────────────
// Scale-around-center is now handled inside generateWaveLayers, so svgToMM
// is a pure SVG→mm projection: scaleFactor, origin offset, optional Y-flip.

export function svgToMM(
  pt: { x: number; y: number },
  scaleFactor: number,
  originX: number,
  originY: number,
  flipY: boolean,
  svgHeight: number,
): { x: number; y: number } {
  const x = pt.x * scaleFactor + originX;
  const y = flipY
    ? (svgHeight - pt.y) * scaleFactor + originY
    : pt.y * scaleFactor + originY;
  return { x, y };
}

// ── Lissajous preview figure ─────────────────────────────────────────────────

export function computeLissajousFigure(
  lissAmpN: number,
  lissAmpT: number,
  lissWlN: number,
  lissWlT: number,
  lissDelta: number,
  totalArc: number,
  numPoints = 600,
): Array<{ t: number; n: number }> {
  const pts: Array<{ t: number; n: number }> = [];
  for (let i = 0; i <= numPoints; i++) {
    const s = (i / numPoints) * totalArc;
    const phaseN = TWO_PI * (s / lissWlN) + lissDelta;
    const phaseT = TWO_PI * (s / lissWlT);
    pts.push({
      n: lissAmpN * Math.sin(phaseN),
      t: lissAmpT * Math.sin(phaseT),
    });
  }
  return pts;
}
