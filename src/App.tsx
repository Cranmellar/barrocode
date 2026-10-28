import { useState, useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import type { PrintParams, ParsedSVG, WaveKeyframe, SampledPath } from './types';
import { parseSVG } from './lib/svgParser';
import { generateWaveLayers, getParamsAtT, findKeyframeAt, WAVE_PARAMS } from './lib/waveGenerator';
import { buildToolpath, TOOLPATH_PARAMS } from './lib/toolpath';
import { generateGcode } from './lib/gcodeGenerator';
import { keyframeColor, layerAtT, layerLabel } from './lib/draw3D';
import { PathParams } from './components/PathParams';
import { LissajousParams } from './components/LissajousParams';
import { LissajousPreview } from './components/LissajousPreview';
import { Preview2D, STAGE_GAP, KeyframeAddIcon, type Toast } from './components/Preview2D';
import { PathList } from './components/PathList';
import { NumInput } from './components/NumInput';
import { CenterPad } from './components/CenterPad';
import { HelpDialog } from './components/HelpDialog';

const _S1 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><path d="M480 160 320 0H160v160H0v160l160 160h160V320h160V160z" fill="#55555D"/></svg>`;
const _S2 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><path d="m337 320 63-160h-80a160 160 0 1 0-320 0h160L80 320h80a160 160 0 1 0 320 0H337Z" fill="#55555D"/></svg>`;
const _S3 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><path d="M360 240c-66.3 0-120-53.7-120-120a120 120 0 1 0-120 120c66.3 0 120 53.7 120 120a120 120 0 1 0 120-120Z" fill="#55555D"/></svg>`;
const _S4 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><path d="M450 210a57 57 0 0 1-40.3-97.3 30 30 0 1 0-42.4-42.4A57 57 0 0 1 270 30a30 30 0 1 0-60 0 57 57 0 0 1-97.3 40.3 30 30 0 1 0-42.4 42.4A57 57 0 0 1 30 210a30 30 0 1 0 0 60 57 57 0 0 1 40.3 97.3 30 30 0 1 0 42.4 42.4A57 57 0 0 1 210 450a30 30 0 1 0 60 0 57 57 0 0 1 97.3-40.3 30 30 0 1 0 42.4-42.4A57 57 0 0 1 450 270a30 30 0 1 0 0-60Zm-210 90a60 60 0 1 1 0-120 60 60 0 0 1 0 120Z" fill="#55555D"/></svg>`;
const _S5 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><path d="M450 210h-98l84.9-49a30 30 0 1 0-30-52l-85 49 49-84.9a30 30 0 0 0-52-30l-48.9 85V30a30 30 0 1 0-60 0v98l-49-84.9a30 30 0 1 0-52 30l49 85-84.9-49a30 30 0 0 0-30 52l85 48.9H30a30 30 0 1 0 0 60h98l-84.9 49a30 30 0 1 0 30 52l85-49-49 84.9a30 30 0 0 0 52 30l48.9-85V450a30 30 0 1 0 60 0v-98l49 84.9a30 30 0 1 0 52-30l-49-85 84.9 49a30 30 0 0 0 30-52l-85-48.9H450a30 30 0 1 0 0-60Z" fill="#55555D"/></svg>`;
const _S6 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><path d="M409.7 409.7c33.2-33.2 23.8-100.2-17.9-169.7 41.7-69.6 51.1-136.5 18-169.7C376.4 37 309.4 46.5 240 88.2 170.4 46.5 103.5 37 70.3 70.2 37 103.6 46.5 170.5 88.2 240c-41.7 69.5-51.1 136.5-18 169.7 33.3 33.2 100.2 23.8 169.8-17.9 69.5 41.7 136.5 51.1 169.7 18Z" fill="#55555D"/></svg>`;
const _S7 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><path d="m349.4 276.5 54.7 18.2a57.7 57.7 0 1 0 0-109.4l-54.7 18.2a57.4 57.4 0 0 1-27.1 2.4c5.1-7 12-13 20.8-17.5l51.6-25.8a57.7 57.7 0 1 0-77.3-77.3l-25.8 51.6a57.4 57.4 0 0 1-17.5 20.8 57.4 57.4 0 0 1 2.4-27.1l18.2-54.7a57.6 57.6 0 1 0-109.4 0l18.2 54.7a57.4 57.4 0 0 1 2.4 27.1 57.3 57.3 0 0 1-17.5-20.8l-25.8-51.6a57.7 57.7 0 1 0-77.3 77.3l51.5 25.8a57.4 57.4 0 0 1 21 17.5c-8.7 1.4-18 .7-27.2-2.4l-54.7-18.2a57.7 57.7 0 1 0 0 109.4l54.7-18.2a57.4 57.4 0 0 1 27.1-2.4 57.3 57.3 0 0 1-20.8 17.5l-51.6 25.8a57.7 57.7 0 1 0 77.3 77.3l25.8-51.5a57.4 57.4 0 0 1 17.5-21c1.4 8.7.7 18-2.4 27.2l-18.2 54.7a57.7 57.7 0 1 0 109.4 0l-18.2-54.7a57.4 57.4 0 0 1-2.4-27.1c7 5.1 13 12 17.5 20.9l25.8 51.5a57.7 57.7 0 1 0 77.4-77.4l-51.6-25.7a57.4 57.4 0 0 1-21-17.5c8.7-1.4 18-.7 27.2 2.4Z" fill="#55555D"/><path d="M240 300a60 60 0 1 1 0-120 60 60 0 0 1 0 120Z" fill="#55555D"/></svg>`;
const _S8 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><path d="M211.5 154.6a30 30 0 0 0 57 0l15.5-46.7a46.4 46.4 0 1 0-88 0l15.5 46.7Z" fill="#55555D"/><path d="M268.5 325.4a30 30 0 0 0-57 0L196 372.1a46.4 46.4 0 1 0 88 0l-15.5-46.7Z" fill="#55555D"/><path d="M372.1 196l-46.7 15.5a30 30 0 0 0 0 57l46.7 15.5c29.8 10 60.9-12 61.1-43.3v-1.3a46.4 46.4 0 0 0-61-43.4Z" fill="#55555D"/><path d="M107.9 284l46.7-15.5a30 30 0 0 0 0-57L107.9 196a46.4 46.4 0 1 0 0 88.1Z" fill="#55555D"/><path d="M320.5 199.7l44-22a46.4 46.4 0 0 0 12.6-73.9l-.9-.9a46.4 46.4 0 0 0-74 12.5l-22 44a30 30 0 0 0 40.3 40.3Z" fill="#55555D"/><path d="M159.5 280.3l-44 22a46.4 46.4 0 0 0-12.5 74l.8.8a46.4 46.4 0 0 0 74-12.6l22-44a30 30 0 0 0-40.3-40.2Z" fill="#55555D"/><path d="M364.6 302.3l-44-22a30 30 0 0 0-40.3 40.2l22 44a46.4 46.4 0 0 0 73.9 12.6l.8-.9a46.4 46.4 0 0 0-12.4-74Z" fill="#55555D"/><path d="M115.4 177.7l44 22a30 30 0 0 0 40.3-40.2l-22-44a46.4 46.4 0 1 0-62.2 62.2Z" fill="#55555D"/></svg>`;
const svgUri = (s: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;

const SAMPLES = [
  { uri: svgUri(_S1), raw: _S1, name: 'muestra-1.gcode' },
  { uri: svgUri(_S2), raw: _S2, name: 'muestra-2.gcode' },
  { uri: svgUri(_S3), raw: _S3, name: 'muestra-3.gcode' },
  { uri: svgUri(_S4), raw: _S4, name: 'muestra-4.gcode' },
  { uri: svgUri(_S5), raw: _S5, name: 'muestra-5.gcode' },
  { uri: svgUri(_S6), raw: _S6, name: 'muestra-6.gcode' },
  { uri: svgUri(_S7), raw: _S7, name: 'muestra-7.gcode' },
  { uri: svgUri(_S8), raw: _S8, name: 'muestra-8.gcode' },
];

const DEFAULT_PARAMS: PrintParams = {
  sampleSpacing: 2,
  lissAmpN: 3,
  lissAmpT: 0,
  lissAmpZ: 0,
  lissWlN: 20,
  lissWlT: 20,
  lissWlZ: 20,
  lissDelta: 0,
  lissPhaseZ: 0,
  lissPhaseOffset: 0,
  phaseShiftPerLayer: 0,
  layerHeight: 2.5,
  numLayers: 6,
  useNumLayers: true,
  totalHeight: 15,
  nozzleHeightOffset: 1,
  safeZ: 20,
  softJoin: true,
  transitionLength: 10,
  scaleFactor: 1,
  originX: 0,
  originY: 0,
  flipY: true,
  printSpeed: 600,
  travelSpeed: 1500,
  generateE: true,
  extrusionMultiplier: 0.05,
  reversePath: false,
  alternateDirection: false,
  closePath: false,
  dwellAtStart: 0,
  primingMove: false,
  primingLength: 20,
  // Center + scale around pivot
  centerX: 0,
  centerY: 0,
  scaleX: 1,
  scaleY: 1,
  scaleUniform: true,
  rotation: 0,
  // Z-hop
  zHopHeight: 2.5,
  hopRadius: 1.0,
  // Concentric skirt travel
  skirtThreshold: 15,
};

// ── Floating panels ─────────────────────────────────────────────────────────
const LEFT_W  = 300;
const RIGHT_W = 296;
const RAIL_W  = 44;
const BAR_H   = 40;
const NARROW_W = 1280;
const TIMELINE_GLIDE_MS = 220;
const TOAST_MS = 2200;
// How long "Borrar todos" waits for its confirming second click.
const CLEAR_CONFIRM_MS = 3000;
// Matches the panel-leave animation in index.css.
const PANEL_LEAVE_MS = 140;

const PANELS_KEY = 'barrocode.panels';
interface PanelsOpen { left: boolean; right: boolean }

function loadPanels(): PanelsOpen {
  try {
    return { left: true, right: true, ...JSON.parse(localStorage.getItem(PANELS_KEY) ?? '{}') };
  } catch {
    return { left: true, right: true };
  }
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'left' ? 'M7.5 2.5 4 6l3.5 3.5' : 'M4.5 2.5 8 6l-3.5 3.5'} />
    </svg>
  );
}

// True while a scroller has content hidden below its visible area.
// `active` follows whether the scroller is mounted (its panel can be hidden).
function useScrollMore<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    // Collapsing a group resizes a child, not the scroller, so watch every child too.
    const ro = new ResizeObserver(update);
    const observeAll = () => {
      ro.disconnect();
      ro.observe(el);
      for (const child of el.children) ro.observe(child);
    };
    const mo = new MutationObserver(observeAll);
    observeAll();
    mo.observe(el, { childList: true });
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, [active]);

  return { ref, more };
}

const HELP_SEEN_KEY = 'barrocode.helpSeen';
const SESSION_KEY = 'barrocode.session';

type PathState = Pick<SampledPath, 'id' | 'enabled' | 'ampNOverride' | 'ampTOverride' | 'wlNOverride' | 'wlTOverride'>;

interface SavedSession {
  raw: string;
  filename: string;
  params: PrintParams;
  keyframes: WaveKeyframe[];
  paths: PathState[];
}

function loadSession(): SavedSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
    return s && typeof s.raw === 'string' ? s : null;
  } catch {
    return null;
  }
}

function hasSeenHelp() {
  try { return localStorage.getItem(HELP_SEEN_KEY) === '1'; } catch { return true; }
}

function uid() { return Math.random().toString(36).slice(2, 9); }

type LissKey = 'lissAmpN' | 'lissAmpT' | 'lissAmpZ' | 'lissWlN' | 'lissWlT' | 'lissWlZ' | 'lissDelta' | 'lissPhaseZ';
type KfLissKey = 'ampN' | 'ampT' | 'ampZ' | 'wlN' | 'wlT' | 'wlZ' | 'delta' | 'phaseZ';

const KF_LISS_FIELDS: Array<[LissKey, KfLissKey]> = [
  ['lissAmpN', 'ampN'], ['lissAmpT', 'ampT'], ['lissAmpZ', 'ampZ'],
  ['lissWlN', 'wlN'],   ['lissWlT', 'wlT'],   ['lissWlZ', 'wlZ'],
  ['lissDelta', 'delta'], ['lissPhaseZ', 'phaseZ'],
];

// Everything the Lissajous panel edits; its "Reiniciar" restores only these.
const LISS_PANEL_FIELDS: Array<LissKey | 'lissPhaseOffset' | 'phaseShiftPerLayer'> = [
  ...KF_LISS_FIELDS.map(([pk]) => pk), 'lissPhaseOffset', 'phaseShiftPerLayer',
];

export default function App() {
  const [params, setParams] = useState<PrintParams>(DEFAULT_PARAMS);
  const [parsedSVG, setParsedSVG] = useState<ParsedSVG | null>(null);
  const [gcode, setGcode] = useState('');
  // True from an edit until its debounced G-code is ready.
  const [gcodeBusy, setGcodeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gcodeFilename, setGcodeFilename] = useState('barrocode.gcode');
  const [timelineProgress, setTimelineProgress] = useState(0);
  // Sorted by t, except during a timeline drag, which sorts on release. A
  // keyframe's number is its index + 1, so it keeps its number while being
  // dragged past a neighbour.
  const [keyframes, setKeyframes] = useState<WaveKeyframe[]>([]);
  const [centerTab, setCenterTab] = useState<'preview' | 'gcode'>('preview');
  const [sampleIndex, setSampleIndex] = useState(0);
  const [selectedKfId, setSelectedKfId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(() => !hasSeenHelp());
  const [savedSession, setSavedSession] = useState(loadSession);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastRawRef = useRef<{ raw: string; spacing: number } | null>(null);
  const gcodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Jumping to a keyframe glides the extruder there; any direct edit of the
  // timeline cancels the glide.
  const timelineRef = useRef(timelineProgress);
  timelineRef.current = timelineProgress;
  const glideRef = useRef(0);
  const setTimeline = useCallback((v: number | ((t: number) => number)) => {
    cancelAnimationFrame(glideRef.current);
    setTimelineProgress(v);
  }, []);
  function glideTimeline(target: number) {
    cancelAnimationFrame(glideRef.current);
    const from = timelineRef.current;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setTimelineProgress(target); return; }
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / TIMELINE_GLIDE_MS);
      setTimelineProgress(from + (target - from) * (1 - (1 - p) ** 4));
      if (p < 1) glideRef.current = requestAnimationFrame(step);
    };
    glideRef.current = requestAnimationFrame(step);
  }

  const selectedKf = keyframes.find(k => k.id === selectedKfId) ?? null;
  const svgH = parsedSVG?.viewBox.height ?? 200;

  // Keyed on the fields each stage reads, so G-code-only edits (speeds, E,
  // travel, priming…) don't rebuild the geometry.
  const waveKey = WAVE_PARAMS.map(k => params[k]).join('|');
  const layers = useMemo(
    () => parsedSVG
      ? generateWaveLayers(parsedSVG.paths, params, keyframes, parsedSVG.viewBox.height)
      : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parsedSVG, keyframes, waveKey],
  );
  const toolpathKey = TOOLPATH_PARAMS.map(k => params[k]).join('|');
  const toolpath = useMemo(
    () => buildToolpath(layers, params, svgH),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layers, toolpathKey, svgH],
  );

  // While a keyframe is selected the Lissajous panel shows and edits that
  // keyframe's wave. With keyframes but none selected it shows the wave
  // interpolated at the extruder, and editing it keys it there (auto-key):
  // the global values have no effect once keyframes exist.
  const autoKey = keyframes.length > 0 && !selectedKf;
  const shownWave: Partial<Record<KfLissKey, number>> | null =
    selectedKf ?? (autoKey ? getParamsAtT(timelineProgress, keyframes, params) : null);
  const lissParams: PrintParams = shownWave
    ? KF_LISS_FIELDS.reduce<PrintParams>(
        (acc, [pk, kk]) => ({ ...acc, [pk]: shownWave[kk] ?? params[pk] }),
        params,
      )
    : params;

  // Counts presets and resets, which morph the wave figure.
  const [lissMorph, setLissMorph] = useState(0);
  function setLissParams(next: PrintParams, morph = false) {
    if (morph) setLissMorph(n => n + 1);
    if (!shownWave) { setParams(next); return; }
    const kfPatch: Partial<Record<KfLissKey, number>> = {};
    const globalNext = { ...next };
    for (const [pk, kk] of KF_LISS_FIELDS) {
      if (next[pk] !== lissParams[pk]) kfPatch[kk] = next[pk];
      globalNext[pk] = params[pk];
    }
    setParams(globalNext);
    if (Object.keys(kfPatch).length === 0) return;
    const target = selectedKf ?? kfAtCursor;
    if (target) {
      setKeyframes(keyframes.map(k => k.id === target.id ? { ...k, ...kfPatch } : k));
      setSelectedKfId(target.id);
      return;
    }
    const newKf = { ...snapshotKeyframe(timelineProgress), ...kfPatch };
    const updated = [...keyframes, newKf].sort((a, b) => a.t - b.t);
    setKeyframes(updated);
    setSelectedKfId(newKf.id);
    showToast(`Keyframe ${updated.indexOf(newKf) + 1} creado en el ${Math.round(newKf.t * 100)} %`);
  }

  function resetLissParams() {
    const next = { ...lissParams };
    for (const k of LISS_PANEL_FIELDS) next[k] = DEFAULT_PARAMS[k];
    setLissParams(next, true);
  }

  const kfAtCursor = findKeyframeAt(keyframes, timelineProgress);
  const selectedIdx = selectedKf ? keyframes.indexOf(selectedKf) : -1;
  const prevKf = selectedKf
    ? keyframes[selectedIdx - 1] ?? null
    : [...keyframes].reverse().find(k => k.t < timelineProgress) ?? null;
  const nextKf = selectedKf
    ? keyframes[selectedIdx + 1] ?? null
    : keyframes.find(k => k.t > timelineProgress) ?? null;

  // Selecting a keyframe moves the extruder onto it, so the preview shows
  // the wave being edited.
  function selectKf(id: string | null) {
    setSelectedKfId(id);
    const kf = keyframes.find(k => k.id === id);
    if (kf) glideTimeline(kf.t);
  }

  // A new keyframe holds the wave currently shown at t, so adding one
  // between existing ones doesn't change the shape.
  function snapshotKeyframe(t: number): WaveKeyframe {
    const lp = getParamsAtT(t, keyframes, params);
    return {
      id: uid(), t,
      ampN: lp.ampN, ampT: lp.ampT, ampZ: lp.ampZ,
      wlN: lp.wlN, wlT: lp.wlT, wlZ: lp.wlZ,
      delta: lp.delta, phaseZ: lp.phaseZ,
      centerX: lp.centerX, centerY: lp.centerY,
      scaleX: lp.scaleX, scaleY: lp.scaleY,
      rotation: lp.rotation,
    };
  }

  function addKeyframe() {
    if (kfAtCursor) {
      selectKf(kfAtCursor.id === selectedKfId ? null : kfAtCursor.id);
      return;
    }
    const newKf = snapshotKeyframe(timelineProgress);
    const updated = [...keyframes, newKf].sort((a, b) => a.t - b.t);
    setKeyframes(updated);
    setSelectedKfId(newKf.id);
  }

  function deleteKeyframe() {
    if (!selectedKfId) return;
    setKeyframes(keyframes.filter(k => k.id !== selectedKfId));
    setSelectedKfId(null);
  }

  // There is no undo, so clearing every keyframe takes a second click.
  const [clearArmed, setClearArmed] = useState(false);
  useEffect(() => {
    if (!clearArmed) return;
    const id = setTimeout(() => setClearArmed(false), CLEAR_CONFIRM_MS);
    return () => clearTimeout(id);
  }, [clearArmed]);
  useEffect(() => setClearArmed(false), [keyframes, selectedKfId]);

  function clearAllKeyframes() {
    if (!clearArmed) { setClearArmed(true); return; }
    setKeyframes([]);
    setSelectedKfId(null);
  }

  function updateKf<K extends keyof WaveKeyframe>(key: K, val: WaveKeyframe[K]) {
    if (!selectedKfId) return;
    setKeyframes(keyframes.map(k => k.id === selectedKfId ? { ...k, [key]: val } : k));
  }

  function moveSelectedKf(t: number) {
    if (!selectedKfId) return;
    setKeyframes(keyframes
      .map(k => k.id === selectedKfId ? { ...k, t } : k)
      .sort((a, b) => a.t - b.t));
    setTimeline(t);
  }

  function closeHelp() {
    setHelpOpen(false);
    try { localStorage.setItem(HELP_SEEN_KEY, '1'); } catch { /* storage unavailable */ }
  }

  const selectedKfIdRef = useRef(selectedKfId);
  const helpOpenRef = useRef(helpOpen);
  const addKeyframeRef = useRef(addKeyframe);
  const neighbourKfRef = useRef({ prev: prevKf, next: nextKf, select: selectKf });
  useEffect(() => { selectedKfIdRef.current = selectedKfId; }, [selectedKfId]);
  useEffect(() => { helpOpenRef.current = helpOpen; }, [helpOpen]);
  useEffect(() => { addKeyframeRef.current = addKeyframe; }, [keyframes, timelineProgress, params, selectedKfId]);
  useEffect(() => { neighbourKfRef.current = { prev: prevKf, next: nextKf, select: selectKf }; }, [keyframes, timelineProgress, selectedKfId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement;
      // Sliders and checkboxes keep focus after use; they don't consume these keys.
      if (el.closest('input:not([type="range"]):not([type="checkbox"]), textarea, select, [contenteditable="true"]')) return;
      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (helpOpenRef.current) return;
      const id = selectedKfIdRef.current;
      const key = e.key.toLowerCase();
      if (key === 'k') {
        addKeyframeRef.current();
      } else if (key === 'g') {
        setCenterTab(t => t === 'preview' ? 'gcode' : 'preview');
      } else if ((key === 'arrowleft' || key === 'arrowright') && !el.matches('input[type="range"]') && id) {
        // With a keyframe open the arrows walk between keyframes, so the
        // extruder never drifts away from the one being edited.
        const { prev, next, select } = neighbourKfRef.current;
        const target = key === 'arrowleft' ? prev : next;
        if (target) select(target.id);
      } else if ((key === 'arrowleft' || key === 'arrowright') && !el.matches('input[type="range"]')) {
        const step = (e.shiftKey ? 0.001 : 0.01) * (key === 'arrowleft' ? -1 : 1);
        setTimeline(t => Math.min(1, Math.max(0, +(t + step).toFixed(4))));
      } else if (key === 'escape' && id) {
        setSelectedKfId(null);
      } else if ((key === 'delete' || key === 'backspace') && id) {
        setKeyframes(prev => prev.filter(k => k.id !== id));
        setSelectedKfId(null);
      } else {
        return;
      }
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // One short notice at a time; a new one replaces the current one.
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const showToast = useCallback((text: string) => {
    toastTimersRef.current.forEach(clearTimeout);
    const id = performance.now();
    setToast({ id, text });
    toastTimersRef.current = [
      setTimeout(() => setToast(t => t?.id === id ? { ...t, leaving: true } : t), TOAST_MS),
      setTimeout(() => setToast(t => t?.id === id ? null : t), TOAST_MS + 200),
    ];
  }, []);

  const [panels, setPanels] = useState(loadPanels);
  const [dropping, setDropping] = useState(false);

  // Below NARROW_W both panels would squeeze the view, so only one stays open.
  const [narrow, setNarrow] = useState(() => window.innerWidth < NARROW_W);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < NARROW_W);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const shown = narrow && panels.left && panels.right ? { left: true, right: false } : panels;
  const leftScroll  = useScrollMore<HTMLDivElement>(shown.left);
  const rightScroll = useScrollMore<HTMLDivElement>(shown.right);

  // A closing panel plays its exit before it unmounts and the view reframes.
  const [leaving, setLeaving] = useState<keyof PanelsOpen | null>(null);
  function togglePanel(side: keyof PanelsOpen) {
    if (leaving) return;
    const other = side === 'left' ? 'right' : 'left';
    const opening = !shown[side];
    const next = { ...shown, [side]: opening, ...(opening && narrow ? { [other]: false } : {}) };
    const commit = () => {
      setLeaving(null);
      setPanels(next);
      try { localStorage.setItem(PANELS_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    };
    if (opening) { commit(); return; }
    setLeaving(side);
    setTimeout(commit, PANEL_LEAVE_MS);
  }

  const insets = {
    left:  STAGE_GAP * 2 + (shown.left ? LEFT_W : RAIL_W),
    right: STAGE_GAP * 2 + (shown.right ? RIGHT_W : RAIL_W),
    top:   STAGE_GAP * 2 + BAR_H,
  };

  const doParse = useCallback((raw: string, spacing: number, pathState: PathState[] = [], adoptScale = false) => {
    try {
      const result = parseSVG(raw, spacing);
      result.paths = result.paths.map(p => ({ ...p, ...pathState.find(s => s.id === p.id) }));
      const mmPerUnit = result.mmPerUnit;
      if (adoptScale && mmPerUnit !== null) setParams(p => ({ ...p, scaleFactor: mmPerUnit }));
      setParsedSVG(result);
      setError(null);
      lastRawRef.current = { raw, spacing };
    } catch (e) {
      setError((e as Error).message);
      setParsedSVG(null);
    }
  }, []);

  function handleFile(file: File) {
    setSavedSession(null);
    setGcodeFilename(file.name.replace(/\.svg$/i, '.gcode'));
    const reader = new FileReader();
    reader.onload = ev => doParse(ev.target?.result as string, params.sampleSpacing, [], true);
    reader.readAsText(file);
  }

  // Re-sample when spacing changes
  useEffect(() => {
    const ref = lastRawRef.current;
    if (ref && parsedSVG && ref.spacing !== params.sampleSpacing) {
      doParse(ref.raw, params.sampleSpacing);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.sampleSpacing]);

  // Regenerate G-code with debounce — avoids freezing UI during slider/kf edits
  useEffect(() => {
    if (gcodeTimerRef.current !== null) clearTimeout(gcodeTimerRef.current);
    if (toolpath.length === 0) {
      setGcode('');
      setGcodeBusy(false);
      return;
    }
    setGcodeBusy(true);
    gcodeTimerRef.current = setTimeout(() => {
      gcodeTimerRef.current = null;
      setGcode(generateGcode(toolpath, params));
      setGcodeBusy(false);
    }, 400);
    return () => {
      if (gcodeTimerRef.current !== null) {
        clearTimeout(gcodeTimerRef.current);
        gcodeTimerRef.current = null;
      }
    };
  }, [toolpath, params]);

  function togglePath(id: string) {
    setParsedSVG(prev => prev && {
      ...prev,
      paths: prev.paths.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p),
    });
  }

  function setOverride(
    id: string,
    key: 'ampNOverride' | 'ampTOverride' | 'wlNOverride' | 'wlTOverride',
    value: number | null,
  ) {
    setParsedSVG(prev => prev && {
      ...prev,
      paths: prev.paths.map(p => p.id === id ? { ...p, [key]: value } : p),
    });
  }

  // Autosave so an accidental tab close doesn't lose the work.
  useEffect(() => {
    const raw = lastRawRef.current?.raw;
    if (!parsedSVG || !raw) return;
    const t = setTimeout(() => {
      const session: SavedSession = {
        raw, filename: gcodeFilename, params, keyframes,
        paths: parsedSVG.paths.map(({ id, enabled, ampNOverride, ampTOverride, wlNOverride, wlTOverride }) =>
          ({ id, enabled, ampNOverride, ampTOverride, wlNOverride, wlTOverride })),
      };
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* full or unavailable */ }
    }, 1000);
    return () => clearTimeout(t);
  }, [parsedSVG, params, keyframes, gcodeFilename]);

  function restoreSession() {
    if (!savedSession) return;
    const p = { ...DEFAULT_PARAMS, ...savedSession.params };
    setParams(p);
    setKeyframes([...savedSession.keyframes].sort((a, b) => a.t - b.t));
    setSelectedKfId(null);
    setGcodeFilename(savedSession.filename);
    doParse(savedSession.raw, p.sampleSpacing, savedSession.paths);
    setSavedSession(null);
    showToast(`Sesión restaurada: ${savedSession.filename.replace(/\.gcode$/i, '')}`);
  }

  function discardSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ }
    setSavedSession(null);
  }

  function clearSVG() {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ }
    setParsedSVG(null);
    setError(null);
    lastRawRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function loadSample() {
    setSavedSession(null);
    const s = SAMPLES[sampleIndex];
    setGcodeFilename(s.name);
    doParse(s.raw, params.sampleSpacing);
  }

  const kfNav = keyframes.length > 0 && (
    <div className="kf-nav">
      <button className="btn-icon" disabled={!prevKf}
        onClick={() => prevKf && selectKf(prevKf.id)}
        title={selectedKf ? 'Keyframe anterior (←)' : 'Keyframe anterior'} aria-label="Keyframe anterior"><Chevron dir="left" /></button>
      <span className="kf-nav-label">
        {selectedKf
          ? <><span className="kf-badge" style={{ '--kf-c': keyframeColor(selectedKf.t) } as CSSProperties}>
                {selectedIdx + 1}
              </span>
              de {keyframes.length}</>
          : `${keyframes.length} keyframe${keyframes.length !== 1 ? 's' : ''}`}
      </span>
      <button className="btn-icon" disabled={!nextKf}
        onClick={() => nextKf && selectKf(nextKf.id)}
        title={selectedKf ? 'Keyframe siguiente (→)' : 'Keyframe siguiente'} aria-label="Keyframe siguiente"><Chevron dir="right" /></button>
    </div>
  );

  const kfActions = (
    <div className="kf-actions">
      <button
        className={`btn-small kf-add-btn${kfAtCursor ? ' kf-add-btn--on' : ''}`}
        onClick={addKeyframe}
        title={kfAtCursor
          ? kfAtCursor.id === selectedKfId
            ? 'Terminar de editar este keyframe (Esc)'
            : 'Ya hay un keyframe aquí: seleccionarlo'
          : `Fijar la onda en ${Math.round(timelineProgress * 100)} % del recorrido (K). Entre keyframes los valores se interpolan.`}
      >
        {kfAtCursor
          ? kfAtCursor.id === selectedKfId ? '✓ Listo' : `Editar ${keyframes.indexOf(kfAtCursor) + 1}`
          : <><KeyframeAddIcon />Keyframe</>}
      </button>
      {selectedKf && (
        <button className="btn-icon kf-del-btn" onClick={deleteKeyframe}
          title="Eliminar este keyframe (Supr)" aria-label="Eliminar keyframe seleccionado">
          <svg width="11" height="12" viewBox="0 0 11 12" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 3h9M3.5 3V2h4v1M2 3l.8 7h5.4l.8-7"/>
            <line x1="4.2" y1="5.5" x2="4" y2="8.5"/>
            <line x1="6.8" y1="5.5" x2="7" y2="8.5"/>
          </svg>
        </button>
      )}
      {!selectedKf && keyframes.length > 0 && (
        <button className={`btn-reset kf-clear-btn${clearArmed ? ' kf-clear-btn--armed' : ''}`}
          onClick={clearAllKeyframes} onBlur={() => setClearArmed(false)}
          title={clearArmed ? 'Pulsa otra vez para borrar todos los keyframes' : 'Eliminar todos los keyframes'}>
          {clearArmed
            ? keyframes.length === 1 ? '¿Borrar el keyframe?' : `¿Borrar los ${keyframes.length}?`
            : 'Borrar todos'}
        </button>
      )}
    </div>
  );

  const kfEditor = selectedKf && (
    <div className="kf-editor">
      <div className="kf-group">
        <div className="kf-field">
          <label>Posición <span className="kf-field-hint">{layerLabel(layerAtT(toolpath, selectedKf.t), params.layerHeight)}</span></label>
          <div className="kf-field-input-row">
            <NumInput value={parseFloat((selectedKf.t * 100).toFixed(1))} min={0} max={100} step={0.5}
              onChange={v => moveSelectedKf(v / 100)} />
            <span className="kf-unit">%</span>
          </div>
        </div>
        <div className="kf-field" title="Giro alrededor del centro, antihorario visto desde arriba. Entre keyframes se interpola: 0° → 360° da una vuelta completa.">
          <label>Giro</label>
          <div className="kf-field-input-row">
            <NumInput value={selectedKf.rotation ?? params.rotation} step={1}
              onChange={v => updateKf('rotation', v)} />
            <span className="kf-unit">°</span>
          </div>
        </div>
      </div>

      <div className="kf-group">
        <div className="kf-field">
          <label>Escala X</label>
          <div className="kf-field-input-row">
            <NumInput value={selectedKf.scaleX ?? params.scaleX} min={0.05} max={5} step={0.01}
              onChange={v => updateKf('scaleX', v)} />
          </div>
        </div>
        <div className="kf-field">
          <label>Escala Y</label>
          <div className="kf-field-input-row">
            <NumInput value={selectedKf.scaleY ?? params.scaleY} min={0.05} max={5} step={0.01}
              onChange={v => updateKf('scaleY', v)} />
          </div>
        </div>
      </div>

      <div className="kf-group kf-group-center">
        <div className="kf-pad-wrap">
          <CenterPad
            layers={layers}
            params={params}
            svgH={svgH}
            centerX={selectedKf.centerX ?? params.centerX}
            centerY={selectedKf.centerY ?? params.centerY}
            kfT={selectedKf.t}
            onChange={(x, y) => {
              if (!selectedKfId) return;
              setKeyframes(keyframes.map(k =>
                k.id === selectedKfId ? { ...k, centerX: x, centerY: y } : k,
              ));
            }}
          />
        </div>
        <div className="kf-center-fields">
          <div className="kf-field">
            <label>Centro X</label>
            <div className="kf-field-input-row">
              <NumInput value={parseFloat((selectedKf.centerX ?? params.centerX).toFixed(1))} step={5} fineStep={1}
                onChange={v => updateKf('centerX', v)} />
              <span className="kf-unit">mm</span>
            </div>
          </div>
          <div className="kf-field">
            <label>Centro Y</label>
            <div className="kf-field-input-row">
              <NumInput value={parseFloat((selectedKf.centerY ?? params.centerY).toFixed(1))} step={5} fineStep={1}
                onChange={v => updateKf('centerY', v)} />
              <span className="kf-unit">mm</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`app-stage${dropping ? ' app-stage--drop' : ''}`}
      onDragOver={e => { e.preventDefault(); if (!dropping) setDropping(true); }}
      onDragLeave={e => { if (e.currentTarget === e.target || !e.relatedTarget) setDropping(false); }}
      onDrop={e => {
        e.preventDefault();
        setDropping(false);
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
      }}
    >
      <Preview2D
        sampledPaths={parsedSVG?.paths ?? []}
        toolpath={toolpath}
        params={params}
        viewBox={parsedSVG?.viewBox ?? null}
        timelineProgress={timelineProgress}
        onTimelineChange={setTimeline}
        keyframes={keyframes}
        onKeyframesChange={setKeyframes}
        centerTab={centerTab}
        onTabChange={setCenterTab}
        gcode={gcode}
        gcodeBusy={gcodeBusy}
        gcodeFilename={gcodeFilename}
        toast={toast}
        onToast={showToast}
        selectedKfId={selectedKfId}
        onKfSelect={selectKf}
        onAddKeyframe={addKeyframe}
        onHelp={() => setHelpOpen(true)}
        insets={insets}
        timelineLead={kfNav}
        timelineActions={kfActions}
        timelineEditor={kfEditor}
      />

      {/* ── Panel izquierdo ── */}
      {shown.left ? (
        <aside className={`float-panel panel-left${leaving === 'left' ? ' panel-leave' : ''}`} style={{ width: LEFT_W }}>
          <div ref={leftScroll.ref} className={`panel-scroll${leftScroll.more ? ' scroll-more' : ''}`}>
            {savedSession && !parsedSVG && (
              <div className="session-banner" role="status">
                <span className="session-banner-text">
                  Sesión anterior: <strong>{savedSession.filename.replace(/\.gcode$/i, '')}</strong>
                  {savedSession.keyframes.length > 0 && ` · ${savedSession.keyframes.length} keyframe${savedSession.keyframes.length !== 1 ? 's' : ''}`}
                </span>
                <div className="session-banner-actions">
                  <button className="btn-primary" onClick={restoreSession}>Restaurar</button>
                  <button className="btn-small" onClick={discardSession}>Descartar</button>
                </div>
              </div>
            )}

            <div className="file-block">
              <div className="file-row">
                <button className="btn-small file-load" onClick={() => fileInputRef.current?.click()}
                  title="Cargar un SVG. También puedes arrastrarlo a cualquier parte de la ventana.">
                  {parsedSVG ? 'Cambiar SVG' : 'Cargar SVG'}
                </button>
                <input ref={fileInputRef} type="file" accept=".svg,image/svg+xml"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

                <div className="sample-nav">
                  <button
                    className="btn-icon"
                    onClick={() => setSampleIndex(i => (i + SAMPLES.length - 1) % SAMPLES.length)}
                    aria-label="Muestra anterior"
                  ><Chevron dir="left" /></button>
                  <button
                    className="sample-nav-load"
                    onClick={loadSample}
                    title={`Cargar muestra ${sampleIndex + 1} de ${SAMPLES.length}`}
                  >
                    <img src={SAMPLES[sampleIndex].uri} width={20} height={20} alt="" />
                    <span className="sample-nav-title">{sampleIndex + 1}/{SAMPLES.length}</span>
                  </button>
                  <button
                    className="btn-icon"
                    onClick={() => setSampleIndex(i => (i + 1) % SAMPLES.length)}
                    aria-label="Muestra siguiente"
                  ><Chevron dir="right" /></button>
                </div>

                <button className="btn-icon" onClick={() => togglePanel('left')}
                  title="Ocultar panel" aria-label="Ocultar panel izquierdo"><Chevron dir="left" /></button>
              </div>

              {parsedSVG && (
                <div className="file-current">
                  <span className="file-name" title={gcodeFilename.replace(/\.gcode$/i, '')}>
                    {gcodeFilename.replace(/\.gcode$/i, '')}
                  </span>
                  <button className="btn-icon" title="Descartar el SVG" aria-label="Descartar el SVG" onClick={clearSVG}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                      <line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" />
                    </svg>
                  </button>
                </div>
              )}

              {error && <div className="error-msg">{error}</div>}
            </div>

            {parsedSVG && (
              <PathList
                paths={parsedSVG.paths}
                params={params}
                hasKeyframes={keyframes.length > 0}
                onToggle={togglePath}
                onOverride={setOverride}
              />
            )}

            <PathParams params={params} onChange={setParams} svgMmPerUnit={parsedSVG?.mmPerUnit ?? null} />
          </div>
        </aside>
      ) : (
        <aside className="float-panel panel-rail panel-rail--left" style={{ width: RAIL_W }}>
          <button className="btn-icon" onClick={() => togglePanel('left')}
            title="Mostrar panel de pieza" aria-label="Mostrar panel izquierdo"><Chevron dir="right" /></button>
          <button className="btn-icon" onClick={() => setHelpOpen(true)} title="Ayuda (?)" aria-label="Ayuda">?</button>
        </aside>
      )}

      {/* ── Panel derecho ── */}
      {shown.right ? (
        <aside className={`float-panel panel-right${leaving === 'right' ? ' panel-leave' : ''}`} style={{ width: RIGHT_W }}>
          <div ref={rightScroll.ref} className={`panel-scroll${rightScroll.more ? ' scroll-more' : ''}`}>
            <LissajousParams
              params={lissParams}
              onChange={setLissParams}
              onReset={resetLissParams}
              morph={lissMorph}
              defaults={DEFAULT_PARAMS}
              editingKf={selectedKf && {
                number: selectedIdx + 1,
                label: `Keyframe ${selectedIdx + 1} · ${Math.round(selectedKf.t * 100)}%`,
                color: keyframeColor(selectedKf.t),
                onDone: () => setSelectedKfId(null),
              }}
              autoKeyAt={autoKey ? `${Math.round(timelineProgress * 100)} %, capa ${layerAtT(toolpath, timelineProgress) + 1}` : null}
              figure={<div className="liss-figure"><LissajousPreview params={lissParams} morph={lissMorph} /></div>}
              headerExtra={
                <button className="btn-icon" onClick={() => togglePanel('right')}
                  title="Ocultar panel" aria-label="Ocultar panel de onda"><Chevron dir="right" /></button>
              }
            />
          </div>
        </aside>
      ) : (
        <aside className="float-panel panel-rail panel-rail--right" style={{ width: RAIL_W }}>
          <button className="btn-icon" onClick={() => togglePanel('right')}
            title="Mostrar panel de onda" aria-label="Mostrar panel de onda"><Chevron dir="left" /></button>
        </aside>
      )}

      <HelpDialog open={helpOpen} onClose={closeHelp} />
    </div>
  );
}
