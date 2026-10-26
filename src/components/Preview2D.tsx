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
 * Los keyframes se marcan como diamantes en su propio carril, sobre la barra de tiempo.
 */

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { SampledPath, WaveLayer, PrintParams, SVGViewBox, WaveKeyframe } from '../types';
import { findKeyframeAt } from '../lib/waveGenerator';
import { buildToolpath } from '../lib/toolpath';
import { summarizeGcode } from '../lib/gcodeStats';
import {
  type View3D, project, boundsOf, flattenPoints, drawScene, drawTopDown,
} from '../lib/draw3D';
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

const LAYER_SLIDER_W = 56;

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

function fmtMM(v: number): string {
  return v >= 100 ? v.toFixed(0) : v.toFixed(1);
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
    azimuth: 325, elevation: 28, scale: 3, offsetX: 0, offsetY: 0,
  });
  const [isInteracting, setIsInteracting] = useState(false);
  // null = all layers; otherwise the 1-based top layer shown.
  const [layerCap, setLayerCap] = useState<number | null>(null);
  const [layerSolo, setLayerSolo] = useState(false);
  const interactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Recomputed only when layers/projection params change, not on every camera move.
  const toolpath = useMemo(
    () => buildToolpath(layers, params, svgH),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layers, params.scaleFactor, params.originX, params.originY, params.flipY, params.zHopHeight, params.hopRadius, svgH],
  );

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

    const projected = flatPoints.map(p => project(p.x, p.y, p.z, azimuth, elevation));
    const { minX, maxX, minY, maxY } = boundsOf(projected, p => p[0], p => p[1]);
    const margin = 48;
    // Keep the model clear of the layer slider on the right edge.
    const width = rect.width - (layers.length > 1 ? LAYER_SLIDER_W : 0);
    const scale = Math.min(
      (width       - margin * 2) / (maxX - minX || 1),
      (rect.height - margin * 2) / (maxY - minY || 1),
      20,
    );
    setView(v => ({
      ...v, azimuth, elevation, scale,
      offsetX: width       / 2 - ((minX + maxX) / 2) * scale,
      offsetY: rect.height / 2 - ((minY + maxY) / 2) * scale,
    }));
  }, [flatPoints, layers.length, view.azimuth, view.elevation]);

  const prevLayerCount = useRef(0);
  useEffect(() => {
    if (layers.length > 0 && layers.length !== prevLayerCount.current) {
      prevLayerCount.current = layers.length;
      const t = setTimeout(() => fitView(), 60);
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

    drawScene(ctx, rect.width, rect.height, {
      view, toolpath, flatPoints, modelBounds, sampledPaths, params, svgH,
      keyframes, selectedKfId, timelineProgress, isInteracting,
      layerCap: Math.min(layerCap ?? toolpath.length, toolpath.length) - 1,
      layerSolo,
    });
  }, [sampledPaths, toolpath, flatPoints, modelBounds, params, view, timelineProgress, svgH, keyframes, selectedKfId, isInteracting, layerCap, layerSolo]);

  // ── Top-down mini diagram (G-code tab) ───────────────────────────────────
  useEffect(() => {
    if (centerTab !== 'gcode') return;
    const canvas = topdownRef.current;
    if (!canvas || layers.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawTopDown(ctx, canvas.width, canvas.height, toolpath, flatPoints);
  }, [centerTab, layers, toolpath, flatPoints]);

  // ── Mouse interaction ─────────────────────────────────────────────────────
  const stopInteracting = () => {
    dragRef.current = null;
    if (interactTimerRef.current) clearTimeout(interactTimerRef.current);
    interactTimerRef.current = setTimeout(() => {
      interactTimerRef.current = null;
      setIsInteracting(false);
    }, 150);
  };
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { button: e.button, startX: e.clientX, startY: e.clientY, startView: { ...view } };
    if (interactTimerRef.current) clearTimeout(interactTimerRef.current);
    setIsInteracting(true);
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

  const numLayers = layers.length;
  const totalPts = flatPoints.length;
  const shownCap = Math.min(layerCap ?? numLayers, numLayers);

  const stats = useMemo(() => (gcode ? summarizeGcode(gcode) : null), [gcode]);
  const crossings = toolpath.reduce((n, l) => n + l.crossings, 0);

  return (
    <div className="preview-container">
      <div className="toolbar">
        {centerTab === 'preview' && (
          <>
            <span className="toolbar-title">Trayectoria</span>
            <button className="btn-small" onClick={() => fitView()} title="Encuadrar la pieza">Ajustar</button>
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
            {layers.length > 0 && modelBounds && (
              <span className="toolbar-info" title={[
                stats && `Impresión ${Math.round(stats.printLength).toLocaleString()} mm · desplazamiento ${Math.round(stats.travelLength).toLocaleString()} mm`,
                stats && params.generateE && `E total ${stats.eTotal.toFixed(1)}`,
                `${numLayers} capas · ${totalPts.toLocaleString()} pts`,
                crossings > 0 && `${crossings} cruce${crossings !== 1 ? 's' : ''} con z-hop`,
                'Tiempo a velocidad programada, sin aceleraciones',
              ].filter(Boolean).join('\n')}>
                {stats && <>≈ {formatDuration(stats.timeSec)} · </>}
                {fmtMM(modelBounds.maxX - modelBounds.minX)} × {fmtMM(modelBounds.maxY - modelBounds.minY)} × {fmtMM(numLayers * params.layerHeight)} mm
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
        <div className="preview-stage">
          <canvas
            ref={canvasRef}
            className="preview-canvas"
            title="Arrastrar = desplazar · Clic derecho = rotar · Rueda = zoom"
            style={{ cursor: dragRef.current?.button === 2 ? 'crosshair' : 'grab' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onContextMenu={onContextMenu}
            onWheel={onWheel}
          />
          {numLayers > 1 && (
            <div className="layer-slider">
              <span className="layer-slider-value" title="Capa superior visible">
                {shownCap}<span className="layer-slider-total">/{numLayers}</span>
              </span>
              <input
                type="range" min={1} max={numLayers} step={1}
                value={shownCap}
                aria-label="Capas visibles"
                onChange={e => {
                  const v = parseInt(e.target.value, 10);
                  setLayerCap(v >= numLayers ? null : v);
                }}
              />
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
        </div>
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
              {(() => {
                const sorted = [...keyframes].sort((a, b) => a.t - b.t);
                if (sorted.length === 0) return null;
                const p = timelineProgress;
                const first = sorted[0].t;
                const last = sorted[sorted.length - 1].t;
                const segClass = (hold: boolean, active: boolean) =>
                  `kf-seg${hold ? ' kf-seg--hold' : ''}${active ? ' kf-seg--active' : ''}`;
                return (
                  <>
                    <div
                      className={segClass(true, p < first)}
                      style={{ left: 0, width: `${first * 100}%` }}
                      title="Antes del primer keyframe se usan sus valores"
                    />
                    {sorted.slice(1).map((b, i) => {
                      const a = sorted[i];
                      return (
                        <div
                          key={a.id}
                          className={segClass(false, p >= a.t && p < b.t)}
                          style={{ left: `${a.t * 100}%`, width: `${(b.t - a.t) * 100}%` }}
                          title={`Interpolación: KF ${Math.round(a.t * 100)}% → KF ${Math.round(b.t * 100)}%`}
                        />
                      );
                    })}
                    <div
                      className={segClass(true, p >= last)}
                      style={{ left: `${last * 100}%`, right: 0 }}
                      title="Después del último keyframe se mantienen sus valores"
                    />
                  </>
                );
              })()}

              <div className="timeline-playhead" style={{ left: `${timelineProgress * 100}%` }} />

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

              {keyframes.map(kf => {
                const dragging = kf.id === draggingKfId;
                return (
                  <div
                    key={kf.id}
                    className={`kf-diamond${kf.id === selectedKfId ? ' kf-selected' : ''}${dragging ? ' kf-dragging' : ''}`}
                    style={{ left: `${kf.t * 100}%` }}
                    onMouseDown={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      kfDragRef.current = { id: kf.id, startX: e.clientX, moved: false };
                    }}
                    title={dragging ? undefined : `KF ${(kf.t * 100).toFixed(1)}% — clic para editar, arrastrar para mover`}
                  />
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
              onChange={e => onTimelineChange(parseFloat(e.target.value))}
            />
          </div>

          <span className="timeline-label" style={{ minWidth: 36, textAlign: 'right' }}>
            {Math.round(timelineProgress * 100)}%
          </span>
        </div>
      )}

    </div>
  );
}
