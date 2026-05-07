/**
 * Vista del marco del extrusor — figura de Lissajous en coordenadas locales (T, N)
 *
 * Eje horizontal → T (tangente, adelante/atrás respecto al trayecto)
 * Eje vertical   ↑ N (normal, izquierda/derecha respecto al trayecto)
 *
 * Controles:
 *   Arrastrar → desplazar
 *   Rueda    → zoom
 *   Botón "Centrar" → encuadre automático
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { computeLissajousFigure } from '../lib/waveGenerator';
import type { PrintParams } from '../types';

interface Props { params: PrintParams }

interface PanZoom { offsetX: number; offsetY: number; scale: number }

function figureArc(wlN: number, wlT: number): number {
  const base = Math.max(wlN, wlT, 1);
  return Math.min(base * 8, Math.max(wlN * 2, wlT * 2, 40));
}

export function LissajousPreview({ params }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef   = useRef(0);
  const timeRef  = useRef(0);
  const dragging = useRef(false);
  const lastPos  = useRef({ x: 0, y: 0 });
  const [pz, setPz] = useState<PanZoom>({ offsetX: 0, offsetY: 0, scale: 1 });

  // Auto-centrar cuando cambian amplitudes
  const autoFit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Small delay so the layout has settled before reading rect
    setTimeout(() => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const { lissAmpN, lissAmpT } = params;
      const maxAmp = Math.max(lissAmpN, lissAmpT, 0.5);
      const margin = 16;
      const scale = Math.min(
        (rect.width  - margin * 2) / (maxAmp * 2 || 1),
        (rect.height - margin * 2) / (maxAmp * 2 || 1),
        60,
      );
      // Offset Y slightly upward (40 % instead of 50 %) so figure sits
      // comfortably in the short bottom-row canvas.
      setPz({ offsetX: rect.width / 2, offsetY: rect.height * 0.44, scale });
    }, 30);
  }, [params.lissAmpN, params.lissAmpT]);

  // Auto-ajuste inicial y cuando cambian amplitudes
  const prevAmps = useRef({ n: -1, t: -1 });
  useEffect(() => {
    if (params.lissAmpN !== prevAmps.current.n || params.lissAmpT !== prevAmps.current.t) {
      prevAmps.current = { n: params.lissAmpN, t: params.lissAmpT };
      autoFit();
    }
  }, [params.lissAmpN, params.lissAmpT, autoFit]);

  const draw = useCallback(() => {
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
    const { lissAmpN, lissAmpT, lissWlN, lissWlT, lissDelta } = params;
    const { offsetX, offsetY, scale } = pz;

    ctx.fillStyle = '#F7F5F0';
    ctx.fillRect(0, 0, W, H);

    // Convierte coordenadas (t, n) → píxeles de canvas
    function toCanvas(t: number, n: number): [number, number] {
      return [offsetX + t * scale, offsetY - n * scale];
    }

    // Rejilla adaptativa
    const gridMM = Math.max(0.5, Math.pow(10, Math.floor(Math.log10(60 / scale))));
    const gridPx = gridMM * scale;

    ctx.save();
    ctx.strokeStyle = 'rgba(16,14,9,0.08)';
    ctx.lineWidth = 1;
    const startTGrid = Math.floor((-offsetX / scale) / gridMM) * gridMM;
    const endTGrid   = Math.ceil( ((W - offsetX) / scale) / gridMM) * gridMM;
    const startNGrid = Math.floor(((offsetY - H) / scale) / gridMM) * gridMM;
    const endNGrid   = Math.ceil( (offsetY / scale) / gridMM) * gridMM;

    for (let gt = startTGrid; gt <= endTGrid; gt += gridMM) {
      const [gx] = toCanvas(gt, 0);
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (let gn = startNGrid; gn <= endNGrid; gn += gridMM) {
      const [, gy] = toCanvas(0, gn);
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }
    ctx.restore();

    // Ejes principales
    ctx.save();
    ctx.strokeStyle = 'rgba(16,14,9,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, offsetY); ctx.lineTo(W, offsetY); ctx.stroke(); // eje T
    ctx.beginPath(); ctx.moveTo(offsetX, 0); ctx.lineTo(offsetX, H); ctx.stroke(); // eje N
    ctx.restore();

    // Etiquetas de ejes — Swiss caps style
    ctx.save();
    ctx.font = '700 8px GSCode, monospace';
    ctx.fillStyle = 'rgba(16,14,9,0.38)';
    ctx.letterSpacing = '0.1em';
    ctx.textAlign = 'right';
    ctx.fillText('T', W - 6, offsetY - 5);
    ctx.textAlign = 'center';
    ctx.fillText('N', offsetX, 12);
    ctx.restore();

    // Figura de Lissajous
    const totalArc = figureArc(lissWlN, lissWlT);
    const pts = computeLissajousFigure(lissAmpN, lissAmpT, lissWlN, lissWlT, lissDelta, totalArc, 1000);

    if (pts.length >= 2) {
      // Single ink colour with opacity ramp — clearly distinct from the 3D layer palette.
      // Early segments are faint (trail), end segment is solid (head direction).
      ctx.save();
      ctx.lineWidth   = 1.8;
      ctx.lineJoin    = 'round';
      ctx.lineCap     = 'round';
      for (let i = 1; i < pts.length; i++) {
        const frac  = i / pts.length;
        const alpha = 0.08 + frac * 0.78;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(16,14,9,${alpha.toFixed(2)})`; // ink — instrument trace
        const [x0, y0] = toCanvas(pts[i - 1].t, pts[i - 1].n);
        const [x1, y1] = toCanvas(pts[i].t,     pts[i].n);
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();

      // Animated travel dot
      const T_PERIOD = 5000;
      const prog  = (timeRef.current % T_PERIOD) / T_PERIOD;
      const dotI  = Math.floor(prog * (pts.length - 1));
      const dotPt = pts[dotI];
      const [dx, dy] = toCanvas(dotPt.t, dotPt.n);

      // Direction arrow — accent color
      if (dotI < pts.length - 2) {
        const next = pts[dotI + 2];
        const [nx, ny] = toCanvas(next.t, next.n);
        const vx = nx - dx, vy = ny - dy;
        const vlen = Math.hypot(vx, vy);
        if (vlen > 0.5) {
          const L = 10;
          ctx.beginPath();
          ctx.moveTo(dx, dy);
          ctx.lineTo(dx + (vx / vlen) * L, dy + (vy / vlen) * L);
          ctx.strokeStyle = '#3730A3';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // Dot — accent square (instrument cursor)
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle   = '#3730A3';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.rect(-4, -4, 8, 8);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // Estado vacío
    if (lissAmpN < 0.01 && lissAmpT < 0.01) {
      ctx.fillStyle = 'rgba(16,14,9,0.25)';
      ctx.font = '700 9px GSCode, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('AMPLITUDES = 0', W / 2, H / 2 + 4);
    }

    // Métricas — Swiss caption strip
    ctx.save();
    ctx.font = '700 8px GSCode, monospace';
    ctx.fillStyle = 'rgba(16,14,9,0.35)';
    ctx.textAlign = 'left';
    ctx.fillText(
      `N ${lissAmpN.toFixed(1)}mm  λ${lissWlN}mm   T ${lissAmpT.toFixed(1)}mm  λ${lissWlT}mm   δ${(lissDelta * 180 / Math.PI).toFixed(0)}°`,
      8, H - 7,
    );
    ctx.restore();
  }, [params, pz]);

  // Loop de animación
  useEffect(() => {
    let last = performance.now();
    function tick(now: number) {
      timeRef.current += now - last;
      last = now;
      draw();
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // Pan
  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setPz(p => ({ ...p, offsetX: p.offsetX + dx, offsetY: p.offsetY + dy }));
  };
  const onMouseUp = () => { dragging.current = false; };

  // Zoom
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.13 : 1 / 1.13;
    setPz(p => {
      const ns = Math.max(0.5, Math.min(200, p.scale * factor));
      const r  = ns / p.scale;
      return { scale: ns, offsetX: mx - r * (mx - p.offsetX), offsetY: my - r * (my - p.offsetY) };
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar">
        <span className="toolbar-title">Marco del extrusor</span>
        <button className="btn-small" onClick={autoFit}>Centrar</button>
        <span className="toolbar-hint">T = tangente · N = normal · punto = dirección de avance</span>
      </div>
      <canvas
        ref={canvasRef}
        className="lissajous-canvas"
        style={{ cursor: dragging.current ? 'grabbing' : 'grab', flex: 1 }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      />
    </div>
  );
}
