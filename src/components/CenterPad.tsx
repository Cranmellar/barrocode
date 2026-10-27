/**
 * CenterPad — compact 2-D XY picker for the keyframe center pivot.
 *
 * Shows:
 *   - All layers as a very dim silhouette (average context)
 *   - The layer that corresponds to the current keyframe's t-position,
 *     drawn bright so the user knows which layer they are editing
 *   - The center crosshair as a draggable handle
 *   - Coords and layer number as micro-labels
 */

import { useRef, useEffect, useMemo, useState } from 'react';
import type { WaveLayer, PrintParams } from '../types';
import { svgToMM } from '../lib/waveGenerator';
import { palette } from '../lib/palette';


interface Props {
  layers:   WaveLayer[];
  params:   PrintParams;
  svgH:     number;
  centerX:  number;      // mm — current pivot X
  centerY:  number;      // mm — current pivot Y
  kfT:      number;      // 0-1 — keyframe position in trajectory
  onChange: (x: number, y: number) => void;
}

interface T2 { cx: number; cy: number; s: number }

function w2s(x: number, y: number, t: T2): [number, number] {
  return [t.cx + x * t.s, t.cy - y * t.s];
}
function s2w(sx: number, sy: number, t: T2): [number, number] {
  return [(sx - t.cx) / t.s, (t.cy - sy) / t.s];
}

interface Bounds { mnX: number; mnY: number; mxX: number; mxY: number }

function partBounds(layers: WaveLayer[], params: PrintParams, svgH: number): Bounds | null {
  let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
  for (const layer of layers) {
    for (const path of layer.paths) {
      for (const pt of path) {
        const { x, y } = svgToMM(pt, params.scaleFactor, params.originX, params.originY, params.flipY, svgH);
        if (x < mnX) mnX = x; if (x > mxX) mxX = x;
        if (y < mnY) mnY = y; if (y > mxY) mxY = y;
      }
    }
  }
  return mnX === Infinity ? null : { mnX, mnY, mxX, mxY };
}

function buildTransform(b: Bounds | null, px: number, py: number, W: number, H: number): T2 {
  if (!b) return { cx: W / 2, cy: H / 2, s: 1 };
  const mnX = Math.min(b.mnX, px), mxX = Math.max(b.mxX, px);
  const mnY = Math.min(b.mnY, py), mxY = Math.max(b.mxY, py);
  const m = 16;
  const gW = mxX - mnX || 1, gH = mxY - mnY || 1;
  const s = Math.min((W - m * 2) / gW, (H - m * 2) / gH);
  return { cx: W / 2 - ((mnX + mxX) / 2) * s, cy: H / 2 + ((mnY + mxY) / 2) * s, s };
}

export function CenterPad({ layers, params, svgH, centerX, centerY, kfT, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tRef      = useRef<T2>({ cx: 36, cy: 36, s: 1 });
  const dragging  = useRef(false);
  const [size, setSize]       = useState({ w: 0, h: 0 });
  const [dragEnd, setDragEnd] = useState(0);

  const bounds = useMemo(() => partBounds(layers, params, svgH), [layers, params, svgH]);
  const aspect = bounds
    ? Math.min(2, Math.max(0.5, (bounds.mxX - bounds.mnX || 1) / (bounds.mxY - bounds.mnY || 1)))
    : 1;

  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(canvasRef.current!);
    return () => ro.disconnect();
  }, []);

  const layerIdx = layers.length === 0
    ? 0
    : Math.min(layers.length - 1, Math.round(kfT * Math.max(0, layers.length - 1)));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w: W, h: H } = size;
    if (W === 0 || H === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.scale(dpr, dpr);

    // Freeze the framing while dragging so the view does not shift under the cursor.
    const T = dragging.current ? tRef.current : buildTransform(bounds, centerX, centerY, W, H);
    tRef.current = T;

    // ── Background ──────────────────────────────────────────────────────────
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, W, H);

    // ── Dim silhouette: every layer except the active one ───────────────────
    ctx.save();
    ctx.lineWidth = 0.55;
    ctx.lineJoin  = 'round';
    ctx.lineCap   = 'round';
    for (let li = 0; li < layers.length; li++) {
      if (li === layerIdx) continue;
      ctx.globalAlpha = 0.10;
      ctx.strokeStyle = palette.ink;
      for (const path of layers[li].paths) {
        if (path.length < 2) continue;
        ctx.beginPath();
        path.forEach((pt, i) => {
          const mm = svgToMM(pt, params.scaleFactor, params.originX, params.originY, params.flipY, svgH);
          const [sx, sy] = w2s(mm.x, mm.y, T);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
      }
    }
    ctx.restore();

    // ── Active layer ─────────────────────────────────────────────────────────
    if (layers[layerIdx]) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = palette.ink2;
      ctx.lineWidth   = 1.4;
      ctx.lineJoin    = 'round';
      ctx.lineCap     = 'round';
      for (const path of layers[layerIdx].paths) {
        if (path.length < 2) continue;
        ctx.beginPath();
        path.forEach((pt, i) => {
          const mm = svgToMM(pt, params.scaleFactor, params.originX, params.originY, params.flipY, svgH);
          const [sx, sy] = w2s(mm.x, mm.y, T);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── Center crosshair ─────────────────────────────────────────────────────
    ctx.save();
    ctx.globalAlpha = 1;
    const [ccx, ccy] = w2s(centerX, centerY, T);

    // Circle ring
    ctx.strokeStyle = palette.nAxis;
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    ctx.arc(ccx, ccy, 4, 0, Math.PI * 2);
    ctx.stroke();

    // Cross
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(ccx - 8, ccy); ctx.lineTo(ccx + 8, ccy);
    ctx.moveTo(ccx, ccy - 8); ctx.lineTo(ccx, ccy + 8);
    ctx.stroke();

    // Dot
    ctx.fillStyle = palette.nAxis;
    ctx.beginPath(); ctx.arc(ccx, ccy, 2, 0, Math.PI * 2); ctx.fill();

    ctx.restore();

    // ── Micro-labels ──────────────────────────────────────────────────────────
    ctx.save();
    ctx.font      = '700 9px GSCode, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = palette.muted;
    ctx.fillText(`${centerX.toFixed(1)}, ${centerY.toFixed(1)}`, 3, H - 3);
    ctx.textAlign   = 'right';
    ctx.fillStyle   = palette.ink2;
    ctx.fillText(`L${layerIdx + 1}`, W - 3, H - 3);
    ctx.restore();

  }, [layers, params, svgH, centerX, centerY, layerIdx, size, bounds, dragEnd]);

  // ── Drag interaction ────────────────────────────────────────────────────────
  function hitWorld(e: React.MouseEvent<HTMLCanvasElement>): [number, number] {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    return s2w(e.clientX - rect.left - canvas.clientLeft, e.clientY - rect.top - canvas.clientTop, tRef.current);
  }

  function endDrag() {
    if (!dragging.current) return;
    dragging.current = false;
    setDragEnd(n => n + 1);
  }

  return (
    <canvas
      ref={canvasRef}
      className="center-pad-canvas"
      style={{ aspectRatio: aspect }}
      onMouseDown={e => { dragging.current = true; const [x, y] = hitWorld(e); onChange(x, y); }}
      onMouseMove={e => { if (!dragging.current) return; const [x, y] = hitWorld(e); onChange(x, y); }}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    />
  );
}
