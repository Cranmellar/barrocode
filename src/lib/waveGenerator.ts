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
 * If keyframes are provided, ampN/ampT/wlN/wlT/delta are interpolated along
 * the flattened trajectory (t ∈ [0,1] across all layers).
 */

import type {
  SampledPath, SampledPoint, WavePoint, WaveLayer, PrintParams, WaveKeyframe,
} from '../types';

const TWO_PI = 2 * Math.PI;

// ── Local params struct ─────────────────────────────────────────────────────

interface LocalParams {
  ampN: number; ampT: number;
  wlN: number;  wlT: number;
  delta: number;
}

// ── Keyframe interpolation ──────────────────────────────────────────────────

function getParamsAtT(
  t: number,
  keyframes: WaveKeyframe[],
  base: PrintParams,
): LocalParams {
  if (keyframes.length === 0) {
    return {
      ampN: base.lissAmpN, ampT: base.lissAmpT,
      wlN:  base.lissWlN,  wlT:  base.lissWlT,
      delta: base.lissDelta,
    };
  }

  const sorted = [...keyframes].sort((a, b) => a.t - b.t);

  if (t <= sorted[0].t) {
    const k = sorted[0];
    return { ampN: k.ampN, ampT: k.ampT, wlN: k.wlN, wlT: k.wlT, delta: k.delta };
  }
  if (t >= sorted[sorted.length - 1].t) {
    const k = sorted[sorted.length - 1];
    return { ampN: k.ampN, ampT: k.ampT, wlN: k.wlN, wlT: k.wlT, delta: k.delta };
  }

  // Find bracket
  let lo = sorted[0], hi = sorted[1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].t <= t && t <= sorted[i + 1].t) {
      lo = sorted[i]; hi = sorted[i + 1]; break;
    }
  }

  const alpha = (hi.t - lo.t) > 0 ? (t - lo.t) / (hi.t - lo.t) : 0;
  const lerp  = (a: number, b: number) => a + (b - a) * alpha;

  return {
    ampN:  lerp(lo.ampN,  hi.ampN),
    ampT:  lerp(lo.ampT,  hi.ampT),
    wlN:   Math.max(0.1, lerp(lo.wlN,  hi.wlN)),
    wlT:   Math.max(0.1, lerp(lo.wlT,  hi.wlT)),
    delta: lerp(lo.delta, hi.delta),
  };
}

// ── Single-point Lissajous offset ───────────────────────────────────────────

function lissajousPoint(
  p: SampledPoint,
  ampN: number,
  ampT: number,
  wlN: number,
  wlT: number,
  delta: number,
  phaseBase: number,
): WavePoint {
  const s = p.arcLength;
  const phaseN = TWO_PI * (s / wlN) + delta + phaseBase;
  const phaseT = TWO_PI * (s / wlT)         + phaseBase;
  const oN = ampN * Math.sin(phaseN);
  const oT = ampT * Math.sin(phaseT);
  return {
    x: p.x + p.normalX  * oN + p.tangentX * oT,
    y: p.y + p.normalY  * oN + p.tangentY * oT,
  };
}

// ── All layers ───────────────────────────────────────────────────────────────

export function generateWaveLayers(
  sampledPaths: SampledPath[],
  params: PrintParams,
  keyframes: WaveKeyframe[] = [],
): WaveLayer[] {
  const enabled = sampledPaths.filter(p => p.enabled);
  if (enabled.length === 0) return [];

  const numLayers = params.useNumLayers
    ? params.numLayers
    : Math.max(1, Math.ceil(params.totalHeight / params.layerHeight));

  const sf = params.scaleFactor > 0 ? params.scaleFactor : 1;

  // Pre-count total flat points for keyframe t-mapping.
  // Each path contributes its point count; closePath adds one extra if needed.
  let totalFlatPoints = 0;
  for (let li = 0; li < numLayers; li++) {
    for (const path of enabled) {
      totalFlatPoints += path.points.length;
      if (params.closePath && path.points.length > 1) totalFlatPoints += 1;
    }
  }
  const tDenom = Math.max(1, totalFlatPoints - 1);

  const useKeyframes = keyframes.length > 0;
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
        if (useKeyframes) {
          const t = flatIdx / tDenom;
          lp = getParamsAtT(t, keyframes, params);
        } else {
          // Per-path overrides fall back to global values.
          lp = {
            ampN: (path.ampNOverride ?? params.lissAmpN) / sf,
            ampT: (path.ampTOverride ?? params.lissAmpT) / sf,
            wlN:  (path.wlNOverride  ?? params.lissWlN)  / sf,
            wlT:  (path.wlTOverride  ?? params.lissWlT)  / sf,
            delta: params.lissDelta,
          };
        }
        flatIdx++;

        // When keyframes active, divide by sf to convert mm → SVG units
        const aN = useKeyframes ? lp.ampN / sf : lp.ampN;
        const aT = useKeyframes ? lp.ampT / sf : lp.ampT;
        const wN = useKeyframes ? lp.wlN  / sf : lp.wlN;
        const wT = useKeyframes ? lp.wlT  / sf : lp.wlT;

        return lissajousPoint(adjusted, aN, aT, wN, wT, lp.delta, phaseBase);
      });

      // Optionally close path.
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

export function svgToMM(
  pt: WavePoint,
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
