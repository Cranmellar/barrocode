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
import { NumInput } from './NumInput';

interface Props {
  sampledPaths: SampledPath[];
  layers: WaveLayer[];
  params: PrintParams;
  viewBox: SVGViewBox | null;
  timelineProgress: number;
  onTimelineChange: (v: number) => void;
  keyframes: WaveKeyframe[];
  onKeyframesChange: (kf: WaveKeyframe[]) => void;
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
  return svgToMM(p, params.scaleFactor, params.originX, params.originY, params.flipY, svgH,
    params.centerX, params.centerY, params.scaleX, params.scaleY);
}

function flattenPoints(layers: WaveLayer[], params: PrintParams, svgH: number): FlatPoint[] {
  const pts: FlatPoint[] = [];
  for (const layer of layers) {
    // Build full mm path to compute arc lengths + z-hop crossings
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
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View3D>({
    azimuth: 215, elevation: 28, scale: 3, offsetX: 0, offsetY: 0,
  });
  const [selectedKfId, setSelectedKfId] = useState<string | null>(null);

  const dragRef = useRef<{
    button: number; startX: number; startY: number; startView: View3D;
  } | null>(null);

  const svgH = viewBox?.height ?? 200;

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

    ctx.fillStyle = '#EDEBE4';
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
      ctx.strokeStyle = 'rgba(16,14,9,0.08)';
      ctx.lineWidth = 0.75;
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

    // Layer paths — vivid strokes with z-hop applied
    for (let li = 0; li < numLayers; li++) {
      const layer = layers[li];
      const alpha = 0.60 + (li / Math.max(1, numLayers - 1)) * 0.40;

      // Pre-compute mm points + z-hop for this layer
      const allMm = layer.paths.flatMap(svgPts => svgPts.map(p => toMM(p, params, svgH)));
      const arcPath = buildArcPath(allMm);
      const crossings = params.zHopHeight > 0 ? findCrossings(arcPath) : [];

      ctx.save();
      ctx.strokeStyle = layerColor(li, numLayers);
      ctx.globalAlpha = alpha;
      ctx.lineWidth   = Math.max(0.8, 3.2 / Math.sqrt(Math.max(scale, 0.05)));
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
        const mmA = toMM(lastA,  params, svgH);
        const mmB = toMM(firstB, params, svgH);
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
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(kx,          ky - kfSize);
        ctx.lineTo(kx + kfSize, ky);
        ctx.lineTo(kx,          ky + kfSize);
        ctx.lineTo(kx - kfSize, ky);
        ctx.closePath();
        ctx.fillStyle   = isSelected ? '#6366F1' : layerColor(kfPt.layerIndex, numLayers);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 2;
        ctx.fill(); ctx.stroke();
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
      ctx.fillText(`Z ${pt.z.toFixed(1)}`, ex + 9, ey - 4);
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
          const mm = toMM({ x: p.x, y: p.y }, params, svgH);
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
      const GX = W - 40, GY = H - 40, GL = 17;

      // Frosted pill background
      ctx.save();
      ctx.beginPath();
      ctx.arc(GX, GY, GL + 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(247,245,240,0.88)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,135,125,0.28)';
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
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.88;
        ctx.beginPath();
        ctx.moveTo(GX, GY);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        // Arrowhead dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Label just past the arrow tip
        const [lx2, ly2] = project(wx * GL * 1.65, wy * GL * 1.65, wz * GL * 1.65, azimuth, elevation);
        ctx.globalAlpha = 0.92;
        ctx.font = 'bold 7.5px GSCode, monospace';
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
        azimuth:   (d.startView.azimuth   + dx * 0.5 + 360) % 360,
        elevation: Math.max(0, Math.min(89, d.startView.elevation - dy * 0.3)),
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

  // ── Keyframe helpers ──────────────────────────────────────────────────────
  const selectedKf = keyframes.find(k => k.id === selectedKfId) ?? null;

  function addKeyframe() {
    const newKf: WaveKeyframe = {
      id:    uid(),
      t:     timelineProgress,
      ampN:  params.lissAmpN,
      ampT:  params.lissAmpT,
      wlN:   params.lissWlN,
      wlT:   params.lissWlT,
      delta: params.lissDelta,
    };
    const updated = [...keyframes, newKf].sort((a, b) => a.t - b.t);
    onKeyframesChange(updated);
    setSelectedKfId(newKf.id);
  }

  function deleteKeyframe() {
    if (!selectedKfId) return;
    onKeyframesChange(keyframes.filter(k => k.id !== selectedKfId));
    setSelectedKfId(null);
  }

  function clearAllKeyframes() {
    onKeyframesChange([]);
    setSelectedKfId(null);
  }

  function updateKf<K extends keyof WaveKeyframe>(key: K, val: WaveKeyframe[K]) {
    if (!selectedKfId) return;
    onKeyframesChange(
      keyframes.map(k => k.id === selectedKfId ? { ...k, [key]: val } : k),
    );
  }

  const numLayers = layers.length;
  const totalPts = layers.reduce((s, l) => s + l.paths.reduce((a, p) => a + p.length, 0), 0);

  return (
    <div className="preview-container">
      <div className="toolbar">
        <span className="toolbar-title">Trayectoria global</span>
        <button className="btn-small" onClick={fitView}>Ajustar</button>
        <span className="toolbar-hint">Arrastrar = pan · Clic der. = rotar · Rueda = zoom</span>
        {layers.length > 0 && (
          <span className="toolbar-info">
            {layers.length} capa{layers.length !== 1 ? 's' : ''} · {totalPts.toLocaleString()} pts
          </span>
        )}
      </div>

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

      {/* Timeline row */}
      {layers.length > 0 && (
        <div className="timeline-row">
          <span className="timeline-label">Extrusor</span>

          {/* Track with keyframe diamond markers */}
          <div className="timeline-track">
            <input
              type="range" min={0} max={1} step={0.0005}
              value={timelineProgress}
              onChange={e => onTimelineChange(parseFloat(e.target.value))}
            />
            {keyframes.map(kf => {
              const kfLayerIdx = Math.round(kf.t * Math.max(0, numLayers - 1));
              const kfColor = kf.id === selectedKfId
                ? 'var(--accent)'
                : layerColor(kfLayerIdx, numLayers);
              return (
                <div
                  key={kf.id}
                  className={`kf-diamond ${kf.id === selectedKfId ? 'kf-selected' : ''}`}
                  style={{ left: `${kf.t * 100}%`, background: kfColor }}
                  onClick={() => setSelectedKfId(kf.id === selectedKfId ? null : kf.id)}
                  title={`Keyframe ${(kf.t * 100).toFixed(1)}%`}
                />
              );
            })}
          </div>

          <span className="timeline-label" style={{ minWidth: 36, textAlign: 'right' }}>
            {Math.round(timelineProgress * 100)}%
          </span>
          <button className="btn-small kf-add-btn" onClick={addKeyframe} title="Añadir keyframe aquí">
            ⊕ KF
          </button>
          {selectedKf && (
            <button className="btn-small kf-del-btn" onClick={deleteKeyframe} title="Eliminar keyframe seleccionado">
              ✕
            </button>
          )}
          {keyframes.length > 0 && (
            <button className="btn-small kf-del-btn kf-trash-btn" onClick={clearAllKeyframes} title="Eliminar todos los keyframes">
              <svg width="11" height="12" viewBox="0 0 11 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 3h9M3.5 3V2h4v1M2 3l.8 7h5.4l.8-7"/>
                <line x1="4.2" y1="5.5" x2="4" y2="8.5"/>
                <line x1="6.8" y1="5.5" x2="7" y2="8.5"/>
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Keyframe editor */}
      {selectedKf && (
        <div className="kf-editor">
          <span className="kf-editor-title">
            KF {(selectedKf.t * 100).toFixed(1)}%
          </span>
          <div className="kf-field">
            <label>Amp N</label>
            <NumInput value={selectedKf.ampN} min={0} max={30} step={0.1}
              onChange={v => updateKf('ampN', v)} />
            <span className="kf-unit">mm</span>
          </div>
          <div className="kf-field">
            <label>Amp T</label>
            <NumInput value={selectedKf.ampT} min={0} max={30} step={0.1}
              onChange={v => updateKf('ampT', v)} />
            <span className="kf-unit">mm</span>
          </div>
          <div className="kf-field">
            <label>λ N</label>
            <NumInput value={selectedKf.wlN} min={1} max={200} step={1}
              onChange={v => updateKf('wlN', v)} />
            <span className="kf-unit">mm</span>
          </div>
          <div className="kf-field">
            <label>λ T</label>
            <NumInput value={selectedKf.wlT} min={1} max={200} step={1}
              onChange={v => updateKf('wlT', v)} />
            <span className="kf-unit">mm</span>
          </div>
          <div className="kf-field">
            <label>δ</label>
            <NumInput
              value={parseFloat((selectedKf.delta * 180 / Math.PI).toFixed(1))}
              min={-180} max={180} step={1}
              onChange={v => updateKf('delta', v * Math.PI / 180)}
            />
            <span className="kf-unit">°</span>
          </div>
        </div>
      )}
    </div>
  );
}
