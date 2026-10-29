/**
 * Vista del marco del extrusor — figura de Lissajous en coordenadas locales (T, N)
 *
 * Eje horizontal → T (tangente, adelante/atrás respecto al trayecto)
 * Eje vertical   ↑ N (normal, izquierda/derecha respecto al trayecto)
 *
 * Solo lectura: no hay interacción manual. El encuadre se ajusta
 * automáticamente cuando cambian las amplitudes.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { computeLissajousFigure } from '../lib/waveGenerator';
import type { PrintParams } from '../types';
import { palette, withAlpha } from '../lib/palette';

interface Props {
  params: PrintParams;
  // Bumped when a preset or reset replaces the wave: the figure then morphs
  // to the new shape instead of jumping. Slider edits follow at once.
  morph?: number;
}

type Wave = [ampN: number, ampT: number, wlN: number, wlT: number, delta: number];

const MORPH_MS = 250;
// One lap of the dot around the figure.
const LAP_MS = 5000;

function useMorph(target: Wave, trigger: number): Wave {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const triggerRef = useRef(trigger);
  const key = target.join('|');
  useEffect(() => {
    const animate = trigger !== triggerRef.current;
    triggerRef.current = trigger;
    const from = shownRef.current;
    const set = (w: Wave) => { shownRef.current = w; setShown(w); };
    if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      set(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / MORPH_MS));
      const e = 1 - (1 - p) ** 4;
      set(from.map((v, i) => v + (target[i] - v) * e) as Wave);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, trigger]);
  return shown;
}

interface View { offsetX: number; offsetY: number; scale: number }

function figureArc(wlN: number, wlT: number): number {
  const base = Math.max(wlN, wlT, 1);
  return Math.min(base * 8, Math.max(wlN * 2, wlT * 2, 40));
}

export function LissajousPreview({ params, morph = 0 }: Props) {
  // Two stacked canvases: everything but the moving dot is drawn only when
  // the figure, framing or size changes; each animation frame redraws just
  // the dot on a transparent canvas on top. Both stay in the DOM because
  // canvas text takes font-variation-settings from the element's style.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotRef    = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);
  const timeRef   = useRef(0);
  const viewRef   = useRef<View>({ offsetX: 0, offsetY: 0, scale: 1 });
  const figureRef = useRef<{ dpr: number; view: View; pts: Array<{ t: number; n: number }> } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // The static layer is drawn once, so redraw it when GSCode finishes loading.
  const [fontEpoch, setFontEpoch] = useState(0);

  const [lissAmpN, lissAmpT, lissWlN, lissWlT, lissDelta] = useMorph(
    [params.lissAmpN, params.lissAmpT, params.lissWlN, params.lissWlT, params.lissDelta], morph);

  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(canvasRef.current!);
    const onFonts = () => setFontEpoch(e => e + 1);
    document.fonts.addEventListener('loadingdone', onFonts);
    return () => {
      ro.disconnect();
      document.fonts.removeEventListener('loadingdone', onFonts);
    };
  }, []);

  // Framed from the observed size, so the figure stays centred when the
  // panel lays out or resizes after the amplitudes were set.
  const autoFit = useCallback(() => {
    const { w, h } = size;
    if (w === 0 || h === 0) return;
    const maxAmp = Math.max(lissAmpN, lissAmpT, 0.5);
    const margin = 10;
    const scale = Math.min(
      (w - margin * 2) / (maxAmp * 2 || 1),
      (h - margin * 2) / (maxAmp * 2 || 1),
      60,
    );
    viewRef.current = { offsetX: w / 2, offsetY: h / 2, scale };
  }, [lissAmpN, lissAmpT, size]);

  // Auto-fit whenever the amplitudes or the size change
  useEffect(() => { autoFit(); }, [autoFit]);

  const drawDot = useCallback(() => {
    const canvas = dotRef.current;
    const fig = figureRef.current;
    if (!canvas || !fig) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(fig.dpr, 0, 0, fig.dpr, 0, 0);

    const { pts, view: { offsetX, offsetY, scale } } = fig;
    if (pts.length < 2) return;
    const toCanvas = (t: number, n: number): [number, number] =>
      [offsetX + t * scale, offsetY - n * scale];

    // Animated travel dot
    const prog  = (timeRef.current % LAP_MS) / LAP_MS;
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
        ctx.strokeStyle = palette.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle   = palette.ink;
    ctx.strokeStyle = palette.surface;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.rect(-4, -4, 8, 8);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const dotCanvas = dotRef.current;
    const { w: W, h: H } = size;
    if (!canvas || !dotCanvas || W === 0 || H === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    if (dotCanvas.width !== pw || dotCanvas.height !== ph) {
      dotCanvas.width = pw;
      dotCanvas.height = ph;
    }
    // Assigning the size also clears the canvas and resets its transform.
    canvas.width = pw;
    canvas.height = ph;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const view = { ...viewRef.current };
    const { offsetX, offsetY, scale } = view;

    ctx.fillStyle = palette.surface;
    ctx.fillRect(0, 0, W, H);

    function toCanvas(t: number, n: number): [number, number] {
      return [offsetX + t * scale, offsetY - n * scale];
    }

    // Axes only — no grid
    ctx.save();
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, offsetY);  ctx.lineTo(W, offsetY);  ctx.stroke(); // T
    ctx.beginPath(); ctx.moveTo(offsetX, 0);  ctx.lineTo(offsetX, H);  ctx.stroke(); // N
    ctx.restore();

    // Axis labels
    ctx.save();
    ctx.font = '10px GSCode, monospace';
    ctx.fillStyle = palette.muted;
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
        ctx.strokeStyle = withAlpha(palette.ink2, alpha);
        const [x0, y0] = toCanvas(pts[i - 1].t, pts[i - 1].n);
        const [x1, y1] = toCanvas(pts[i].t,     pts[i].n);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      ctx.restore();
    }

    // Empty state
    if (lissAmpN < 0.01 && lissAmpT < 0.01) {
      ctx.fillStyle = palette.muted;
      ctx.font = '11px GSCode, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Amplitudes en 0', W / 2, H / 2 + 4);
    }

    figureRef.current = { dpr, view, pts };
    drawDot();
  }, [size, fontEpoch, autoFit, lissAmpN, lissAmpT, lissWlN, lissWlT, lissDelta, drawDot]);

  // The dot runs one lap after the figure changes, then rests where it is:
  // a loop that never stopped kept ≈12 % of a core busy while idle. It skips
  // when both amplitudes are ~0.
  const hasContent = lissAmpN > 0.01 || lissAmpT > 0.01;
  const figureKey = [lissAmpN, lissAmpT, lissWlN, lissWlT, lissDelta].join('|');

  useEffect(() => {
    if (!hasContent || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let last = performance.now();
    const stopAt = last + LAP_MS;
    function tick(now: number) {
      // The first rAF timestamp can predate the performance.now() taken above.
      timeRef.current += Math.max(0, now - last);
      last = now;
      drawDot();
      if (now < stopAt) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawDot, hasContent, figureKey]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} className="lissajous-canvas" style={{ flex: 1 }} />
      <canvas ref={dotRef} className="lissajous-dot" />
    </div>
  );
}
