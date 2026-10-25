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

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { SampledPath, WaveLayer, PrintParams, SVGViewBox, WaveKeyframe } from '../types';
import { findKeyframeAt } from '../lib/waveGenerator';
import { buildToolpath } from '../lib/toolpath';
import {
  type View3D, layerColor, project, boundsOf, flattenPoints, drawScene, drawTopDown,
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
  const [isInteracting, setIsInteracting] = useState(false);
  const interactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      d.moved = true;
      document.body.style.cursor = 'ew-resize';
      const rect = trackRef.current.getBoundingClientRect();
      const newT  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onKfsRef.current(
        kfsRef.current
          .map(k => k.id === d.id ? { ...k, t: newT } : k)
          .sort((a, b) => a.t - b.t),
      );
      // The extruder rides along with the keyframe being edited.
      if (d.id === selectedKfIdRef.current) onTimelineRef.current(newT);
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
    if (!canvas || flatPoints.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    const projected = flatPoints.map(p => project(p.x, p.y, p.z, view.azimuth, view.elevation));
    const { minX, maxX, minY, maxY } = boundsOf(projected, p => p[0], p => p[1]);
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
  }, [flatPoints, view.azimuth, view.elevation]);

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

    drawScene(ctx, rect.width, rect.height, {
      view, toolpath, flatPoints, modelBounds, sampledPaths, params, svgH,
      keyframes, selectedKfId, timelineProgress, isInteracting,
    });
  }, [sampledPaths, toolpath, flatPoints, modelBounds, params, view, timelineProgress, svgH, keyframes, selectedKfId, isInteracting]);

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
              const atKf = findKeyframeAt(keyframes, timelineProgress);
              const confirm = atKf !== null && atKf.id === selectedKfId;
              return (
                <button
                  className="timeline-thumb-tag"
                  style={{ left: `calc(${timelineProgress * 100}% + ${((0.5 - timelineProgress) * 14).toFixed(2)}px)` }}
                  onClick={onAddKeyframe}
                  title={confirm ? 'Terminar de editar este keyframe'
                    : atKf ? 'Seleccionar el keyframe de aquí'
                    : 'Añadir keyframe aquí'}
                >
                  <span className="ttt-diamond" style={{ background: dColor }} />
                  <span className="ttt-plus">{confirm ? '✓' : atKf ? '›' : '+'}</span>
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
