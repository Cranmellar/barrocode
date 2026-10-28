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

import { useRef, useEffect, useLayoutEffect, useCallback, useState, useMemo, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { SampledPath, PrintParams, WaveKeyframe } from '../types';
import { findKeyframeAt, partCentreSVG } from '../lib/waveGenerator';
import type { ToolpathLayer } from '../lib/toolpath';
import type { GcodeStats } from '../lib/gcodeStats';
import {
  type View3D, keyframeColor, layerColor, makeProjector, boundsOf, flattenPoints, drawScene, drawGeometry, drawTopDown, keyframeAt, layerAtT, layerLabel, layerStartTs,
} from '../lib/draw3D';
import { GcodeOutput } from './GcodeOutput';
import { FlowSteps } from './FlowSteps';
import { downloadGcode } from '../lib/gcodeGenerator';

interface Props {
  sampledPaths: SampledPath[];
  toolpath: ToolpathLayer[];
  params: PrintParams;
  // Changes when another SVG is loaded, so the camera frames the new part.
  partKey: string | null;
  timelineProgress: number;
  onTimelineChange: (v: number) => void;
  // The user moved the extruder by hand (slider or a click on the lane).
  onScrub: (v: number) => void;
  keyframes: WaveKeyframe[];
  onKeyframesChange: Dispatch<SetStateAction<WaveKeyframe[]>>;
  centerTab: 'preview' | 'gcode';
  onTabChange: (tab: 'preview' | 'gcode') => void;
  gcode: string;
  gcodeStats: GcodeStats | null;
  // An edit is waiting for its G-code; the shown G-code and stats are stale.
  gcodeBusy: boolean;
  gcodeFilename: string;
  toast: Toast | null;
  onToast: (text: string) => void;
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

export interface Toast { id: number; text: string; leaving?: boolean }

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Counts up or down to a new value instead of jumping.
function useCountUp(value: number | null, ms = 420): number | null {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  useEffect(() => {
    const from = shownRef.current;
    const set = (v: number | null) => { shownRef.current = v; setShown(v); };
    if (value === null || from === null || from === value || reducedMotion()) { set(value); return; }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      set(from + (value - from) * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

// "Add keyframe": a plus inside the keyframe diamond. `dashed` is the
// placeholder drawn on the timeline at the extruder.
export function KeyframeAddIcon({ size = 16, dashed = false }: { size?: number; dashed?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path className="kfi-diamond" d="M8 1.4 14.6 8 8 14.6 1.4 8Z"
        strokeWidth={dashed ? 1 : undefined} strokeDasharray={dashed ? '1.4 2.3' : undefined} />
      <path className="kfi-plus" d="M8 5.3v5.4M5.3 8h5.4" strokeWidth={dashed ? 1.3 : undefined} />
    </svg>
  );
}
const LAYER_SLIDER_W = 44 + STAGE_GAP;

// Keyframe appear / disappear and keyframe-editor close, matching index.css.
const KF_POP_MS = 320;
const KF_LEAVE_MS = 180;
// A dragged keyframe snaps to a layer's start (its seam) within this many
// pixels of the timeline; Alt drags freely.
const KF_SNAP_PX = 6;
const EDITOR_LEAVE_MS = 160;

// Diamond size while popping in: overshoots to 1.25, settles at 1.
function popScale(p: number): number {
  const out = (x: number) => 1 - (1 - x) ** 3;
  return p < 0.6 ? 1.25 * out(p / 0.6) : 1.25 - 0.25 * out((p - 0.6) / 0.4);
}

const VIEW_TWEEN_MS = 300;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;


const VIEW_PRESETS = [
  { label: 'Isométrica', azimuth: 325, elevation: 28, title: 'Vista isométrica' },
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
  sampledPaths, toolpath, params, partKey,
  timelineProgress, onTimelineChange, onScrub,
  keyframes, onKeyframesChange,
  centerTab, onTabChange, gcode, gcodeStats: stats, gcodeBusy, gcodeFilename, toast, onToast,
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
  const [dragSnapped, setDragSnapped] = useState(false);
  const trackRef     = useRef<HTMLDivElement>(null);
  // Stable refs so window handlers never capture stale closure values
  const onKfsRef        = useRef(onKeyframesChange);
  const selectedKfIdRef = useRef(selectedKfId);
  const onKfSelectRef   = useRef(onKfSelect);
  const onTimelineRef   = useRef(onTimelineChange);
  useEffect(() => { onKfsRef.current        = onKeyframesChange; }, [onKeyframesChange]);
  useEffect(() => { selectedKfIdRef.current = selectedKfId;      }, [selectedKfId]);
  useEffect(() => { onKfSelectRef.current   = onKfSelect;        }, [onKfSelect]);
  useEffect(() => { onTimelineRef.current   = onTimelineChange;  }, [onTimelineChange]);

  const centre = useMemo(() => partCentreSVG(sampledPaths), [sampledPaths]);

  // ── Keyframes appearing and disappearing ─────────────────────────────────
  // New keyframes pop in on the timeline and in the 3D view; removed ones
  // shrink away on the timeline before they go.
  const [born, setBorn] = useState<Record<string, number>>({});
  const bornRef = useRef(born);
  bornRef.current = born;
  const [popNow, setPopNow] = useState(0);
  const [leavingKfs, setLeavingKfs] = useState<{ kf: WaveKeyframe; number: number }[]>([]);
  const prevKfsRef = useRef<WaveKeyframe[] | null>(null);
  useEffect(() => {
    const prev = prevKfsRef.current;
    prevKfsRef.current = keyframes;
    if (!prev || reducedMotion()) return;
    const ids = new Set(keyframes.map(k => k.id));
    const prevIds = new Set(prev.map(k => k.id));
    const added = keyframes.filter(k => !prevIds.has(k.id));
    if (added.length > 0) {
      const now = performance.now();
      setBorn(b => ({ ...b, ...Object.fromEntries(added.map(k => [k.id, now])) }));
    }
    const removed = prev
      .map((kf, i) => ({ kf, number: i + 1 }))
      .filter(m => !ids.has(m.kf.id));
    if (removed.length > 0) {
      setLeavingKfs(l => [...l, ...removed]);
      setTimeout(() => setLeavingKfs(l => l.filter(m => !removed.includes(m))), KF_LEAVE_MS);
    }
  }, [keyframes]);

  const popping = Object.keys(born).length > 0;
  useEffect(() => {
    if (!popping) return;
    let raf = 0;
    const step = (now: number) => {
      setPopNow(now);
      if (Object.values(bornRef.current).every(t => now - t > KF_POP_MS)) { setBorn({}); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [popping]);

  const kfPop = useMemo(() => {
    if (!popping) return undefined;
    const m = new Map<string, number>();
    for (const [id, t0] of Object.entries(born)) m.set(id, popScale(Math.max(0, Math.min(1, (popNow - t0) / KF_POP_MS))));
    return m;
  }, [born, popNow, popping]);

  // The keyframe editor folds away instead of vanishing: its last content
  // stays mounted for the length of the closing animation.
  const lastEditorRef = useRef<ReactNode>(null);
  const [closingEditor, setClosingEditor] = useState<ReactNode>(null);
  const hasEditor = Boolean(timelineEditor);
  if (timelineEditor) lastEditorRef.current = timelineEditor;
  useLayoutEffect(() => {
    if (hasEditor) { setClosingEditor(null); return; }
    const last = lastEditorRef.current;
    lastEditorRef.current = null;
    if (!last || reducedMotion()) return;
    setClosingEditor(last);
    const t = setTimeout(() => setClosingEditor(null), EDITOR_LEAVE_MS);
    return () => clearTimeout(t);
  }, [hasEditor]);

  const flatPoints = useMemo(() => flattenPoints(toolpath), [toolpath]);
  const layerLabelAt = (t: number) => layerLabel(layerAtT(toolpath, t), params.layerHeight);
  const layerStarts = useMemo(() => layerStartTs(toolpath), [toolpath]);
  const layerStartsRef = useRef(layerStarts);
  useEffect(() => { layerStartsRef.current = layerStarts; }, [layerStarts]);

  const modelBounds = useMemo(() => {
    if (flatPoints.length === 0) return null;
    return boundsOf(flatPoints, p => p.x, p => p.y);
  }, [flatPoints]);

  // The camera turns around the middle of the part, not the bed origin, so
  // a part placed far out on its artboard doesn't swing off screen.
  const modelCentre = useMemo(() => {
    if (!modelBounds) return null;
    const b = modelBounds;
    const zMid = (toolpath[0].z + toolpath[toolpath.length - 1].z) / 2;
    return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, zMid] as const;
  }, [modelBounds, toolpath]);

  // `from` turned to new angles, with the part's centre left where it was on screen.
  const orbit = (from: View3D, azimuth: number, elevation: number): View3D => {
    if (!modelCentre) return { ...from, azimuth, elevation };
    const [fx, fy] = makeProjector(from.azimuth, from.elevation)(...modelCentre);
    const [px, py] = makeProjector(azimuth, elevation)(...modelCentre);
    return {
      ...from, azimuth, elevation,
      offsetX: from.offsetX + (fx - px) * from.scale,
      offsetY: from.offsetY + (fy - py) * from.scale,
    };
  };

  // ── Keyframe drag (window-level so it works outside the track) ───────────
  useEffect(() => {
    // Each move re-runs the wave pipeline, so moves are applied at most
    // once per frame, from the latest pointer position.
    let pending: { x: number; free: boolean } | null = null;
    let frame = 0;
    function apply() {
      frame = 0;
      const d = kfDragRef.current;
      const m = pending;
      pending = null;
      if (!d || !m || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const rawT = Math.max(0, Math.min(1, (m.x - rect.left) / rect.width));
      let newT = rawT;
      if (!m.free) {
        let best = KF_SNAP_PX / rect.width;
        for (const s of layerStartsRef.current) {
          if (Math.abs(s - rawT) < best) { best = Math.abs(s - rawT); newT = s; }
        }
      }
      const snapped = newT !== rawT;
      setDragSnapped(snapped);
      // Unsorted until release, so numbers hold while passing a neighbour.
      onKfsRef.current(kfs => kfs.map(k => k.id === d.id ? { ...k, t: newT } : k));
      onTimelineRef.current(newT);
    }
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
      pending = { x: e.clientX, free: e.altKey };
      if (!frame) frame = requestAnimationFrame(apply);
    }
    function onUp() {
      const d = kfDragRef.current;
      if (!d) return;
      if (frame) { cancelAnimationFrame(frame); apply(); }
      if (d.moved) onKfsRef.current(kfs => [...kfs].sort((a, b) => a.t - b.t));
      else onKfSelectRef.current(d.id);
      kfDragRef.current = null;
      setDraggingKfId(null);
      document.body.style.cursor = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      cancelAnimationFrame(frame);
    };
  }, []); // stable — all state accessed through refs

  // ── Camera motion ───────────────────────────────────────────────────────
  // Presets, "Encuadrar" and panel changes move the camera over VIEW_TWEEN_MS
  // instead of cutting; releasing a rotation drag lets it coast to a stop.
  // Both draw with the LOD used while dragging, and show the angles.
  const viewRef = useRef(view);
  viewRef.current = view;
  const camAnimRef = useRef(0);
  const [presetTarget, setPresetTarget] = useState<number | null>(null);
  const [showAngles, setShowAngles] = useState(false);
  const stopCamAnim = () => {
    cancelAnimationFrame(camAnimRef.current);
    camAnimRef.current = 0;
    setPresetTarget(null);
  };
  const settle = () => {
    camAnimRef.current = 0;
    setIsInteracting(false);
    setShowAngles(false);
  };

  const animateView = (to: View3D) => {
    stopCamAnim();
    const from = viewRef.current;
    if (reducedMotion() || flatPoints.length === 0) { setView(to); return; }
    setPresetTarget(VIEW_PRESETS.findIndex(v => v.azimuth === to.azimuth && v.elevation === to.elevation));
    if (interactTimerRef.current) clearTimeout(interactTimerRef.current);
    setIsInteracting(true);
    setShowAngles(from.azimuth !== to.azimuth || from.elevation !== to.elevation);
    // The part's centre travels in a straight line on screen while the
    // camera turns around it, so the part pivots instead of swinging.
    const c = modelCentre!;
    const screenOf = (v: View3D) => {
      const [px, py] = makeProjector(v.azimuth, v.elevation)(...c);
      return [v.offsetX + px * v.scale, v.offsetY + py * v.scale];
    };
    const [fx, fy] = screenOf(from), [tx, ty] = screenOf(to);
    const dAz = ((to.azimuth - from.azimuth) % 360 + 540) % 360 - 180;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / VIEW_TWEEN_MS);
      if (p >= 1) {
        setView(to);
        setPresetTarget(null);
        settle();
        return;
      }
      const e = 1 - (1 - p) ** 4;
      const azimuth = (from.azimuth + dAz * e + 360) % 360;
      const elevation = from.elevation + (to.elevation - from.elevation) * e;
      const scale = from.scale * (to.scale / from.scale) ** e;
      const [px, py] = makeProjector(azimuth, elevation)(...c);
      setView({
        azimuth, elevation, scale,
        offsetX: fx + (tx - fx) * e - px * scale,
        offsetY: fy + (ty - fy) * e - py * scale,
      });
      camAnimRef.current = requestAnimationFrame(step);
    };
    camAnimRef.current = requestAnimationFrame(step);
  };
  const animateViewRef = useRef(animateView);
  animateViewRef.current = animateView;
  useEffect(() => () => cancelAnimationFrame(camAnimRef.current), []);

  // Rotation speed of the last drag moves, in degrees per frame.
  const spinRef = useRef({ vAz: 0, vEl: 0, x: 0, y: 0, t: 0 });
  const coast = () => {
    let { vAz, vEl } = spinRef.current;
    if (reducedMotion() || performance.now() - spinRef.current.t > 60 || Math.hypot(vAz, vEl) < 0.3) return false;
    const step = () => {
      vAz *= 0.9; vEl *= 0.9;
      setView(v => orbit(v, (v.azimuth + vAz + 360) % 360, Math.max(0, Math.min(89, v.elevation + vEl))));
      if (Math.hypot(vAz, vEl) > 0.05) camAnimRef.current = requestAnimationFrame(step);
      else settle();
    };
    camAnimRef.current = requestAnimationFrame(step);
    return true;
  };

  // ── Auto-fit ────────────────────────────────────────────────────────────
  const fitView = useCallback((azimuth = view.azimuth, elevation = view.elevation, animate = false) => {
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
    const target = {
      azimuth, elevation, scale,
      offsetX: left + width / 2 - ((minX + maxX) / 2) * scale,
      offsetY: insets.top + height / 2 - ((minY + maxY) / 2) * scale,
    };
    if (animate) animateViewRef.current(target);
    else setView(target);
  }, [flatPoints, toolpath.length, view.azimuth, view.elevation, insets.left, insets.right, insets.top]);

  // Opening or closing a side panel reframes the part in the new free area.
  const fitRef = useRef(fitView);
  useEffect(() => { fitRef.current = fitView; }, [fitView]);
  useEffect(() => { fitRef.current(undefined, undefined, true); }, [insets.left, insets.right]);

  const prevLayerCount = useRef(0);
  const prevPartKey = useRef<string | null>(null);
  useEffect(() => {
    if (toolpath.length > 0 && (toolpath.length !== prevLayerCount.current || partKey !== prevPartKey.current)) {
      prevLayerCount.current = toolpath.length;
      prevPartKey.current = partKey;
      const t = setTimeout(() => fitView(), 60);
      return () => clearTimeout(t);
    }
  }, [toolpath.length, partKey, fitView]);

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
      ...geometry, flatPoints, modelBounds, sampledPaths, centre, timelineProgress,
      keyframes, selectedKfId, showDims: viewOpts.showDims, kfPop,
      inset: { left: insets.left, right: insets.right + sliderInset, top: insets.top, bottom: bottomInset },
    }, cache);
    ctx.restore();
  }, [size, sampledPaths, toolpath, flatPoints, modelBounds, params, view, timelineProgress, centre, keyframes, selectedKfId, isInteracting, visibleCap, layerSolo, viewOpts, insets, bottomInset, sliderInset, kfPop]);

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
    const wasRotating = dragRef.current?.button === 2;
    dragRef.current = null;
    if (wasRotating && coast()) return;
    setShowAngles(false);
    if (interactTimerRef.current) clearTimeout(interactTimerRef.current);
    interactTimerRef.current = setTimeout(() => {
      interactTimerRef.current = null;
      setIsInteracting(false);
    }, 150);
  };
  const kfUnder = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return keyframeAt(
      { view, toolpath, flatPoints, keyframes, selectedKfId, layerCap: visibleCap, layerSolo },
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
    stopCamAnim();
    dragRef.current = { button: e.button, startX: e.clientX, startY: e.clientY, startView: { ...view } };
    spinRef.current = { vAz: 0, vEl: 0, x: e.clientX, y: e.clientY, t: performance.now() };
    if (interactTimerRef.current) clearTimeout(interactTimerRef.current);
    setIsInteracting(true);
    if (e.button === 2) setShowAngles(true);
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
      const sp = spinRef.current;
      const now = performance.now();
      const k = 16 / Math.max(1, now - sp.t);
      sp.vAz = 0.6 * sp.vAz + 0.4 * (-(e.clientX - sp.x) * 0.5 * k);
      sp.vEl = 0.6 * sp.vEl + 0.4 * ((e.clientY - sp.y) * 0.3 * k);
      sp.x = e.clientX; sp.y = e.clientY; sp.t = now;
      setView(orbit(
        d.startView,
        (d.startView.azimuth - dx * 0.5 + 360) % 360,
        Math.max(0, Math.min(89, d.startView.elevation + dy * 0.3)),
      ));
    }
  };
  const onMouseUp = stopInteracting;
  const onContextMenu = (e: React.MouseEvent) => e.preventDefault();
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    stopCamAnim();
    setShowAngles(false);
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

  // The highlight of the view presets slides to the active one and fades out
  // once the camera leaves every preset.
  const exactPreset = VIEW_PRESETS.findIndex(v => view.azimuth === v.azimuth && view.elevation === v.elevation);
  const activePreset = presetTarget !== null && presetTarget >= 0 ? presetTarget : exactPreset;
  const presetRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [presetInd, setPresetInd] = useState({ x: 0, w: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const b = presetRefs.current[activePreset];
      if (b) setPresetInd({ x: b.offsetLeft, w: b.offsetWidth });
    };
    measure();
    document.fonts?.ready.then(measure);
  }, [activePreset]);

  const numLayers = toolpath.length;
  const totalPts = flatPoints.length;
  const shownCap = Math.min(layerCap ?? numLayers, numLayers);

  const shownTime = useCountUp(stats ? stats.timeSec : null);
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
          <button className="btn-icon" onClick={() => fitView(undefined, undefined, true)} aria-label="Encuadrar la pieza"
            title="Encuadrar la pieza. En la vista: arrastrar = desplazar · clic derecho = rotar · rueda = zoom">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1.5 5V1.5H5M11 1.5h3.5V5M14.5 11v3.5H11M5 14.5H1.5V11" />
              <path d="M8 4.6l3 1.7v3.4L8 11.4 5 9.7V6.3zM5 6.3l3 1.7 3-1.7M8 8v3.4" strokeWidth="1.2" />
            </svg>
          </button>
          <div className="view-presets" role="group" aria-label="Vistas">
            <span className="view-presets-ind" aria-hidden="true" style={{
              width: presetInd.w,
              transform: `translateX(${presetInd.x}px) scale(${activePreset < 0 ? 0.92 : 1})`,
              opacity: activePreset < 0 || presetInd.w === 0 ? 0 : 1,
            }} />
            {VIEW_PRESETS.map((v, i) => (
              <button key={v.label} ref={el => { presetRefs.current[i] = el; }}
                aria-pressed={i === activePreset}
                className={`view-preset${i === activePreset ? ' view-preset--on' : ''}`}
                onClick={() => fitView(v.azimuth, v.elevation, true)}
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
            <span className={`stage-summary${gcodeBusy ? ' stage-summary--stale' : ''}`} title={[
              stats && `Impresión ${Math.round(stats.printLength).toLocaleString()} mm · desplazamiento ${Math.round(stats.travelLength).toLocaleString()} mm`,
              stats && params.generateE && `E total ${stats.eTotal.toFixed(1)}`,
              `${numLayers} capas · ${totalPts.toLocaleString()} pts`,
              crossings > 0 && `${crossings} cruce${crossings !== 1 ? 's' : ''} con z-hop`,
              `Tiempo estimado a ${params.printSpeed} mm/min, sin aceleraciones`,
            ].filter(Boolean).join('\n')}>
              {shownTime !== null && <>{formatDuration(shownTime)}<span className="stage-summary-sep"> · </span></>}
              {fmtMM(modelBounds.maxX - modelBounds.minX)}×{fmtMM(modelBounds.maxY - modelBounds.minY)}×{fmtMM(numLayers * params.layerHeight)} mm
            </span>
          )}
          <button className={`btn-small${centerTab === 'gcode' ? ' btn-small--on' : ''}`}
            aria-pressed={centerTab === 'gcode'} disabled={!gcode}
            onClick={() => onTabChange(centerTab === 'gcode' ? 'preview' : 'gcode')}
            title="Ver el G-code (G)">G-code</button>
          <button className="btn-primary btn-signal" disabled={!gcode}
            onClick={() => {
              downloadGcode(gcode, gcodeFilename);
              onToast(`${gcodeFilename} descargado · ${formatSize(new Blob([gcode]).size)}`);
            }}
            title={`Descargar ${gcodeFilename}`}>↓ Descargar</button>
          <button className="btn-icon" onClick={onHelp} aria-haspopup="dialog"
            aria-label="Ayuda: cómo usar BarroCode" title="Ayuda (?)">?</button>
          {gcodeBusy && gcode && <span className="gcode-progress" role="progressbar" aria-label="Generando G-code" />}
        </div>
      </div>

      {sampledPaths.length === 0 && numLayers === 0 && (
        <div className="stage-empty"
          style={{ left: insets.left, right: insets.right + sliderInset, top: insets.top, bottom: bottomInset }}>
          <FlowSteps />
        </div>
      )}

      {numLayers > 0 && (
        <span className={`view-angles${showAngles ? ' view-angles--on' : ''}`} aria-hidden="true"
          style={{ left: insets.left + 64, bottom: bottomInset + 20 }}>
          az {Math.round(view.azimuth) % 360}° · el {Math.round(view.elevation)}°
        </span>
      )}

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
          <GcodeOutput gcode={gcode} stale={gcodeBusy} onClose={() => onTabChange('preview')} />
          {toolpath.length > 0 && (
            <canvas ref={topdownRef} width={160} height={120} className="gcode-topdown" />
          )}
        </div>
      )}

      <div className="toast-region" aria-live="polite"
        style={{ left: insets.left, right: insets.right, bottom: bottomInset + STAGE_GAP }}>
        {toast && (
          <div key={toast.id} className={`toast${toast.leaving ? ' toast-leave' : ''}`}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" /></svg>
            {toast.text}
          </div>
        )}
      </div>

      {hasDock && (
        <div className="dock" ref={dockRef} style={{ left: insets.left, right: insets.right, bottom: STAGE_GAP }}>
          {timelineEditor ?? (closingEditor && <div className="dock-editor-leave" aria-hidden="true">{closingEditor}</div>)}
          <div className="dock-row">
            {timelineLead}
            <div className="timeline-track">
              {/* Keyframe lane: inset by half the slider thumb so t lines up with the thumb centre */}
              <div
                className="kf-lane"
                ref={trackRef}
                onMouseDown={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  onScrub(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
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
                  ><KeyframeAddIcon size={22} dashed /></button>
                )}

                {keyframes.map((kf, i) => {
                  const dragging = kf.id === draggingKfId;
                  return (
                    <div
                      key={kf.id}
                      className={`kf-badge kf-marker${kf.smooth ? ' kf-smooth' : ''}${kf.id === selectedKfId ? ' kf-selected' : ''}${dragging ? ' kf-dragging' : ''}${born[kf.id] ? ' kf-born' : ''}`}
                      style={{ left: `${kf.t * 100}%`, '--kf-c': keyframeColor(kf.t) } as CSSProperties}
                      onMouseDown={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        kfDragRef.current = { id: kf.id, startX: e.clientX, moved: false };
                      }}
                      title={dragging ? undefined : `Keyframe ${i + 1} · ${(kf.t * 100).toFixed(1)}% · ${layerLabelAt(kf.t)} — clic para editar, arrastrar para mover (se ajusta al inicio de capa; Alt para mover libre)`}
                    >{i + 1}</div>
                  );
                })}

                {leavingKfs.map(({ kf, number }) => (
                  <div key={`leave-${kf.id}`} className={`kf-badge kf-marker kf-leave${kf.smooth ? ' kf-smooth' : ''}`} aria-hidden="true"
                    style={{ left: `${kf.t * 100}%`, '--kf-c': keyframeColor(kf.t) } as CSSProperties}>{number}</div>
                ))}

                {(() => {
                  const kf = keyframes.find(k => k.id === draggingKfId);
                  return kf && (
                    <span className="kf-drag-label" style={{ left: `${kf.t * 100}%` }}>
                      {(kf.t * 100).toFixed(1)}% · {dragSnapped ? 'inicio de ' : ''}{layerLabelAt(kf.t)}
                    </span>
                  );
                })()}
              </div>

              <input
                type="range" min={0} max={1} step={0.0005}
                value={timelineProgress}
                aria-label="Posición del extrusor"
                onChange={e => onScrub(parseFloat(e.target.value))}
              />
            </div>
            <span className="timeline-pct" title="Posición del extrusor en el recorrido, su capa y la altura de la pieza al terminarla">
              {Math.round(timelineProgress * 100)}%
              <span className="timeline-layer">{layerLabelAt(timelineProgress)}</span>
            </span>
            {timelineActions}
          </div>
        </div>
      )}
    </div>
  );
}
