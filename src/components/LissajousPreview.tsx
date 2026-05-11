/**
 * Vista del marco del extrusor — figura de Lissajous en coordenadas locales (T, N)
 *
 * Eje horizontal → T (tangente, adelante/atrás respecto al trayecto)
 * Eje vertical   ↑ N (normal, izquierda/derecha respecto al trayecto)
 *
 * Solo lectura: no hay interacción manual. El encuadre se ajusta
 * automáticamente cuando cambian las amplitudes.
 */

import { useRef, useEffect, useCallback } from 'react';
import { computeLissajousFigure } from '../lib/waveGenerator';
import type { PrintParams } from '../types';

interface Props { params: PrintParams }

interface View { offsetX: number; offsetY: number; scale: number }

function figureArc(wlN: number, wlT: number): number {
  const base = Math.max(wlN, wlT, 1);
  return Math.min(base * 8, Math.max(wlN * 2, wlT * 2, 40));
}

export function LissajousPreview({ params }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);
  const timeRef   = useRef(0);
  const viewRef   = useRef<View>({ offsetX: 0, offsetY: 0, scale: 1 });

  const autoFit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const maxAmp = Math.max(params.lissAmpN, params.lissAmpT, 0.5);
    const margin = 20;
    const scale = Math.min(
      (rect.width  - margin * 2) / (maxAmp * 2 || 1),
      (rect.height - margin * 2) / (maxAmp * 2 || 1),
      60,
    );
    viewRef.current = { offsetX: rect.width / 2, offsetY: rect.height * 0.48, scale };
  }, [params.lissAmpN, params.lissAmpT]);

  // Auto-fit whenever amplitudes change
  useEffect(() => { autoFit(); }, [autoFit]);

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
    const { offsetX, offsetY, scale } = viewRef.current;

    ctx.fillStyle = '#F5F5F9';
    ctx.fillRect(0, 0, W, H);

    function toCanvas(t: number, n: number): [number, number] {
      return [offsetX + t * scale, offsetY - n * scale];
    }

    // Axes only — no grid
    ctx.save();
    ctx.strokeStyle = 'rgba(15,15,20,0.20)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, offsetY);  ctx.lineTo(W, offsetY);  ctx.stroke(); // T
    ctx.beginPath(); ctx.moveTo(offsetX, 0);  ctx.lineTo(offsetX, H);  ctx.stroke(); // N
    ctx.restore();

    // Axis labels
    ctx.save();
    ctx.font = '700 8px GSCode, monospace';
    ctx.fillStyle = 'rgba(15,15,20,0.35)';
    ctx.textAlign = 'right';
    ctx.fillText('T', W - 6, offsetY - 5);
    ctx.textAlign = 'center';
    ctx.fillText('N', offsetX, 12);
    ctx.restore();

    // Lissajous figure
    const totalArc = figureArc(lissWlN, lissWlT);
    const pts = computeLissajousFigure(lissAmpN, lissAmpT, lissWlN, lissWlT, lissDelta, totalArc, 1000);

    if (pts.length >= 2) {
      ctx.save();
      ctx.lineWidth = 1.8;
      ctx.lineJoin  = 'round';
      ctx.lineCap   = 'round';
      for (let i = 1; i < pts.length; i++) {
        const frac  = i / pts.length;
        const alpha = 0.06 + frac * 0.80;
        ctx.strokeStyle = `rgba(79,70,229,${alpha.toFixed(2)})`;
        const [x0, y0] = toCanvas(pts[i - 1].t, pts[i - 1].n);
        const [x1, y1] = toCanvas(pts[i].t,     pts[i].n);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      ctx.restore();

      // Animated travel dot
      const T_PERIOD = 5000;
      const prog  = (timeRef.current % T_PERIOD) / T_PERIOD;
      const dotI  = Math.floor(prog * (pts.length - 1));
      const dotPt = pts[dotI];
      const [dx, dy] = toCanvas(dotPt.t, dotPt.n);

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
          ctx.strokeStyle = '#4F46E5';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle   = '#4F46E5';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.rect(-4, -4, 8, 8);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // Empty state
    if (lissAmpN < 0.01 && lissAmpT < 0.01) {
      ctx.fillStyle = 'rgba(15,15,20,0.25)';
      ctx.font = '700 9px GSCode, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('AMPLITUDES = 0', W / 2, H / 2 + 4);
    }

    // Metrics caption
    ctx.save();
    ctx.font = '700 8px GSCode, monospace';
    ctx.fillStyle = 'rgba(15,15,20,0.32)';
    ctx.textAlign = 'left';
    ctx.fillText(
      `N ${lissAmpN.toFixed(1)}mm  λ${lissWlN}mm   T ${lissAmpT.toFixed(1)}mm  λ${lissWlT}mm   δ${(lissDelta * 180 / Math.PI).toFixed(0)}°`,
      8, H - 7,
    );
    ctx.restore();
  }, [params]);

  // Animation loop — skips when both amplitudes are ~0
  const { lissAmpN, lissAmpT } = params;
  const hasContent = lissAmpN > 0.01 || lissAmpT > 0.01;

  useEffect(() => {
    if (!hasContent) {
      draw();
      return;
    }
    let last = performance.now();
    function tick(now: number) {
      timeRef.current += now - last;
      last = now;
      draw();
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw, hasContent]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar">
        <span className="toolbar-title">Marco del extrusor</span>
        <span className="toolbar-hint">T = tangente · N = normal · punto = dirección</span>
      </div>
      <canvas ref={canvasRef} className="lissajous-canvas" style={{ flex: 1 }} />
    </div>
  );
}
