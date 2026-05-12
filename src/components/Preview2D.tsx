/**
 * Vista global del trayecto — proyección 3D ortográfica
 *
 * Controles:
 *   Botón izquierdo + arrastrar → desplazar (pan)
 *   Botón derecho  + arrastrar → rotar (azimut / elevación)
 *   Rueda del ratón            → zoom
 *   Botón "Ajustar"            → encuadre automático
 *
 * Las capas van de azul pizarra (inferior) a terracota (superior).
 * El extrusor virtual sigue el slider de línea de tiempo.
 * Los keyframes se marcan como diamantes en la barra de tiempo.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import type { SampledPath, WaveLayer, PrintParams, SVGViewBox, WaveKeyframe } from '../types';
import { svgToMM } from '../lib/waveGenerator';
import { buildArcPath, findCrossings, hopAtArc } from '../lib/hopUtils';
import { getParamsAtT } from '../lib/waveGenerator';
import { computeCentroid, skirtArcPoints } from '../lib/skirtUtils';
import { GcodeOutput } from './GcodeOutput';

interface Props {
  sampledPaths: SampledPath[];
  layers: WaveLayer[];
  params: PrintParams;
  viewBox: SVGViewBox | null;
  timelineProgress: number;
  onTimelineChange: (v: number) => void;
  keyframes: WaveKeyframe[];
  onKeyframesChange: (kf: WaveKeyframe[]) => void;
  centerTab: 'preview' | 'gcode';
  onTabChange: (tab: 'preview' | 'gcode') => void;
  gcode: string;
  gcodeFilename: string;
  selectedKfId: string | null;
  onKfSelect: (id: string | null) => void;
  onAddKeyframe: () => void;
}

interface View3D {
  azimuth: number;
  elevation: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

// Vivid palette: cobalt-blue (bottom) → warm terracotta (top)
function layerColor(index: number, total: number, alpha = 1): string {
  const t = total <= 1 ? 0 : index / (total - 1);
  const hue = Math.round(218 - 198 * t);   // 218 (cobalt) → 20 (terracotta)
  const sat = 72 + t * 16;                  // 72 % → 88 %
  const lit = 50 + t * 12;                  // 50 % → 62 %
  return `hsla(${hue},${sat.toFixed(0)}%,${lit.toFixed(0)}%,${alpha})`;
}

function project(x: number, y: number, z: number, az: number, el: number): [number, number] {
  const A = az * Math.PI / 180;
  const E = el * Math.PI / 180;
  const rx =  x * Math.cos(A) + y * Math.sin(A);
  const ry = -x * Math.sin(A) + y * Math.cos(A);
  return [rx, ry * Math.sin(E) - z * Math.cos(E)];
}

interface FlatPoint { x: number; y: number; z: number; layerIndex: number }

function toMM(p: { x: number; y: number }, params: PrintParams, svgH: number) {
  return svgToMM(p, params.scaleFactor, params.originX, params.originY, params.flipY, svgH);
}

function flattenPoints(layers: WaveLayer[], params: PrintParams, svgH: number): FlatPoint[] {
  const pts: FlatPoint[] = [];
  for (const layer of layers) {
    // Scale is already baked into wave points by generateWaveLayers.
    // We only need arc lengths for z-hop.
    const allMm = layer.paths.flatMap(path => path.map(p => toMM(p, params, svgH)));
    const arcPath = buildArcPath(allMm);
    const crossings = params.zHopHeight > 0 ? findCrossings(arcPath) : [];
    let idx = 0;
    for (const path of layer.paths) {
      for (const _p of path) {
        const { x, y, arc } = arcPath[idx];
        const hop = hopAtArc(arc, crossings, params.zHopHeight);
        pts.push({ x, y, z: layer.z + hop, layerIndex: layer.index });
        idx++;
      }
    }
  }
  return pts;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function Preview2D({
  sampledPaths, layers, params, viewBox,
  timelineProgress, onTimelineChange,
  keyframes, onKeyframesChange,
  centerTab, onTabChange, gcode, gcodeFilename,
  selectedKfId, onKfSelect, onAddKeyframe,
}: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const topdownRef  = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View3D>({
    azimuth: 215, elevation: 28, scale: 3, offsetX: 0, offsetY: 0,
  });

  const dragRef = useRef<{
    button: number; startX: number; startY: number; startView: View3D;
  } | null>(null);

  // ── Keyframe drag refs ────────────────────────────────────────────────────
  const kfDragRef    = useRef<{ id: string; startX: number; moved: boolean } | null>(null);
  const trackRef     = useRef<HTMLDivElement>(null);
  // Stable refs so window handlers never capture stale closure values
  const kfsRef          = useRef(keyframes);
  const onKfsRef        = useRef(onKeyframesChange);
  const selectedKfIdRef = useRef(selectedKfId);
  const onKfSelectRef   = useRef(onKfSelect);
  useEffect(() => { kfsRef.current          = keyframes;         }, [keyframes]);
  useEffect(() => { onKfsRef.current        = onKeyframesChange; }, [onKeyframesChange]);
  useEffect(() => { selectedKfIdRef.current = selectedKfId;      }, [selectedKfId]);
  useEffect(() => { onKfSelectRef.current   = onKfSelect;        }, [onKfSelect]);

  const svgH = viewBox?.height ?? 200;

  // ── Keyframe drag (window-level so it works outside the track) ───────────
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = kfDragRef.current;
      if (!d || !trackRef.current) return;
      if (!d.moved && Math.abs(e.clientX - d.startX) < 4) return;
      d.moved = true;
      document.body.style.cursor = 'ew-resize';
      const rect = trackRef.current.getBoundingClientRect();
      const newT  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onKfsRef.current(
        kfsRef.current
          .map(k => k.id === d.id ? { ...k, t: newT } : k)
          .sort((a, b) => a.t - b.t),
      );
    }
    function onUp() {
      const d = kfDragRef.current;
      if (!d) return;
      if (!d.moved) {
        // Pure click → select / deselect
        const cur = selectedKfIdRef.current;
        onKfSelectRef.current(cur === d.id ? null : d.id);
      }
      kfDragRef.current = null;
      document.body.style.cursor = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, []); // stable — all state accessed through refs

  // ── Auto-fit ────────────────────────────────────────────────────────────
  const fitView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || layers.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    const flat = flattenPoints(layers, params, svgH);
    if (flat.length === 0) return;

    const projected = flat.map(p => project(p.x, p.y, p.z, view.azimuth, view.elevation));
    const xs = projected.map(p => p[0]);
    const ys = projected.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const margin = 48;
    const scale = Math.min(
      (rect.width  - margin * 2) / (maxX - minX || 1),
      (rect.height - margin * 2) / (maxY - minY || 1),
      20,
    );
    setView(v => ({
      ...v, scale,
      offsetX: rect.width  / 2 - ((minX + maxX) / 2) * scale,
      offsetY: rect.height / 2 - ((minY + maxY) / 2) * scale,
    }));
  }, [layers, params, svgH, view.azimuth, view.elevation]);

  const prevLayerCount = useRef(0);
  useEffect(() => {
    if (layers.length > 0 && layers.length !== prevLayerCount.current) {
      prevLayerCount.current = layers.length;
      const t = setTimeout(fitView, 60);
      return () => clearTimeout(t);
    }
  }, [layers, fitView]);

  useEffect(() => {
    const h = () => setView(v => ({ ...v }));
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // ── Draw ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width, H = rect.height;
    const { azimuth, elevation, scale, offsetX, offsetY } = view;

    ctx.fillStyle = '#EDEDF2';
    ctx.fillRect(0, 0, W, H);

    function toScreen(x: number, y: number, z: number): [number, number] {
      const [px, py] = project(x, y, z, azimuth, elevation);
      return [offsetX + px * scale, offsetY + py * scale];
    }

    const flat = flattenPoints(layers, params, svgH);
    const numLayers = layers.length;

    // Ground grid
    if (flat.length > 0 && elevation > 5) {
      const xs = flat.map(p => p.x), ys = flat.map(p => p.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const r  = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.65;
      const step = r > 80 ? 20 : r > 30 ? 10 : 5;
      ctx.save();
      ctx.strokeStyle = 'rgba(100, 96, 180, 0.22)';
      ctx.lineWidth = 0.9;
      ctx.setLineDash([8, 6]);
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
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Center axis — dashed vertical line through the scale pivot
    if (numLayers > 0) {
      // Use the interpolated center at the current timeline position
      const lp = getParamsAtT(timelineProgress, keyframes, params);
      const cxMM = lp.centerX, cyMM = lp.centerY;
      const maxZ = layers[numLayers - 1].z + params.layerHeight;
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

    // Layer paths — vivid strokes with z-hop applied
    for (let li = 0; li < numLayers; li++) {
      const layer = layers[li];
      const alpha = 0.60 + (li / Math.max(1, numLayers - 1)) * 0.40;

      // Pre-compute mm points + z-hop for this layer (scale pre-applied in wave data)
      const allMm = layer.paths.flatMap(svgPts =>
        svgPts.map(p => svgToMM(p, params.scaleFactor, params.originX, params.originY, params.flipY, svgH)));
      const arcPath = buildArcPath(allMm);
      const crossings = params.zHopHeight > 0 ? findCrossings(arcPath) : [];

      ctx.save();
      ctx.strokeStyle = layerColor(li, numLayers);
      ctx.globalAlpha = alpha;
      ctx.lineWidth   = Math.max(1.5, 5.5 / Math.sqrt(Math.max(scale, 0.05)));
      ctx.lineJoin    = 'round';
      ctx.lineCap     = 'round';

      let ptIdx = 0;
      for (const svgPts of layer.paths) {
        if (svgPts.length < 2) { ptIdx += svgPts.length; continue; }
        ctx.beginPath();
        for (let i = 0; i < svgPts.length; i++) {
          const { x, y, arc } = arcPath[ptIdx];
          const hop = hopAtArc(arc, crossings, params.zHopHeight);
          const [sx, sy] = toScreen(x, y, layer.z + hop);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
          ptIdx++;
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Selected-keyframe layer highlight — overdraw in accent so the user
    // knows which layer the open kf editor is targeting
    if (selectedKfId && numLayers > 0) {
      const selKf = keyframes.find(k => k.id === selectedKfId);
      if (selKf) {
        const editLi = Math.min(numLayers - 1,
          Math.round(selKf.t * Math.max(0, numLayers - 1)));
        const editLayer = layers[editLi];
        const editAllMm = editLayer.paths.flatMap(svgPts =>
          svgPts.map(p => svgToMM(p, params.scaleFactor, params.originX, params.originY, params.flipY, svgH)));
        const editArcPath = buildArcPath(editAllMm);
        const editCrossings = params.zHopHeight > 0 ? findCrossings(editArcPath) : [];

        ctx.save();
        ctx.strokeStyle = '#4F46E5';
        ctx.globalAlpha = 0.55;
        ctx.lineWidth   = Math.max(2, 5.5 / Math.sqrt(Math.max(scale, 0.05)));
        ctx.lineJoin    = 'round'; ctx.lineCap = 'round';
        let editPtIdx = 0;
        for (const svgPts of editLayer.paths) {
          if (svgPts.length < 2) { editPtIdx += svgPts.length; continue; }
          ctx.beginPath();
          for (let i = 0; i < svgPts.length; i++) {
            const { x, y, arc } = editArcPath[editPtIdx];
            const hop = hopAtArc(arc, editCrossings, params.zHopHeight);
            const [sx, sy] = toScreen(x, y, editLayer.z + hop);
            if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
            editPtIdx++;
          }
          ctx.stroke();
        }
        // Horizontal band: bounding-box rectangle at the edited layer's Z
        if (editAllMm.length > 0) {
          const xs = editAllMm.map(p => p.x), ys = editAllMm.map(p => p.y);
          const mnX = Math.min(...xs), mxX = Math.max(...xs);
          const mnY = Math.min(...ys), mxY = Math.max(...ys);
          const corners: [number,number,number][] = [
            [mnX, mnY, editLayer.z], [mxX, mnY, editLayer.z],
            [mxX, mxY, editLayer.z], [mnX, mxY, editLayer.z],
          ];
          ctx.save();
          ctx.globalAlpha = 0.38;
          ctx.strokeStyle = '#4F46E5';
          ctx.lineWidth   = 1.8;
          ctx.setLineDash([9, 5]);
          ctx.beginPath();
          corners.forEach(([x, y, z], i) => {
            const [sx, sy] = toScreen(x, y, z);
            if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
          });
          ctx.closePath(); ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      }
    }

    // Concentric skirt travel arcs (when softJoin is OFF)
    if (!params.softJoin && numLayers > 0) {
      for (let li = 0; li < numLayers; li++) {
        const layer = layers[li];

        // Convert all paths for this layer to mm-space
        const mmPaths = layer.paths.map(path =>
          path.map(p => toMM(p, params, svgH)),
        );
        const flatMm = mmPaths.flat();
        if (flatMm.length === 0) continue;
        const centroid = computeCentroid(flatMm);

        ctx.save();
        ctx.setLineDash([3, 6]);
        ctx.lineWidth = 1.1;
        ctx.globalAlpha = 0.38;
        ctx.strokeStyle = 'rgba(70, 58, 40, 0.85)';

        // Within-layer: between consecutive paths
        for (let pi = 0; pi < mmPaths.length - 1; pi++) {
          const fromPath = mmPaths[pi];
          const toPath   = mmPaths[pi + 1];
          if (!fromPath.length || !toPath.length) continue;

          const from = fromPath[fromPath.length - 1];
          const to   = toPath[0];
          const arcPts = skirtArcPoints(from, to, centroid, params.skirtThreshold);

          ctx.beginPath();
          const [fx, fy] = toScreen(from.x, from.y, layer.z);
          ctx.moveTo(fx, fy);

          if (arcPts) {
            for (const pt of arcPts) {
              const [sx, sy] = toScreen(pt.x, pt.y, layer.z);
              ctx.lineTo(sx, sy);
            }
          } else {
            const [tx, ty] = toScreen(to.x, to.y, layer.z);
            ctx.lineTo(tx, ty);
          }
          ctx.stroke();
        }

        // Between-layer: from last path end of layer li → first path start of layer li+1
        if (li < numLayers - 1) {
          const nextLayer = layers[li + 1];
          const nextMmPaths = nextLayer.paths.map(path => path.map(p => toMM(p, params, svgH)));
          const lastCurPath = mmPaths[mmPaths.length - 1];
          const firstNextPath = nextMmPaths[0];
          if (lastCurPath?.length && firstNextPath?.length) {
            const from = lastCurPath[lastCurPath.length - 1];
            const to   = firstNextPath[0];
            const arcPts = skirtArcPoints(from, to, centroid, params.skirtThreshold);

            ctx.beginPath();
            const [fx, fy] = toScreen(from.x, from.y, layer.z);
            ctx.moveTo(fx, fy);

            if (arcPts) {
              for (const pt of arcPts) {
                const [sx, sy] = toScreen(pt.x, pt.y, nextLayer.z);
                ctx.lineTo(sx, sy);
              }
            } else {
              const [tx, ty] = toScreen(to.x, to.y, nextLayer.z);
              ctx.lineTo(tx, ty);
            }
            ctx.stroke();
          }
        }

        ctx.restore();
      }
    }

    // Inter-layer travel lines (dashed, visible)
    if (params.softJoin && numLayers > 1) {
      ctx.save();
      ctx.setLineDash([3, 5]);
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.55;
      for (let li = 0; li < numLayers - 1; li++) {
        const layer = layers[li];
        const next  = layers[li + 1];
        const a = layer.paths[0];
        const b = next.paths[0];
        if (!a?.length || !b?.length) continue;
        const lastA  = a[a.length - 1];
        const firstB = b[0];
        const mmA = svgToMM(lastA,  params.scaleFactor, params.originX, params.originY, params.flipY, svgH);
        const mmB = svgToMM(firstB, params.scaleFactor, params.originX, params.originY, params.flipY, svgH);
        ctx.strokeStyle = layerColor(li, numLayers, 0.7);
        ctx.beginPath();
        const [ax, ay] = toScreen(mmA.x, mmA.y, layer.z);
        const [bx, by] = toScreen(mmB.x, mmB.y, next.z);
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Keyframe position markers on the canvas (subtle vertical tick)
    if (flat.length > 0) {
      for (const kf of keyframes) {
        const kfIdx = Math.min(flat.length - 1, Math.round(kf.t * (flat.length - 1)));
        const kfPt  = flat[kfIdx];
        const [kx, ky] = toScreen(kfPt.x, kfPt.y, kfPt.z);
        const isSelected = kf.id === selectedKfId;
        const kfSize = isSelected ? 7 : 5;
        const color  = isSelected ? '#6366F1' : layerColor(kfPt.layerIndex, numLayers);

        // Diamond
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(kx,          ky - kfSize);
        ctx.lineTo(kx + kfSize, ky);
        ctx.lineTo(kx,          ky + kfSize);
        ctx.lineTo(kx - kfSize, ky);
        ctx.closePath();
        ctx.fillStyle   = color;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 2;
        ctx.fill(); ctx.stroke();
        ctx.restore();

        // Tag — pentagon pointing left, attached to diamond right tip
        const TAG_H = 13, TAG_W = 28, TAG_R = 3, NOTCH = 5;
        const tx = kx + kfSize + 2;
        const ty = ky - TAG_H / 2;
        ctx.save();
        ctx.globalAlpha = isSelected ? 1 : 0.9;
        ctx.fillStyle   = color;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 1.2;
        ctx.beginPath();
        ctx.moveTo(tx,                ky);
        ctx.lineTo(tx + NOTCH,        ty);
        ctx.lineTo(tx + TAG_W - TAG_R, ty);
        ctx.arcTo(tx + TAG_W, ty,          tx + TAG_W, ty + TAG_R,          TAG_R);
        ctx.arcTo(tx + TAG_W, ty + TAG_H,  tx + TAG_W - TAG_R, ty + TAG_H,  TAG_R);
        ctx.lineTo(tx + NOTCH,        ty + TAG_H);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.font      = `${isSelected ? 700 : 600} 8px GSCode, monospace`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(kf.t * 100)}%`, tx + NOTCH + (TAG_W - NOTCH) / 2, ky);
        ctx.restore();
      }
    }

    // Virtual extruder
    if (flat.length > 0 && numLayers > 0) {
      const idx = Math.min(flat.length - 1, Math.floor(timelineProgress * (flat.length - 1)));
      const pt  = flat[idx];
      const [ex, ey] = toScreen(pt.x, pt.y, pt.z);
      const [fx, fy] = toScreen(pt.x, pt.y, 0);

      ctx.save();
      ctx.strokeStyle = 'rgba(50,40,70,0.28)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(ex,     ey - 8);
      ctx.lineTo(ex + 8, ey);
      ctx.lineTo(ex,     ey + 8);
      ctx.lineTo(ex - 8, ey);
      ctx.closePath();
      ctx.fillStyle   = layerColor(pt.layerIndex, numLayers);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 2.5;
      ctx.fill(); ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.font = '700 8px GSCode, monospace';
      ctx.fillStyle = 'rgba(16,14,9,0.5)';
      ctx.fillText(`Z ${pt.z.toFixed(1)}`, ex + 9, ey + 14);
      ctx.restore();

      // Add-keyframe hint tag — pentagon pointing left, upper-right of extruder
      {
        const TAG_H = 16, TAG_W = 34, TAG_R = 4, NOTCH = 6;
        const tx = ex + 8;
        const ty = ey - TAG_H - 6;
        const tcy = ty + TAG_H / 2;
        ctx.save();
        ctx.globalAlpha = 0.82;
        ctx.fillStyle   = 'rgba(16,14,9,0.78)';
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(tx,                 tcy);
        ctx.lineTo(tx + NOTCH,         ty);
        ctx.lineTo(tx + TAG_W - TAG_R, ty);
        ctx.arcTo(tx + TAG_W, ty,          tx + TAG_W, ty + TAG_R,         TAG_R);
        ctx.arcTo(tx + TAG_W, ty + TAG_H,  tx + TAG_W - TAG_R, ty + TAG_H, TAG_R);
        ctx.lineTo(tx + NOTCH,         ty + TAG_H);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 1;
        // Diamond glyph
        const mx = tx + NOTCH + 7;
        const ds = 4;
        ctx.fillStyle = layerColor(pt.layerIndex, numLayers);
        ctx.beginPath();
        ctx.moveTo(mx,      tcy - ds);
        ctx.lineTo(mx + ds, tcy);
        ctx.lineTo(mx,      tcy + ds);
        ctx.lineTo(mx - ds, tcy);
        ctx.closePath();
        ctx.fill();
        // Plus glyph
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 1.6;
        ctx.lineCap     = 'round';
        const px2 = tx + NOTCH + 20;
        ctx.beginPath();
        ctx.moveTo(px2 - 3.5, tcy); ctx.lineTo(px2 + 3.5, tcy);
        ctx.moveTo(px2, tcy - 3.5); ctx.lineTo(px2, tcy + 3.5);
        ctx.stroke();
        ctx.restore();
      }
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
    if (numLayers > 1) {
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
      ctx.fillStyle = 'rgba(241,241,246,0.90)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,135,125,0.30)';
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

  }, [sampledPaths, layers, params, viewBox, view, timelineProgress, svgH, keyframes, selectedKfId]);

  // ── Top-down mini diagram (G-code tab) ───────────────────────────────────
  useEffect(() => {
    if (centerTab !== 'gcode') return;
    const canvas = topdownRef.current;
    if (!canvas || layers.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#F5F5F9';
    ctx.fillRect(0, 0, W, H);

    const pad = 10;
    const allPts = layers.flatMap(l =>
      l.paths.flat().map(p => svgToMM(p, params.scaleFactor, params.originX, params.originY, params.flipY, svgH)),
    );
    if (allPts.length === 0) return;
    const xs = allPts.map(p => p.x), ys = allPts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
    const sc = Math.min((W - pad * 2) / rangeX, (H - pad * 2) / rangeY);
    const ox = pad + ((W - pad * 2) - rangeX * sc) / 2;
    const oy = pad + ((H - pad * 2) - rangeY * sc) / 2;
    const ts = (x: number, y: number): [number, number] => [
      ox + (x - minX) * sc,
      H - oy - (y - minY) * sc,
    ];

    for (let li = 0; li < layers.length; li++) {
      ctx.strokeStyle = layerColor(li, layers.length, 0.75);
      ctx.lineWidth = 0.9;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (const svgPts of layers[li].paths) {
        if (svgPts.length < 2) continue;
        ctx.beginPath();
        svgPts.forEach((p, i) => {
          const mm = svgToMM(p, params.scaleFactor, params.originX, params.originY, params.flipY, svgH);
          const [sx, sy] = ts(mm.x, mm.y);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
      }
    }
  }, [centerTab, layers, params, svgH]);

  // ── Mouse interaction ─────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { button: e.button, startX: e.clientX, startY: e.clientY, startView: { ...view } };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    if (d.button === 0) {
      setView(v => ({ ...v, offsetX: d.startView.offsetX + dx, offsetY: d.startView.offsetY + dy }));
    } else if (d.button === 2) {
      setView(v => ({
        ...v,
        azimuth:   (d.startView.azimuth   - dx * 0.5 + 360) % 360,
        elevation: Math.max(0, Math.min(89, d.startView.elevation + dy * 0.3)),
      }));
    }
  };
  const onMouseUp = () => { dragRef.current = null; };
  const onContextMenu = (e: React.MouseEvent) => e.preventDefault();
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setView(v => {
      const ns = Math.max(0.05, Math.min(80, v.scale * factor));
      const r  = ns / v.scale;
      return { ...v, scale: ns, offsetX: mx - r * (mx - v.offsetX), offsetY: my - r * (my - v.offsetY) };
    });
  };

  const numLayers = layers.length;
  const totalPts = layers.reduce((s, l) => s + l.paths.reduce((a, p) => a + p.length, 0), 0);

  return (
    <div className="preview-container">
      <div className="toolbar">
        {centerTab === 'preview' && (
          <>
            <span className="toolbar-title">Trayectoria</span>
            <button className="btn-small" onClick={fitView}>Ajustar</button>
            <span className="toolbar-hint">Arrastrar = pan · Clic der. = rotar · Rueda = zoom</span>
            {layers.length > 0 && (
              <span className="toolbar-info">
                {layers.length} capa{layers.length !== 1 ? 's' : ''} · {totalPts.toLocaleString()} pts
              </span>
            )}
          </>
        )}
        {centerTab === 'gcode' && (
          <span className="toolbar-title">G-code</span>
        )}
        <div className="seg-switch">
          <button
            className={`seg-btn ${centerTab === 'preview' ? 'seg-btn--active' : ''}`}
            onClick={() => onTabChange('preview')}
          >
            Trayectoria
          </button>
          <button
            className={`seg-btn ${centerTab === 'gcode' ? 'seg-btn--active' : ''}`}
            onClick={() => onTabChange('gcode')}
          >
            G-code
          </button>
        </div>
      </div>

      {centerTab === 'preview' && (
        <canvas
          ref={canvasRef}
          className="preview-canvas"
          style={{ cursor: dragRef.current?.button === 2 ? 'crosshair' : 'grab' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onContextMenu={onContextMenu}
          onWheel={onWheel}
        />
      )}

      {centerTab === 'gcode' && (
        <div className="gcode-tab-view">
          <GcodeOutput gcode={gcode} filename={gcodeFilename} />
          {layers.length > 0 && (
            <canvas ref={topdownRef} width={160} height={120} className="gcode-topdown" />
          )}
        </div>
      )}

      {/* Timeline row */}
      {layers.length > 0 && (
        <div className="timeline-row">
          <span className="timeline-label">Extrusor</span>

          {/* Track with keyframe diamond markers */}
          <div className="timeline-track" ref={trackRef}>
            <input
              type="range" min={0} max={1} step={0.0005}
              value={timelineProgress}
              onChange={e => onTimelineChange(parseFloat(e.target.value))}
            />

            {/* Add-keyframe tag floating above the scrub thumb */}
            {(() => {
              const li = Math.min(numLayers - 1, Math.floor(timelineProgress * numLayers));
              const dColor = layerColor(li, numLayers);
              return (
                <button
                  className="timeline-thumb-tag"
                  style={{ left: `calc(${timelineProgress * 100}% + ${((0.5 - timelineProgress) * 14).toFixed(2)}px)` }}
                  onClick={onAddKeyframe}
                  title="Añadir keyframe aquí"
                >
                  <span className="ttt-diamond" style={{ background: dColor }} />
                  <span className="ttt-plus">+</span>
                </button>
              );
            })()}

            {keyframes.map(kf => {
              const kfLayerIdx = Math.round(kf.t * Math.max(0, numLayers - 1));
              const kfColor = kf.id === selectedKfId
                ? 'var(--accent)'
                : layerColor(kfLayerIdx, numLayers);
              return (
                <div
                  key={kf.id}
                  className={`kf-diamond ${kf.id === selectedKfId ? 'kf-selected' : ''}`}
                  style={{ left: `${kf.t * 100}%`, background: kfColor, cursor: 'ew-resize' }}
                  onMouseDown={e => {
                    e.preventDefault();
                    kfDragRef.current = { id: kf.id, startX: e.clientX, moved: false };
                  }}
                  title={`KF ${(kf.t * 100).toFixed(1)}% — arrastrar para mover`}
                />
              );
            })}
          </div>

          <span className="timeline-label" style={{ minWidth: 36, textAlign: 'right' }}>
            {Math.round(timelineProgress * 100)}%
          </span>
        </div>
      )}

    </div>
  );
}
