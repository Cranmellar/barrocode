import { useState, useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import logoUrl from './assets/logo.png';
import type { PrintParams, ParsedSVG, WaveKeyframe, SampledPath } from './types';
import { parseSVG } from './lib/svgParser';
import { generateWaveLayers, getParamsAtT, findKeyframeAt, WAVE_PARAMS } from './lib/waveGenerator';
import { buildToolpath, TOOLPATH_PARAMS } from './lib/toolpath';
import { generateGcode } from './lib/gcodeGenerator';
import { keyframeColor } from './lib/draw3D';
import { PathParams } from './components/PathParams';
import { LissajousParams } from './components/LissajousParams';
import { LissajousPreview } from './components/LissajousPreview';
import { Preview2D } from './components/Preview2D';
import { PathList } from './components/PathList';
import { NumInput } from './components/NumInput';
import { CenterPad } from './components/CenterPad';
import { HelpDialog } from './components/HelpDialog';

const _S1 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><path d="M480 160 320 0H160v160H0v160l160 160h160V320h160V160z" fill="#4A4E8C"/></svg>`;
const _S2 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><path d="m337 320 63-160h-80a160 160 0 1 0-320 0h160L80 320h80a160 160 0 1 0 320 0H337Z" fill="#4A4E8C"/></svg>`;
const _S3 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><path d="M360 240c-66.3 0-120-53.7-120-120a120 120 0 1 0-120 120c66.3 0 120 53.7 120 120a120 120 0 1 0 120-120Z" fill="#4A4E8C"/></svg>`;
const _S4 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><path d="M450 210a57 57 0 0 1-40.3-97.3 30 30 0 1 0-42.4-42.4A57 57 0 0 1 270 30a30 30 0 1 0-60 0 57 57 0 0 1-97.3 40.3 30 30 0 1 0-42.4 42.4A57 57 0 0 1 30 210a30 30 0 1 0 0 60 57 57 0 0 1 40.3 97.3 30 30 0 1 0 42.4 42.4A57 57 0 0 1 210 450a30 30 0 1 0 60 0 57 57 0 0 1 97.3-40.3 30 30 0 1 0 42.4-42.4A57 57 0 0 1 450 270a30 30 0 1 0 0-60Zm-210 90a60 60 0 1 1 0-120 60 60 0 0 1 0 120Z" fill="#4A4E8C"/></svg>`;
const svgUri = (s: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;

const SAMPLES = [
  { uri: svgUri(_S1), raw: _S1, name: 'muestra-1.gcode' },
  { uri: svgUri(_S2), raw: _S2, name: 'muestra-2.gcode' },
  { uri: svgUri(_S3), raw: _S3, name: 'muestra-3.gcode' },
  { uri: svgUri(_S4), raw: _S4, name: 'muestra-4.gcode' },
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
  // Z-hop
  zHopHeight: 2.5,
  hopRadius: 1.0,
  // Concentric skirt travel
  skirtThreshold: 15,
};

// ── Resizable panel hook ────────────────────────────────────────────────────
function useResize(
  initial: number,
  min: number,
  max: number,
  axis: 'x' | 'y',
  invert = false,
) {
  const [size, setSize] = useState(initial);
  const startRef = useRef<{ mouse: number; size: number } | null>(null);

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    startRef.current = { mouse: axis === 'x' ? e.clientX : e.clientY, size };
    document.body.classList.add(axis === 'x' ? 'dragging-h' : 'dragging-v');
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!startRef.current) return;
      const delta = (axis === 'x' ? e.clientX : e.clientY) - startRef.current.mouse;
      const newSize = Math.max(min, Math.min(max, startRef.current.size + (invert ? -delta : delta)));
      setSize(newSize);
    }
    function onUp() {
      startRef.current = null;
      document.body.classList.remove('dragging-h', 'dragging-v');
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [axis, min, max, invert]);

  return { size, onMouseDown };
}

// True while a scroller has content hidden below its visible area.
function useScrollMore<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = ref.current!;
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
  }, []);

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
  const [error, setError] = useState<string | null>(null);
  const [gcodeFilename, setGcodeFilename] = useState('curva.de.barro.gcode');
  const [timelineProgress, setTimelineProgress] = useState(0);
  const [keyframes, setKeyframes] = useState<WaveKeyframe[]>([]);
  const [centerTab, setCenterTab] = useState<'preview' | 'gcode'>('preview');
  const [sampleIndex, setSampleIndex] = useState(0);
  const [selectedKfId, setSelectedKfId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(() => !hasSeenHelp());
  const [savedSession, setSavedSession] = useState(loadSession);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastRawRef = useRef<{ raw: string; spacing: number } | null>(null);
  const gcodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  // keyframe's wave; global values are overridden whenever keyframes exist.
  const lissParams: PrintParams = selectedKf
    ? KF_LISS_FIELDS.reduce<PrintParams>(
        (acc, [pk, kk]) => ({ ...acc, [pk]: selectedKf[kk] ?? params[pk] }),
        params,
      )
    : params;

  function setLissParams(next: PrintParams) {
    if (!selectedKf) { setParams(next); return; }
    const kfPatch: Partial<Record<KfLissKey, number>> = {};
    const globalNext = { ...next };
    for (const [pk, kk] of KF_LISS_FIELDS) {
      if (next[pk] !== lissParams[pk]) kfPatch[kk] = next[pk];
      globalNext[pk] = params[pk];
    }
    setParams(globalNext);
    setKeyframes(keyframes.map(k => k.id === selectedKf.id ? { ...k, ...kfPatch } : k));
  }

  function resetLissParams() {
    const next = { ...lissParams };
    for (const k of LISS_PANEL_FIELDS) next[k] = DEFAULT_PARAMS[k];
    setLissParams(next);
  }

  const sortedKfs = [...keyframes].sort((a, b) => a.t - b.t);
  const kfAtCursor = findKeyframeAt(keyframes, timelineProgress);
  const selectedIdx = selectedKf ? sortedKfs.findIndex(k => k.id === selectedKf.id) : -1;
  const prevKf = selectedKf
    ? sortedKfs[selectedIdx - 1] ?? null
    : [...sortedKfs].reverse().find(k => k.t < timelineProgress) ?? null;
  const nextKf = selectedKf
    ? sortedKfs[selectedIdx + 1] ?? null
    : sortedKfs.find(k => k.t > timelineProgress) ?? null;

  // Selecting a keyframe moves the extruder onto it, so the preview shows
  // the wave being edited.
  function selectKf(id: string | null) {
    setSelectedKfId(id);
    const kf = keyframes.find(k => k.id === id);
    if (kf) setTimelineProgress(kf.t);
  }

  function addKeyframe() {
    if (kfAtCursor) {
      selectKf(kfAtCursor.id === selectedKfId ? null : kfAtCursor.id);
      return;
    }
    // Snapshot the wave currently shown at this t, so adding a keyframe
    // between existing ones doesn't change the shape.
    const lp = getParamsAtT(timelineProgress, keyframes, params);
    const newKf: WaveKeyframe = {
      id: uid(), t: timelineProgress,
      ampN: lp.ampN, ampT: lp.ampT, ampZ: lp.ampZ,
      wlN: lp.wlN, wlT: lp.wlT, wlZ: lp.wlZ,
      delta: lp.delta, phaseZ: lp.phaseZ,
      centerX: lp.centerX, centerY: lp.centerY,
      scaleX: lp.scaleX, scaleY: lp.scaleY,
    };
    const updated = [...keyframes, newKf].sort((a, b) => a.t - b.t);
    setKeyframes(updated);
    setSelectedKfId(newKf.id);
  }

  function deleteKeyframe() {
    if (!selectedKfId) return;
    setKeyframes(keyframes.filter(k => k.id !== selectedKfId));
    setSelectedKfId(null);
  }

  function clearAllKeyframes() {
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
    setTimelineProgress(t);
  }

  function closeHelp() {
    setHelpOpen(false);
    try { localStorage.setItem(HELP_SEEN_KEY, '1'); } catch { /* storage unavailable */ }
  }

  const selectedKfIdRef = useRef(selectedKfId);
  const helpOpenRef = useRef(helpOpen);
  const addKeyframeRef = useRef(addKeyframe);
  useEffect(() => { selectedKfIdRef.current = selectedKfId; }, [selectedKfId]);
  useEffect(() => { helpOpenRef.current = helpOpen; }, [helpOpen]);
  useEffect(() => { addKeyframeRef.current = addKeyframe; }, [keyframes, timelineProgress, params, selectedKfId]);

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
      } else if ((key === 'arrowleft' || key === 'arrowright') && !el.matches('input[type="range"]')) {
        const step = (e.shiftKey ? 0.001 : 0.01) * (key === 'arrowleft' ? -1 : 1);
        setTimelineProgress(t => Math.min(1, Math.max(0, +(t + step).toFixed(4))));
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

  // Resizable panels
  const leftPanel         = useResize(272, 200, 480, 'x');
  const rightPanel        = useResize(288, 200, 480, 'x', true);
  const bottomRow         = useResize(200, 120, 480, 'y', true);
  const lissPreviewHeight = useResize(200, 120, 400, 'y');
  const leftScroll        = useScrollMore<HTMLDivElement>();
  const rightScroll       = useScrollMore<HTMLDivElement>();

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
      return;
    }
    gcodeTimerRef.current = setTimeout(() => {
      gcodeTimerRef.current = null;
      setGcode(generateGcode(toolpath, params));
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
    setKeyframes(savedSession.keyframes);
    setSelectedKfId(null);
    setGcodeFilename(savedSession.filename);
    doParse(savedSession.raw, p.sampleSpacing, savedSession.paths);
    setSavedSession(null);
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

  return (
    <div className="app-layout">

      {/* ── Panel izquierdo ── */}
      <div ref={leftScroll.ref} className={`sidebar left-sidebar${leftScroll.more ? ' scroll-more' : ''}`}
        style={{ width: leftPanel.size }}>
        <div className="app-banner">
          <button
            className="help-btn"
            onClick={() => setHelpOpen(true)}
            aria-label="Ayuda: cómo usar BarroCode"
            aria-haspopup="dialog"
            aria-expanded={helpOpen}
            title="Ayuda (?)"
          >?</button>
          <img src={logoUrl} alt="BarroCode" />
          <div className="banner-sub">SVG → Lissajous → G-code</div>
        </div>

        {savedSession && !parsedSVG && (
          <div className="session-banner" role="status">
            <span className="session-banner-text">
              Sesión anterior: <strong>{savedSession.filename.replace(/\.gcode$/i, '')}</strong>
              {savedSession.keyframes.length > 0 && ` · ${savedSession.keyframes.length} keyframe${savedSession.keyframes.length !== 1 ? 's' : ''}`}
            </span>
            <div className="session-banner-actions">
              <button className="btn-small btn-primary" onClick={restoreSession}>Restaurar</button>
              <button className="btn-small" onClick={discardSession}>Descartar</button>
            </div>
          </div>
        )}

        <div className="upload-area-row">
          <div
            className="upload-area"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            <div className="upload-icon">↑</div>
            <div className="upload-label">
              {parsedSVG ? `${parsedSVG.paths.length} ruta(s) cargadas` : 'Carga un SVG…'}
            </div>
            <div className="upload-hint">clic o arrastra y suelta</div>
            <input ref={fileInputRef} type="file" accept=".svg,image/svg+xml"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
          {parsedSVG && (
            <button
              className="btn-clear-svg"
              title="Descartar SVG importado"
              onClick={clearSVG}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <line x1="2" y1="2" x2="10" y2="10" />
                <line x1="10" y1="2" x2="2" y2="10" />
              </svg>
            </button>
          )}
        </div>

        <div className="sample-nav">
          <button
            className="sample-nav-arrow"
            onClick={() => setSampleIndex(i => (i + SAMPLES.length - 1) % SAMPLES.length)}
            aria-label="Muestra anterior"
          >‹</button>
          <button
            className="sample-nav-load"
            onClick={loadSample}
            title={`Cargar muestra ${sampleIndex + 1}`}
          >
            <img src={SAMPLES[sampleIndex].uri} width={48} height={48} alt="" />
            <span className="sample-nav-text">
              <span className="sample-nav-title">Muestra {sampleIndex + 1}</span>
              <span className="sample-nav-sub">de {SAMPLES.length} · clic para cargar</span>
            </span>
          </button>
          <button
            className="sample-nav-arrow"
            onClick={() => setSampleIndex(i => (i + 1) % SAMPLES.length)}
            aria-label="Muestra siguiente"
          >›</button>
        </div>

        {error && <div className="error-msg">⚠ {error}</div>}

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

      {/* Divisor izquierdo */}
      <div
        className="drag-handle-v"
        onMouseDown={leftPanel.onMouseDown}
      />

      {/* ── Panel central ── */}
      <div className="main-content">

        {/* Vista global 3D — ocupa 2/3 superiores */}
        <Preview2D
          sampledPaths={parsedSVG?.paths ?? []}
          toolpath={toolpath}
          params={params}
          viewBox={parsedSVG?.viewBox ?? null}
          timelineProgress={timelineProgress}
          onTimelineChange={setTimelineProgress}
          keyframes={keyframes}
          onKeyframesChange={setKeyframes}
          centerTab={centerTab}
          onTabChange={setCenterTab}
          gcode={gcode}
          gcodeFilename={gcodeFilename}
          selectedKfId={selectedKfId}
          onKfSelect={selectKf}
          onAddKeyframe={addKeyframe}
        />

        {/* Divisor horizontal redimensionable */}
        <div className="drag-handle-h" onMouseDown={bottomRow.onMouseDown} />

        {/* Fila inferior — Keyframe seleccionado */}
        <div className="bottom-row" style={{ height: bottomRow.size }}>
          <div className="kf-panel">
            <div className="toolbar">
              <span className="toolbar-title">Keyframes</span>

              {keyframes.length > 0 && (
                <div className="kf-nav">
                  <button className="btn-small kf-nav-btn" disabled={!prevKf}
                    onClick={() => prevKf && selectKf(prevKf.id)}
                    title="Keyframe anterior" aria-label="Keyframe anterior">‹</button>
                  <span className="kf-nav-label">
                    {selectedKf
                      ? <><span className="kf-badge" style={{ '--kf-c': keyframeColor(selectedKf.t) } as CSSProperties}>
                            {selectedIdx + 1}
                          </span>
                          de {keyframes.length}</>
                      : `${keyframes.length} keyframe${keyframes.length !== 1 ? 's' : ''}`}
                  </span>
                  <button className="btn-small kf-nav-btn" disabled={!nextKf}
                    onClick={() => nextKf && selectKf(nextKf.id)}
                    title="Keyframe siguiente" aria-label="Keyframe siguiente">›</button>
                </div>
              )}

              <div className="kf-actions">
                <button
                  className={`btn-small kf-add-btn${kfAtCursor ? ' kf-add-btn--on' : ''}`}
                  onClick={addKeyframe}
                  title={kfAtCursor
                    ? kfAtCursor.id === selectedKfId
                      ? 'Terminar de editar este keyframe (Esc)'
                      : 'Ya hay un keyframe aquí: seleccionarlo'
                    : 'Fijar la onda en la posición del extrusor'}
                >
                  {kfAtCursor
                    ? kfAtCursor.id === selectedKfId ? '✓ OK' : `Editar keyframe ${sortedKfs.indexOf(kfAtCursor) + 1}`
                    : `⊕ Añadir en ${Math.round(timelineProgress * 100)}%`}
                </button>
                {selectedKf && (
                  <button className="btn-small kf-del-btn kf-trash-btn" onClick={deleteKeyframe}
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
                  <button className="btn-small kf-del-btn" onClick={clearAllKeyframes}
                    title="Eliminar todos los keyframes">
                    Eliminar todos
                  </button>
                )}
              </div>
            </div>

            {selectedKf ? (
              <div className="kf-editor">
                <div className="kf-group">
                  <div className="kf-field">
                    <label>Posición</label>
                    <div className="kf-field-input-row">
                      <NumInput value={parseFloat((selectedKf.t * 100).toFixed(1))} min={0} max={100} step={0.5}
                        onChange={v => moveSelectedKf(v / 100)} />
                      <span className="kf-unit">%</span>
                    </div>
                  </div>
                  <div className="kf-field kf-field-note">
                    Onda: panel derecho
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
                        <NumInput value={parseFloat((selectedKf.centerX ?? params.centerX).toFixed(1))} step={1}
                          onChange={v => updateKf('centerX', v)} />
                        <span className="kf-unit">mm</span>
                      </div>
                    </div>
                    <div className="kf-field">
                      <label>Centro Y</label>
                      <div className="kf-field-input-row">
                        <NumInput value={parseFloat((selectedKf.centerY ?? params.centerY).toFixed(1))} step={1}
                          onChange={v => updateKf('centerY', v)} />
                        <span className="kf-unit">mm</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="kf-empty">
                {keyframes.length === 0
                  ? 'Mueve el extrusor en la línea de tiempo y pulsa «Añadir» para fijar la onda en ese punto. Entre keyframes los valores se interpolan.'
                  : 'Selecciona un keyframe en la línea de tiempo o con ‹ › para editarlo: su onda en el panel derecho, su posición, escala y centro aquí.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Divisor derecho */}
      <div className="drag-handle-v" onMouseDown={rightPanel.onMouseDown} />

      {/* ── Panel derecho ── */}
      <div className="sidebar right-sidebar" style={{ width: rightPanel.size }}>
        <div className="liss-preview-panel" style={{ height: lissPreviewHeight.size }}>
          <LissajousPreview params={lissParams} />
        </div>
        <div className="drag-handle-h" onMouseDown={lissPreviewHeight.onMouseDown} />
        <div ref={rightScroll.ref} className={`right-sidebar-scroll${rightScroll.more ? ' scroll-more' : ''}`}>
          <LissajousParams
            params={lissParams}
            onChange={setLissParams}
            onReset={resetLissParams}
            editingKf={selectedKf && {
              number: selectedIdx + 1,
              label: `Keyframe ${selectedIdx + 1} · ${Math.round(selectedKf.t * 100)}%`,
              color: keyframeColor(selectedKf.t),
              onDone: () => setSelectedKfId(null),
            }}
            waveLocked={keyframes.length > 0 && !selectedKf}
          />
        </div>
      </div>

      <HelpDialog open={helpOpen} onClose={closeHelp} />
    </div>
  );
}
