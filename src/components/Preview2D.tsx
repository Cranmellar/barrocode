/**
 * Vista global del trayecto — proyección 3D ortográfica
 *
 * Controles:
 *   Botón izquierdo + arrastrar → desplazar (pan)
 *   Botón derecho  + arrastrar → rotar (azimut / elevación)
 *   Rueda del ratón            → zoom
 *   Botón "Ajustar"            → encuadre automático
 *
 * The canvas fills the whole window; the floating panels cover its edges
 * (`insets`), so framing and overlays keep to the area between them.
 * The virtual extruder follows the timeline; keyframes are diamonds on their
 * own lane above it.
 */

import { useRef, useEffect, useCallback, useState, useMemo, type CSSProperties, type ReactNode } from 'react';
import type { SampledPath, PrintParams, SVGViewBox, WaveKeyframe } from '../types';
import { findKeyframeAt } from '../lib/waveGenerator';
import type { ToolpathLayer } from '../lib/toolpath';
import { summarizeGcode } from '../lib/gcodeStats';
import {
  type View3D, keyframeColor, layerColor, makeProjector, boundsOf, flattenPoints, drawScene, drawGeometry, drawTopDown, keyframeAt,
} from '../lib/draw3D';
import { GcodeOutput } from './GcodeOutput';
import { downloadGcode } from '../lib/gcodeGenerator';

interface Props {
  sampledPaths: SampledPath[];
  toolpath: ToolpathLayer[];
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
  onHelp: () => void;
  // Screen space taken by the floating side panels and the top bar.
  insets: { left: number; right: number; top: number };
  // Keyframe controls placed in the timeline dock: before the track, after
  // it, and an editor that opens above the row.
  timelineLead?: ReactNode;
  timelineActions?: ReactNode;
  timelineEditor?: ReactNode;
}

export const STAGE_GAP = 12;
const LAYER_SLIDER_W = 44 + STAGE_GAP;


const VIEW_PRESETS = [
  { label: 'Iso',    azimuth: 325, elevation: 28, title: 'Vista isométrica' },
  { label: 'Planta', azimuth: 0,   elevation: 90, title: 'Vista superior (X → derecha, Y ↑)' },
  { label: 'Frente', azimuth: 0,   elevation: 0,  title: 'Vista frontal (X → derecha, Z ↑)' },
];

function formatDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

const VIEW_OPTS_KEY = 'barrocode.viewOptions';
interface ViewOptions { layerColors: boolean; showDims: boolean }
const DEFAULT_VIEW_OPTS: ViewOptions = { layerColors: true, showDims: false };

function loadViewOpts(): ViewOptions {
  try {
    return { ...DEFAULT_VIEW_OPTS, ...JSON.parse(localStorage.getItem(VIEW_OPTS_KEY) ?? '{}') };
  } catch {
    return DEFAULT_VIEW_OPTS;
  }
}

function fmtMM(v: number): string {
  return v >= 100 ? v.toFixed(0) : v.toFixed(1);
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function Preview2D({
  sampledPaths, toolpath, params, viewBox,
  timelineProgress, onTimelineChange,
  keyframes, onKeyframesChange,
  centerTab, onTabChange, gcode, gcodeFilename,
  selectedKfId, onKfSelect, onAddKeyframe, onHelp,
  insets, timelineLead, timelineActions, timelineEditor,
}: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const topdownRef  = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View3D>({
    azimuth: 325, elevation: 28, scale: 3, offsetX: 0, offsetY: 0,
  });
  const [isInteracting, setIsInteracting] = useState(false);
  // CSS size of the 3D canvas. Observed rather than read while drawing, so a
  // panel resize redraws it and the canvas buffer is only reallocated then.
  const [size, setSize] = useState({ w: 0, h: 0 });
  // null = all layers; otherwise the 1-based top layer shown.
  const [layerCap, setLayerCap] = useState<number | null>(null);
  const [layerSolo, setLayerSolo] = useState(false);
  const [overKf, setOverKf] = useState(false);
  const [viewOpts, setViewOpts] = useState(loadViewOpts);
  const toggleViewOpt = (k: keyof ViewOptions) => {
    const next = { ...viewOpts, [k]: !viewOpts[k] };
    setViewOpts(next);
    try { localStorage.setItem(VIEW_OPTS_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };
  const interactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockH, setDockH] = useState(0);

  const dragRef = useRef<{
    button: number; startX: number; startY: number; startView: View3D;
  } | null>(null);

  // ── Keyframe drag refs ────────────────────────────────────────────────────
  const kfDragRef    = useRef<{ id: string; startX: number; moved: boolean } | null>(null);
  const [draggingKfId, setDraggingKfId] = useState<string | null>(null);
  const trackRef     = useRef<HTMLDivElement>(null);
  // Stable refs so window handlers never capture stale closure values
  const kfsRef          = useRef(keyframes);
  const onKfsRef        = useRef(onKeyframesChange);
  const selectedKfIdRef = useRef(selectedKfId);
  const onKfSelectRef   = useRef(onKfSelect);
  const onTimelineRef   = useRef(onTimelineChange);
  useEffect(() => { kfsRef.current          = keyframes;         }, [keyframes]);
  useEffect(() => { onKfsRef.current        = onKeyframesChange; }, [onKeyframesChange]);
  useEffect(() => { selectedKfIdRef.current = selectedKfId;      }, [selectedKfId]);
  useEffect(() => { onKfSelectRef.current   = onKfSelect;        }, [onKfSelect]);
  useEffect(() => { onTimelineRef.current   = onTimelineChange;  }, [onTimelineChange]);

  const svgH = viewBox?.height ?? 200;

  const flatPoints = useMemo(() => flattenPoints(toolpath), [toolpath]);

  const modelBounds = useMemo(() => {
    if (flatPoints.length === 0) return null;
    return boundsOf(flatPoints, p => p.x, p => p.y);
  }, [flatPoints]);

  // ── Keyframe drag (window-level so it works outside the track) ───────────
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = kfDragRef.current;
      if (!d || !trackRef.current) return;
      if (!d.moved && Math.abs(e.clientX - d.startX) < 4) return;
      if (!d.moved) {
        d.moved = true;
        document.body.style.cursor = 'grabbing';
        setDraggingKfId(d.id);
        // Dragging a keyframe also opens it, so its editor and the extruder follow along.
        if (d.id !== selectedKfIdRef.current) onKfSelectRef.current(d.id);
      }
      const rect = trackRef.current.getBoundingClientRect();
      const newT  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onKfsRef.current(
        kfsRef.current
          .map(k => k.id === d.id ? { ...k, t: newT } : k)
          .sort((a, b) => a.t - b.t),
      );
      onTimelineRef.current(newT);
    }
    function onUp() {
      const d = kfDragRef.current;
      if (!d) return;
      if (!d.moved) onKfSelectRef.current(d.id);
      kfDragRef.current = null;
      setDraggingKfId(null);
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
  const fitView = useCallback((azimuth = view.azimuth, elevation = view.elevation) => {
    const canvas = canvasRef.current;
    if (!canvas || flatPoints.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    const proj = makeProjector(azimuth, elevation);
    const projected = flatPoints.map(p => proj(p.x, p.y, p.z));
    const { minX, maxX, minY, maxY } = boundsOf(projected, p => p[0], p => p[1]);
    const margin = 40;
    // Frame the part in the space left between the panels and the layer slider.
    const left   = insets.left;
    const width  = rect.width - left - insets.right - (toolpath.length > 1 ? LAYER_SLIDER_W : 0);
    const height = rect.height - insets.top - (dockRef.current ? dockRef.current.offsetHeight + STAGE_GAP * 2 : STAGE_GAP);
    const scale = Math.min(
      (width  - margin * 2) / (maxX - minX || 1),
      (height - margin * 2) / (maxY - minY || 1),
      20,
    );
    setView(v => ({
      ...v, azimuth, elevation, scale,
      offsetX: left + width / 2 - ((minX + maxX) / 2) * scale,
      offsetY: insets.top + height / 2 - ((minY + maxY) / 2) * scale,
    }));
  }, [flatPoints, toolpath.length, view.azimuth, view.elevation, insets.left, insets.right, insets.top]);

  // Opening or closing a side panel reframes the part in the new free area.
  const fitRef = useRef(fitView);
  useEffect(() => { fitRef.current = fitView; }, [fitView]);
  useEffect(() => { fitRef.current(); }, [insets.left, insets.right]);

  const prevLayerCount = useRef(0);
  useEffect(() => {
    if (toolpath.length > 0 && toolpath.length !== prevLayerCount.current) {
      prevLayerCount.current = toolpath.length;
      const t = setTimeout(() => fitView(), 60);
      return () => clearTimeout(t);
    }
  }, [toolpath.length, fitView]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const hasDock = toolpath.length > 0;
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) { setDockH(0); return; }
    const ro = new ResizeObserver(() => setDockH(dock.offsetHeight));
    ro.observe(dock);
    return () => ro.disconnect();
  }, [hasDock]);
  const bottomInset = dockH > 0 ? dockH + STAGE_GAP * 2 : STAGE_GAP;
  const sliderInset = toolpath.length > 1 ? LAYER_SLIDER_W : 0;

  const visibleCap = Math.min(layerCap ?? toolpath.length, toolpath.length) - 1;

  // ── Draw ─────────────────────────────────────────────────────────────────
  // Inputs of drawGeometry. When a redraw leaves them unchanged (a timeline
  // scrub), the layer strokes come from a cached canvas. The cache is built
  // only then: a detached canvas rasterises on the main thread, so drawing
  // into it on every camera move would cost more than it saves.
  const geometryRef     = useRef<HTMLCanvasElement | null>(null);
  const lastGeomDepsRef = useRef<unknown[]>([]);
  const cacheDepsRef    = useRef<unknown[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w: W, h: H } = size;
    if (W === 0 || H === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.floor(W * dpr), ph = Math.floor(H * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width  = pw;
      canvas.height = ph;
    }

    const geometry = {
      view, toolpath, params, isInteracting, layerCap: visibleCap, layerSolo,
      layerColors: viewOpts.layerColors,
    };
    const geomDeps = [pw, ph, dpr, ...Object.values(geometry)];
    const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);
    let cache: HTMLCanvasElement | undefined;
    if (same(geomDeps, lastGeomDepsRef.current)) {
      cache = geometryRef.current ??= document.createElement('canvas');
      if (!same(geomDeps, cacheDepsRef.current)) {
        cache.width  = pw;
        cache.height = ph;
        const cctx = cache.getContext('2d');
        if (!cctx) return;
        cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawGeometry(cctx, geometry);
        cacheDepsRef.current = geomDeps;
      }
    }
    lastGeomDepsRef.current = geomDeps;

    // The buffer is kept between draws, so nothing resets the context state;
    // save/restore keeps one draw's state from leaking into the next.
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(ctx, W, H, {
      ...geometry, flatPoints, modelBounds, sampledPaths, svgH, timelineProgress,
      keyframes, selectedKfId, showDims: viewOpts.showDims,
      inset: { left: insets.left, right: insets.right + sliderInset, top: insets.top, bottom: bottomInset },
    }, cache);
    ctx.restore();
  }, [size, sampledPaths, toolpath, flatPoints, modelBounds, params, view, timelineProgress, svgH, keyframes, selectedKfId, isInteracting, visibleCap, layerSolo, viewOpts, insets, bottomInset, sliderInset]);

  // ── Top-down mini diagram (G-code tab) ───────────────────────────────────
  useEffect(() => {
    if (centerTab !== 'gcode') return;
    const canvas = topdownRef.current;
    if (!canvas || toolpath.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawTopDown(ctx, canvas.width, canvas.height, toolpath, flatPoints);
  }, [centerTab, toolpath, flatPoints]);

  // ── Mouse interaction ─────────────────────────────────────────────────────
  const stopInteracting = () => {
    dragRef.current = null;
    if (interactTimerRef.current) clearTimeout(interactTimerRef.current);
    interactTimerRef.current = setTimeout(() => {
      interactTimerRef.current = null;
      setIsInteracting(false);
    }, 150);
  };
  const kfUnder = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return keyframeAt(
      { view, flatPoints, keyframes, selectedKfId, layerCap: visibleCap, layerSolo },
      e.clientX - rect.left, e.clientY - rect.top,
    );
  };
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    // preventDefault keeps focus where it was; drop it so keyboard shortcuts
    // don't light up the focus ring of the last button clicked.
    (document.activeElement as HTMLElement | null)?.blur();
    if (e.button === 0) {
      const kf = kfUnder(e);
      if (kf) {
        onKfSelect(kf.id);
        return;
      }
    }
    dragRef.current = { button: e.button, startX: e.clientX, startY: e.clientY, startView: { ...view } };
    if (interactTimerRef.current) clearTimeout(interactTimerRef.current);
    setIsInteracting(true);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const d = dragRef.current;
    if (!d) {
      setOverKf(kfUnder(e) !== null);
      return;
    }
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
  const onMouseUp = stopInteracting;
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
    if (interactTimerRef.current) clearTimeout(interactTimerRef.current);
    setIsInteracting(true);
    interactTimerRef.current = setTimeout(() => {
      interactTimerRef.current = null;
      setIsInteracting(false);
    }, 150);
  };

  const numLayers = toolpath.length;
  const totalPts = flatPoints.length;
  const shownCap = Math.min(layerCap ?? numLayers, numLayers);

  const stats = useMemo(() => (gcode ? summarizeGcode(gcode) : null), [gcode]);
  const crossings = toolpath.reduce((n, l) => n + l.crossings, 0);

  return (
    <div className="stage-view">
      <canvas
        ref={canvasRef}
        className="preview-canvas"
        title={overKf ? 'Clic para editar este keyframe' : undefined}
        style={{ cursor: dragRef.current?.button === 2 ? 'crosshair' : overKf && !dragRef.current ? 'pointer' : 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onContextMenu={onContextMenu}
        onWheel={onWheel}
      />

      <div className="stage-bar" style={{ left: insets.left, right: insets.right, top: STAGE_GAP }}>
        <div className="bar-group">
          <button className="btn-icon" onClick={() => fitView()} aria-label="Encuadrar la pieza"
            title="Encuadrar la pieza. En la vista: arrastrar = desplazar · clic derecho = rotar · rueda = zoom">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1.5 5V1.5H5M9 1.5h3.5V5M12.5 9v3.5H9M5 12.5H1.5V9" />
            </svg>
          </button>
          <div className="view-presets" role="group" aria-label="Vistas">
            {VIEW_PRESETS.map(v => (
              <button key={v.label}
                className={`view-preset${view.azimuth === v.azimuth && view.elevation === v.elevation ? ' view-preset--on' : ''}`}
                onClick={() => fitView(v.azimuth, v.elevation)}
                title={v.title}>
                {v.label}
              </button>
            ))}
          </div>
          {numLayers > 1 && (
            <button className={`btn-toggle${viewOpts.layerColors ? ' btn-toggle--on' : ''}`}
              aria-pressed={viewOpts.layerColors} onClick={() => toggleViewOpt('layerColors')}
              title="Colorear cada capa o usar un solo color">Color</button>
          )}
          {numLayers > 0 && (
            <button className={`btn-toggle${viewOpts.showDims ? ' btn-toggle--on' : ''}`}
              aria-pressed={viewOpts.showDims} onClick={() => toggleViewOpt('showDims')}
              title="Mostrar largo, ancho y alto de la pieza">Cotas</button>
          )}
        </div>

        <div className="bar-group bar-group--end">
          {toolpath.length > 0 && modelBounds && (
            <span className="stage-summary" title={[
              stats && `Impresión ${Math.round(stats.printLength).toLocaleString()} mm · desplazamiento ${Math.round(stats.travelLength).toLocaleString()} mm`,
              stats && params.generateE && `E total ${stats.eTotal.toFixed(1)}`,
              `${numLayers} capas · ${totalPts.toLocaleString()} pts`,
              crossings > 0 && `${crossings} cruce${crossings !== 1 ? 's' : ''} con z-hop`,
              `Tiempo estimado a ${params.printSpeed} mm/min, sin aceleraciones`,
            ].filter(Boolean).join('\n')}>
              {stats && <>{formatDuration(stats.timeSec)}<span className="stage-summary-sep"> · </span></>}
              {fmtMM(modelBounds.maxX - modelBounds.minX)}×{fmtMM(modelBounds.maxY - modelBounds.minY)}×{fmtMM(numLayers * params.layerHeight)} mm
            </span>
          )}
          <button className={`btn-small${centerTab === 'gcode' ? ' btn-small--on' : ''}`}
            aria-pressed={centerTab === 'gcode'} disabled={!gcode}
            onClick={() => onTabChange(centerTab === 'gcode' ? 'preview' : 'gcode')}
            title="Ver el G-code (G)">G-code</button>
          <button className="btn-primary btn-signal" disabled={!gcode}
            onClick={() => downloadGcode(gcode, gcodeFilename)}
            title={`Descargar ${gcodeFilename}`}>↓ Descargar</button>
          <button className="btn-icon" onClick={onHelp} aria-haspopup="dialog"
            aria-label="Ayuda: cómo usar BarroCode" title="Ayuda (?)">?</button>
        </div>
      </div>

      {numLayers > 1 && (
        <div className="layer-slider" style={{ right: insets.right, top: insets.top, bottom: bottomInset }}>
          <span className="layer-slider-value" title="Capa superior visible">
            {shownCap}<span className="layer-slider-total">/{numLayers}</span>
          </span>
          <div className="layer-slider-track">
            <input
              type="range" min={1} max={numLayers} step={1}
              value={shownCap}
              style={viewOpts.layerColors ? { '--thumb-c': layerColor(shownCap - 1, numLayers) } as CSSProperties : undefined}
              aria-label="Capas visibles"
              onChange={e => {
                const v = parseInt(e.target.value, 10);
                setLayerCap(v >= numLayers ? null : v);
              }}
            />
          </div>
          <button
            className={`layer-solo${layerSolo ? ' layer-solo--on' : ''}`}
            aria-pressed={layerSolo}
            onClick={() => setLayerSolo(!layerSolo)}
            title="Mostrar solo esta capa (las inferiores quedan en gris)"
          >
            Sola
          </button>
        </div>
      )}

      {centerTab === 'gcode' && (
        <div className="gcode-drawer"
          style={{ left: insets.left, right: insets.right + sliderInset, top: insets.top, bottom: bottomInset }}>
          <GcodeOutput gcode={gcode} onClose={() => onTabChange('preview')} />
          {toolpath.length > 0 && (
            <canvas ref={topdownRef} width={160} height={120} className="gcode-topdown" />
          )}
        </div>
      )}

      {hasDock && (
        <div className="dock" ref={dockRef} style={{ left: insets.left, right: insets.right, bottom: STAGE_GAP }}>
          {timelineEditor}
          <div className="dock-row">
            {timelineLead}
            <div className="timeline-track">
              {/* Keyframe lane: inset by half the slider thumb so t lines up with the thumb centre */}
              <div
                className="kf-lane"
                ref={trackRef}
                onMouseDown={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  onTimelineChange(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
                }}
              >
                {!draggingKfId && !findKeyframeAt(keyframes, timelineProgress) && (
                  <button
                    className="kf-ghost"
                    style={{ left: `${timelineProgress * 100}%` }}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={onAddKeyframe}
                    title="Añadir keyframe aquí (K)"
                    aria-label="Añadir keyframe aquí"
                  >+</button>
                )}

                {[...keyframes].sort((a, b) => a.t - b.t).map((kf, i) => {
                  const dragging = kf.id === draggingKfId;
                  return (
                    <div
                      key={kf.id}
                      className={`kf-badge kf-marker${kf.id === selectedKfId ? ' kf-selected' : ''}${dragging ? ' kf-dragging' : ''}`}
                      style={{ left: `${kf.t * 100}%`, '--kf-c': keyframeColor(kf.t) } as CSSProperties}
                      onMouseDown={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        kfDragRef.current = { id: kf.id, startX: e.clientX, moved: false };
                      }}
                      title={dragging ? undefined : `Keyframe ${i + 1} · ${(kf.t * 100).toFixed(1)}% — clic para editar, arrastrar para mover`}
                    >{i + 1}</div>
                  );
                })}

                {(() => {
                  const kf = keyframes.find(k => k.id === draggingKfId);
                  return kf && (
                    <span className="kf-drag-label" style={{ left: `${kf.t * 100}%` }}>
                      {(kf.t * 100).toFixed(1)}%
                    </span>
                  );
                })()}
              </div>

              <input
                type="range" min={0} max={1} step={0.0005}
                value={timelineProgress}
                aria-label="Posición del extrusor"
                onChange={e => onTimelineChange(parseFloat(e.target.value))}
              />
            </div>
            <span className="timeline-pct">{Math.round(timelineProgress * 100)}%</span>
            {timelineActions}
          </div>
        </div>
      )}
    </div>
  );
}
