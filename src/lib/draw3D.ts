/**
 * Canvas drawing for the 3D trajectory preview (orthographic projection).
 *
 * Pure functions of the scene: Preview2D owns state and interaction and
 * calls these from its draw effects.
 */

import type { SampledPath, PrintParams, WaveKeyframe } from '../types';
import { svgToMM, getParamsAtT } from './waveGenerator';
import type { ToolpathLayer } from './toolpath';
import { skirtArcPoints, type MM2 } from './skirtUtils';

export interface View3D {
  azimuth: number;
  elevation: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

// Mirrors --ink in index.css; canvas can't read CSS variables.
const INK = '#1C1C1C';

// Vivid palette: cobalt-blue (bottom) → warm terracotta (top)
export function layerColor(index: number, total: number, alpha = 1): string {
  const t = total <= 1 ? 0 : index / (total - 1);
  const hue = Math.round(218 - 198 * t);   // 218 (cobalt) → 20 (terracotta)
  const sat = 72 + t * 16;                  // 72 % → 88 %
  const lit = 50 + t * 12;                  // 50 % → 62 %
  return `hsla(${hue},${sat.toFixed(0)}%,${lit.toFixed(0)}%,${alpha})`;
}

// A keyframe takes the layer hue at its position, at a fixed lightness so its
// dark number stays legible on every hue (the gradient passes through yellow).
export function keyframeColor(t: number): string {
  return `hsl(${Math.round(218 - 198 * t)},${Math.round(72 + t * 16)}%,62%)`;
}

// At az = 0 the camera looks along +Y: X to the right, Y away, Z up.
// `ry` is depth towards the viewer; its sign keeps the view right-handed,
// so the preview is never a mirror image of the print.
export function project(x: number, y: number, z: number, az: number, el: number): [number, number] {
  return makeProjector(az, el)(x, y, z);
}

// Same as project with the camera trig computed once, for per-point loops.
export function makeProjector(az: number, el: number): (x: number, y: number, z: number) => [number, number] {
  const A = az * Math.PI / 180;
  const E = el * Math.PI / 180;
  const cosA = Math.cos(A), sinA = Math.sin(A), cosE = Math.cos(E), sinE = Math.sin(E);
  return (x, y, z) => {
    const rx = x * cosA + y * sinA;
    const ry = x * sinA - y * cosA;
    return [rx, ry * sinE - z * cosE];
  };
}

// Safe min/max over an array of any size — avoids the V8 spread-argument
// stack-overflow that kills Math.min(...largeArray) above ~65 K elements.
export function boundsOf<T>(
  arr: T[],
  x: (v: T) => number,
  y: (v: T) => number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const v of arr) {
    const vx = x(v), vy = y(v);
    if (vx < minX) minX = vx;
    if (vx > maxX) maxX = vx;
    if (vy < minY) minY = vy;
    if (vy > maxY) maxY = vy;
  }
  return { minX, maxX, minY, maxY };
}

export interface FlatPoint { x: number; y: number; z: number; layerIndex: number }

export function flattenPoints(toolpath: ToolpathLayer[]): FlatPoint[] {
  const pts: FlatPoint[] = [];
  for (const layer of toolpath) {
    for (const path of layer.paths) {
      for (const p of path) pts.push({ ...p, layerIndex: layer.index });
    }
  }
  return pts;
}

export interface Scene {
  view: View3D;
  toolpath: ToolpathLayer[];
  flatPoints: FlatPoint[];
  modelBounds: { minX: number; maxX: number; minY: number; maxY: number } | null;
  sampledPaths: SampledPath[];
  params: PrintParams;
  svgH: number;
  keyframes: WaveKeyframe[];
  selectedKfId: string | null;
  timelineProgress: number;
  isInteracting: boolean;
  // Highest visible layer index; with layerSolo, only that layer is drawn
  // in colour and the ones below it as faint context.
  layerCap: number;
  layerSolo: boolean;
  // false: every layer in one colour instead of the cobalt → terracotta ramp.
  layerColors: boolean;
  showDims: boolean;
}

// What drawGeometry reads. It excludes the timeline, so a scrub can reuse a
// cached drawing of it.
export type GeometryScene = Pick<Scene,
  'view' | 'toolpath' | 'params' | 'isInteracting' | 'layerCap' | 'layerSolo' | 'layerColors'>;

function screenMapper(view: View3D): (x: number, y: number, z: number) => [number, number] {
  const { azimuth, elevation, scale, offsetX, offsetY } = view;
  const proj = makeProjector(azimuth, elevation);
  return (x, y, z) => {
    const [px, py] = proj(x, y, z);
    return [offsetX + px * scale, offsetY + py * scale];
  };
}

export type MarkerScene = Pick<Scene,
  'view' | 'flatPoints' | 'keyframes' | 'selectedKfId' | 'layerCap' | 'layerSolo'>;

export interface KeyframeMarker { kf: WaveKeyframe; number: number; x: number; y: number; r: number }

// Screen position of each visible keyframe diamond, in drawing order (the
// last one is on top).
export function keyframeMarkers(scene: MarkerScene): KeyframeMarker[] {
  const { view, flatPoints: flat, keyframes, selectedKfId, layerCap, layerSolo } = scene;
  if (flat.length === 0) return [];
  const toScreen = screenMapper(view);
  const markers: KeyframeMarker[] = [];
  [...keyframes].sort((a, b) => a.t - b.t).forEach((kf, i) => {
    const pt = flat[Math.min(flat.length - 1, Math.round(kf.t * (flat.length - 1)))];
    if (layerSolo ? pt.layerIndex !== layerCap : pt.layerIndex > layerCap) return;
    const [x, y] = toScreen(pt.x, pt.y, pt.z);
    markers.push({ kf, number: i + 1, x, y, r: kf.id === selectedKfId ? 14 : 12 });
  });
  return markers;
}

// The topmost keyframe diamond under a screen point, if any.
export function keyframeAt(scene: MarkerScene, x: number, y: number): WaveKeyframe | null {
  const markers = keyframeMarkers(scene);
  for (let i = markers.length - 1; i >= 0; i--) {
    const m = markers[i];
    if (Math.abs(x - m.x) + Math.abs(y - m.y) <= m.r + 2) return m.kf;
  }
  return null;
}

/**
 * Draws the scene. `geometry`, when given, is a device-pixel canvas holding
 * drawGeometry's output for this scene and is copied instead of redrawn.
 */
export function drawScene(
  ctx: CanvasRenderingContext2D, W: number, H: number, scene: Scene,
  geometry?: CanvasImageSource,
) {
  const {
    view, toolpath, flatPoints, modelBounds, sampledPaths, params, svgH,
    keyframes, selectedKfId, timelineProgress, isInteracting, layerColors, showDims,
  } = scene;
  const { azimuth, elevation } = view;

  ctx.fillStyle = '#EDEDED';
  ctx.fillRect(0, 0, W, H);

  const toScreen = screenMapper(view);

  const flat = flatPoints;
  const numLayers = toolpath.length;

  // Ground grid
  if (modelBounds && elevation > 5) {
    const { minX: flatMinX, maxX: flatMaxX, minY: flatMinY, maxY: flatMaxY } = modelBounds;
    const cx = (flatMinX + flatMaxX) / 2;
    const cy = (flatMinY + flatMaxY) / 2;
    const r  = Math.max(flatMaxX - flatMinX, flatMaxY - flatMinY) * 0.65;
    const step = r > 80 ? 20 : r > 30 ? 10 : 5;
    ctx.save();
    // Solid, at the ink coverage the old 8/6 dash had (0.22 × 8/14).
    ctx.strokeStyle = 'rgba(110, 110, 110, 0.13)';
    ctx.lineWidth = 0.9;
    for (let gx = Math.floor((cx - r) / step) * step; gx <= cx + r; gx += step) {
      ctx.beginPath();
      const [x0, y0] = toScreen(gx, cy - r, 0);
      const [x1, y1] = toScreen(gx, cy + r, 0);
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    for (let gy = Math.floor((cy - r) / step) * step; gy <= cy + r; gy += step) {
      ctx.beginPath();
      const [x0, y0] = toScreen(cx - r, gy, 0);
      const [x1, y1] = toScreen(cx + r, gy, 0);
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.restore();
  }

  // Center axis — dashed vertical line through the scale pivot
  if (numLayers > 0) {
    // Use the interpolated center at the current timeline position
    const lp = getParamsAtT(timelineProgress, keyframes, params);
    const cxMM = lp.centerX, cyMM = lp.centerY;
    const maxZ = toolpath[numLayers - 1].z + params.layerHeight;
    const [cx0, cy0] = toScreen(cxMM, cyMM, 0);
    const [cx1, cy1] = toScreen(cxMM, cyMM, maxZ);
    ctx.save();
    ctx.strokeStyle = 'rgba(16,14,9,0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.lineTo(cx1, cy1); ctx.stroke();
    // Base crosshair
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx0 - 6, cy0); ctx.lineTo(cx0 + 6, cy0);
    ctx.moveTo(cx0, cy0 - 6); ctx.lineTo(cx0, cy0 + 6);
    ctx.stroke();
    // Label
    ctx.font = '700 8px GSCode, monospace';
    ctx.fillStyle = 'rgba(16,14,9,0.45)';
    ctx.textAlign = 'left';
    ctx.fillText(`C (${cxMM.toFixed(1)}, ${cyMM.toFixed(1)})`, cx0 + 8, cy0 - 4);
    ctx.restore();
  }

  // Layer strokes and their overlays, from the cache when one is given.
  if (geometry) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(geometry, 0, 0);
    ctx.restore();
  } else {
    drawGeometry(ctx, scene);
  }

  if (showDims && modelBounds && numLayers > 0) {
    drawDimensions(ctx, view, flat, modelBounds, numLayers * params.layerHeight);
  }

  // Virtual extruder
  if (flat.length > 0 && numLayers > 0) {
    const idx = Math.min(flat.length - 1, Math.floor(timelineProgress * (flat.length - 1)));
    const pt  = flat[idx];
    const [ex, ey] = toScreen(pt.x, pt.y, pt.z);
    const [fx, fy] = toScreen(pt.x, pt.y, 0);

    ctx.save();
    ctx.strokeStyle = 'rgba(50,50,50,0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.restore();

    // Dark square like the timeline thumb, so it never reads as a keyframe.
    ctx.save();
    ctx.fillStyle   = INK;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 2.5;
    ctx.beginPath();
    ctx.rect(ex - 6, ey - 6, 12, 12);
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // Clear of the selected keyframe diamond (radius 14) that sits on the extruder.
    ctx.save();
    ctx.font = '700 9px GSCode, monospace';
    ctx.fillStyle = 'rgba(16,14,9,0.6)';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Z ${pt.z.toFixed(1)}`, ex + 19, ey);
    ctx.restore();
  }

  // Keyframe markers: numbered diamonds, same colour and number as on the timeline.
  // Drawn after the extruder, which sits on the selected keyframe.
  if (!isInteracting) {
    ctx.save();
    ctx.font = '700 11px GSCode, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const { kf, number, x: kx, y: ky, r } of keyframeMarkers(scene)) {
      const isSelected = kf.id === selectedKfId;
      ctx.beginPath();
      ctx.moveTo(kx, ky - r); ctx.lineTo(kx + r, ky); ctx.lineTo(kx, ky + r); ctx.lineTo(kx - r, ky);
      ctx.closePath();
      ctx.fillStyle   = keyframeColor(kf.t);
      ctx.strokeStyle = isSelected ? INK : '#fff';
      ctx.lineWidth   = 2;
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.fillText(String(number), kx, ky + 0.5);
    }
    ctx.restore();
  }

  // SVG centerlines (no wave layers yet)
  if (numLayers === 0 && sampledPaths.length > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(16,14,9,0.22)';
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1.2;
    for (const path of sampledPaths) {
      if (!path.enabled || path.points.length < 2) continue;
      ctx.beginPath();
      path.points.forEach((p, i) => {
        const mm = svgToMM({ x: p.x, y: p.y }, params.scaleFactor, params.originX, params.originY, params.flipY, svgH);
        const [sx, sy] = toScreen(mm.x, mm.y, 0);
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    }
    ctx.restore();
  }

  // Empty state
  if (sampledPaths.length === 0 && numLayers === 0) {
    ctx.fillStyle = 'rgba(16,14,9,0.2)';
    ctx.font = '700 10px GSCode, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CARGA UN SVG PARA COMENZAR', W / 2, H / 2);
  }

  // Layer legend (compact, top-left — freed from gizmo corner)
  if (numLayers > 1 && layerColors) {
    ctx.save();
    ctx.font = '700 8px GSCode, monospace';
    const step = numLayers <= 8 ? 1 : Math.ceil(numLayers / 8);
    let ly = 12;
    for (let li = 0; li < numLayers; li += step) {
      ctx.fillStyle = layerColor(li, numLayers);
      ctx.fillRect(10, ly, 6, 6);
      ctx.fillStyle = 'rgba(16,14,9,0.45)';
      ctx.textAlign = 'left';
      ctx.fillText(`${li + 1}`, 20, ly + 5.5);
      ly += 11;
    }
    ctx.restore();
  }

  // Rotation info — Swiss caption
  ctx.save();
  ctx.font = '700 8px GSCode, monospace';
  ctx.fillStyle = 'rgba(16,14,9,0.3)';
  ctx.textAlign = 'left';
  ctx.fillText(`AZ ${view.azimuth.toFixed(0)}°  EL ${view.elevation.toFixed(0)}°`, 10, H - 8);
  ctx.restore();

  // ── Orientation gizmo (bottom-right) ───────────────────────────────────
  {
    // GR = circle radius; GL = axis arm length (must be < GR so labels stay inside)
    const GR = 20, GL = 11;
    const GX = W - GR - 8, GY = H - GR - 8;

    // Frosted circle background
    ctx.save();
    ctx.beginPath();
    ctx.arc(GX, GY, GR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(241,241,241,0.90)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(135,135,135,0.30)';
    ctx.lineWidth = 0.75;
    ctx.stroke();

    // Axis definitions: world direction, stroke color, label
    const axes: [number, number, number, string, string][] = [
      [1, 0, 0, '#C83838', 'X'],
      [0, 1, 0, '#2E9B2E', 'Y'],
      [0, 0, 1, '#2E60C8', 'Z'],
    ];

    // Sort back-to-front so nearer axes paint over farther ones
    const depths = axes.map(([wx, wy, wz]) => {
      const [, py2] = project(wx, wy, wz, azimuth, elevation);
      return py2;
    });
    const order = [0, 1, 2].sort((a, b) => depths[b] - depths[a]);

    for (const i of order) {
      const [wx, wy, wz, color, label] = axes[i];
      const [px2, py2] = project(wx * GL, wy * GL, wz * GL, azimuth, elevation);
      const ex = GX + px2, ey = GY + py2;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.88;
      ctx.beginPath();
      ctx.moveTo(GX, GY);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Arrowhead dot
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ex, ey, 2, 0, Math.PI * 2);
      ctx.fill();

      // Label — placed at GL * 1.45 so it stays within GR
      const [lx2, ly2] = project(wx * GL * 1.45, wy * GL * 1.45, wz * GL * 1.45, azimuth, elevation);
      ctx.globalAlpha = 0.92;
      ctx.font = 'bold 7px GSCode, monospace';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, GX + lx2, GY + ly2);
    }

    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

}

function fmtDim(v: number): string {
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} mm`;
}

/**
 * Length (X), width (Y) and height (Z) of the part's bounding box, drawn as
 * dimension lines just outside the base edges nearest the camera, and a
 * vertical one beside the part's leftmost point on screen.
 */
function drawDimensions(
  ctx: CanvasRenderingContext2D, view: View3D, flat: FlatPoint[],
  b: { minX: number; maxX: number; minY: number; maxY: number }, height: number,
) {
  const toScreen = screenMapper(view);
  const A = view.azimuth * Math.PI / 180;
  // The base corner nearest the viewer maximises the projector's depth term.
  const cx = Math.sin(A) >= 0 ? b.maxX : b.minX;
  const cy = Math.cos(A) >= 0 ? b.minY : b.maxY;
  const ox = cx === b.maxX ? 1 : -1, oy = cy === b.maxY ? 1 : -1;
  // A fixed screen gap, so the lines stay inside fitView's margin.
  const off = 16 / view.scale;
  const [mx, my] = toScreen((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, 0);

  ctx.save();
  ctx.strokeStyle = 'rgba(16,14,9,0.55)';
  ctx.lineWidth = 1;
  ctx.font = '700 9px GSCode, monospace';
  ctx.textBaseline = 'middle';

  const label = (text: string, x: number, y: number, align: CanvasTextAlign) => {
    ctx.textAlign = align;
    const w = ctx.measureText(text).width;
    let left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    if (left < 4) { x += 4 - left; left = 4; }
    ctx.fillStyle = 'rgba(237,237,237,0.85)';
    ctx.fillRect(left - 3, y - 7, w + 6, 14);
    ctx.fillStyle = INK;
    ctx.fillText(text, x, y + 0.5);
  };

  // A dimension line between two screen points, with end ticks and extension
  // lines back to the edge it measures.
  const dimLine = (a: [number, number], c: [number, number], ea: [number, number], ec: [number, number], text: string) => {
    const dx = c[0] - a[0], dy = c[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 24) return;
    const nx = -dy / len * 4, ny = dx / len * 4;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]);
    for (const [px, py] of [a, c]) { ctx.moveTo(px - nx, py - ny); ctx.lineTo(px + nx, py + ny); }
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(ea[0], ea[1]); ctx.lineTo(a[0], a[1]);
    ctx.moveTo(ec[0], ec[1]); ctx.lineTo(c[0], c[1]);
    ctx.stroke();
    ctx.restore();
    const lx = (a[0] + c[0]) / 2, ly = (a[1] + c[1]) / 2;
    const ux = lx - mx, uy = ly - my, ul = Math.hypot(ux, uy) || 1;
    label(text, lx + ux / ul * 12, ly + uy / ul * 12, 'center');
  };

  const yLine = cy + oy * off, xLine = cx + ox * off;
  dimLine(toScreen(b.minX, yLine, 0), toScreen(b.maxX, yLine, 0),
    toScreen(b.minX, cy, 0), toScreen(b.maxX, cy, 0), fmtDim(b.maxX - b.minX));
  dimLine(toScreen(xLine, b.minY, 0), toScreen(xLine, b.maxY, 0),
    toScreen(cx, b.minY, 0), toScreen(cx, b.maxY, 0), fmtDim(b.maxY - b.minY));

  // Z projects straight up on screen, so the height line is a vertical
  // screen segment left of the part.
  let left = flat[0], leftX = Infinity;
  for (const p of flat) {
    const [sx] = toScreen(p.x, p.y, 0);
    if (sx < leftX) { leftX = sx; left = p; }
  }
  const bot = toScreen(left.x, left.y, 0), top = toScreen(left.x, left.y, height);
  const zx = bot[0] - 18;
  if (bot[1] - top[1] >= 4) {
    ctx.beginPath();
    ctx.moveTo(zx, bot[1]); ctx.lineTo(zx, top[1]);
    ctx.moveTo(zx - 4, bot[1]); ctx.lineTo(zx + 4, bot[1]);
    ctx.moveTo(zx - 4, top[1]); ctx.lineTo(zx + 4, top[1]);
    ctx.stroke();
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(top[0], top[1]); ctx.lineTo(zx, top[1]);
    ctx.moveTo(bot[0], bot[1]); ctx.lineTo(zx, bot[1]);
    ctx.stroke();
    ctx.globalAlpha = 1;
    label(fmtDim(height), zx, top[1] - 10, 'center');
  }
  ctx.restore();
}

/**
 * Layer strokes plus the overlays tied to them: skirt travel and soft-join
 * lines. Draws no text, so it can render into a canvas that isn't in the
 * DOM (see CLAUDE.md on canvas fonts).
 */
export function drawGeometry(ctx: CanvasRenderingContext2D, scene: GeometryScene) {
  const { view, toolpath, params, isInteracting, layerCap, layerSolo, layerColors } = scene;
  const numLayers = toolpath.length;
  // Single-colour mode uses --accent.
  const colorOf = (li: number, alpha = 1) =>
    layerColors ? layerColor(li, numLayers, alpha) : `rgba(74,78,140,${alpha})`;
  const shown = (li: number) => layerSolo ? li === layerCap : li <= layerCap;
  const { scale } = view;
  const toScreen = screenMapper(view);

  // Layer paths — vivid strokes, drawn in print order with final Z.
  // During camera interaction: stride by 4 for responsiveness.
  const lodStride = isInteracting ? 4 : 1;
  for (let li = 0; li < numLayers; li++) {
    if (li > layerCap) continue;
    const ghost = !shown(li);
    const alpha = ghost ? 0.14 : 0.60 + (li / Math.max(1, numLayers - 1)) * 0.40;

    ctx.save();
    ctx.strokeStyle = ghost ? 'rgb(90,90,90)' : colorOf(li);
    ctx.globalAlpha = alpha;
    ctx.lineWidth   = ghost ? 1 : Math.max(1.5, 5.5 / Math.sqrt(Math.max(scale, 0.05)));
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';

    for (const pts of toolpath[li].paths) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const isEndpoint = i === 0 || i === pts.length - 1;
        if (lodStride > 1 && !isEndpoint && i % lodStride !== 0) continue;
        const [sx, sy] = toScreen(pts[i].x, pts[i].y, pts[i].z);
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Concentric skirt travel arcs — same moves buildSkirtTravel emits
  if (!isInteracting && numLayers > 0) {
    const drawTravel = (from: MM2, to: MM2, centroid: MM2, zFrom: number, zTo: number) => {
      const arcPts = skirtArcPoints(from, to, centroid, params.skirtThreshold);
      ctx.beginPath();
      const [fx, fy] = toScreen(from.x, from.y, zFrom);
      ctx.moveTo(fx, fy);
      for (const pt of arcPts ?? [to]) {
        const [sx, sy] = toScreen(pt.x, pt.y, zTo);
        ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    };

    ctx.save();
    ctx.setLineDash([3, 6]);
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = 0.38;
    ctx.strokeStyle = 'rgba(50, 50, 50, 0.85)';
    for (let li = 0; li < numLayers; li++) {
      if (!shown(li)) continue;
      const layer = toolpath[li];
      for (let pi = 0; pi < layer.paths.length - 1; pi++) {
        const fromPath = layer.paths[pi];
        drawTravel(fromPath[fromPath.length - 1], layer.paths[pi + 1][0], layer.centroid, layer.z, layer.z);
      }
      const next = toolpath[li + 1];
      const lastPath = layer.paths[layer.paths.length - 1];
      if (!params.softJoin && shown(li + 1) && next?.paths.length && lastPath) {
        drawTravel(lastPath[lastPath.length - 1], next.paths[0][0], next.centroid, layer.z, next.z);
      }
    }
    ctx.restore();
  }

  // Soft-join transitions between layers (dashed, visible)
  if (!isInteracting && params.softJoin && numLayers > 1) {
    ctx.save();
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.55;
    for (let li = 0; li < numLayers - 1; li++) {
      if (!shown(li) || !shown(li + 1)) continue;
      const a = toolpath[li].paths[toolpath[li].paths.length - 1];
      const b = toolpath[li + 1].paths[0];
      if (!a || !b) continue;
      const from = a[a.length - 1], to = b[0];
      ctx.strokeStyle = colorOf(li, 0.7);
      ctx.beginPath();
      const [ax, ay] = toScreen(from.x, from.y, from.z);
      const [bx, by] = toScreen(to.x, to.y, to.z);
      ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Top-down XY thumbnail shown next to the G-code. */
export function drawTopDown(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  toolpath: ToolpathLayer[], flatPoints: FlatPoint[],
) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#F5F5F5';
  ctx.fillRect(0, 0, W, H);

  const pad = 10;
  if (flatPoints.length === 0) return;
  const { minX, maxX, minY, maxY } = boundsOf(flatPoints, p => p.x, p => p.y);
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
  const sc = Math.min((W - pad * 2) / rangeX, (H - pad * 2) / rangeY);
  const ox = pad + ((W - pad * 2) - rangeX * sc) / 2;
  const oy = pad + ((H - pad * 2) - rangeY * sc) / 2;
  const ts = (x: number, y: number): [number, number] => [
    ox + (x - minX) * sc,
    H - oy - (y - minY) * sc,
  ];

  for (let li = 0; li < toolpath.length; li++) {
    ctx.strokeStyle = layerColor(li, toolpath.length, 0.75);
    ctx.lineWidth = 0.9;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const pts of toolpath[li].paths) {
      ctx.beginPath();
      pts.forEach(({ x, y }, i) => {
        const [sx, sy] = ts(x, y);
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    }
  }
}
