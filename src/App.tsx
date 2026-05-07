import { useState, useCallback, useEffect, useRef } from 'react';
import logoUrl from './assets/logo.png';
import type { PrintParams, ParsedSVG, WaveLayer, WaveKeyframe } from './types';
import { parseSVG } from './lib/svgParser';
import { generateWaveLayers } from './lib/waveGenerator';
import { generateGcode } from './lib/gcodeGenerator';
import { PathParams } from './components/PathParams';
import { LissajousParams } from './components/LissajousParams';
import { LissajousPreview } from './components/LissajousPreview';
import { Preview2D } from './components/Preview2D';
import { GcodeOutput } from './components/GcodeOutput';
import { PathList } from './components/PathList';

const DEFAULT_PARAMS: PrintParams = {
  sampleSpacing: 2,
  lissAmpN: 3,
  lissAmpT: 0,
  lissWlN: 20,
  lissWlT: 20,
  lissDelta: 0,
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

export default function App() {
  const [params, setParams] = useState<PrintParams>(DEFAULT_PARAMS);
  const [parsedSVG, setParsedSVG] = useState<ParsedSVG | null>(null);
  const [layers, setLayers] = useState<WaveLayer[]>([]);
  const [gcode, setGcode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [gcodeFilename, setGcodeFilename] = useState('curvabarro.gcode');
  const [timelineProgress, setTimelineProgress] = useState(0);
  const [keyframes, setKeyframes] = useState<WaveKeyframe[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastRawRef = useRef<{ raw: string; spacing: number } | null>(null);

  // Resizable panels
  const leftPanel   = useResize(272, 200, 480, 'x');
  const rightPanel  = useResize(288, 200, 480, 'x', true);
  // Bottom row — taller default so Lissajous canvas has breathing room
  const bottomRow   = useResize(280, 140, 520, 'y', true);
  const bottomSplit = useResize(0, 0, 2000, 'x'); // 0 = 50/50 via flex

  const doParse = useCallback((raw: string, spacing: number) => {
    try {
      const result = parseSVG(raw, spacing);
      setParsedSVG(result);
      setError(null);
      lastRawRef.current = { raw, spacing };
    } catch (e) {
      setError((e as Error).message);
      setParsedSVG(null);
      setLayers([]);
      setGcode('');
    }
  }, []);

  function handleFile(file: File) {
    setGcodeFilename(file.name.replace(/\.svg$/i, '.gcode'));
    const reader = new FileReader();
    reader.onload = ev => doParse(ev.target?.result as string, params.sampleSpacing);
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

  // Regenerate wave + G-code on any param/path change
  useEffect(() => {
    if (!parsedSVG) return;
    const newLayers = generateWaveLayers(parsedSVG.paths, params, keyframes);
    setLayers(newLayers);
    if (newLayers.length > 0) {
      setGcode(generateGcode(newLayers, params, parsedSVG.viewBox));
    } else {
      setGcode('');
    }
  }, [parsedSVG, params, keyframes]);

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

  function clearSVG() {
    setParsedSVG(null);
    setLayers([]);
    setGcode('');
    setError(null);
    lastRawRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function loadSample() {
    try {
      const res = await fetch(import.meta.env.BASE_URL + 'sample.svg');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.trim().startsWith('<')) throw new Error('Respuesta inesperada del servidor');
      setGcodeFilename('sample-curvabarro.gcode');
      doParse(text, params.sampleSpacing);
    } catch (e) {
      setError(`No se pudo cargar el SVG de ejemplo. ${(e as Error).message}`);
    }
  }

  return (
    <div className="app-layout">

      {/* ── Panel izquierdo ── */}
      <div className="sidebar left-sidebar" style={{ width: leftPanel.size }}>
        <div className="app-banner">
          <img src={logoUrl} alt="CurvaBarro" />
          <div className="banner-sub">SVG → Lissajous → G-code</div>
        </div>

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

        <button className="btn-sample" onClick={loadSample}>
          Cargar SVG de ejemplo
        </button>

        {error && <div className="error-msg">⚠ {error}</div>}

        {parsedSVG && (
          <PathList
            paths={parsedSVG.paths}
            params={params}
            onToggle={togglePath}
            onOverride={setOverride}
          />
        )}

        <PathParams params={params} onChange={setParams} />
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
          layers={layers}
          params={params}
          viewBox={parsedSVG?.viewBox ?? null}
          timelineProgress={timelineProgress}
          onTimelineChange={setTimelineProgress}
          keyframes={keyframes}
          onKeyframesChange={setKeyframes}
        />

        {/* Divisor horizontal redimensionable */}
        <div className="drag-handle-h" onMouseDown={bottomRow.onMouseDown} />

        {/* Fila inferior — Lissajous izquierda | G-code derecha */}
        <div className="bottom-row" style={{ height: bottomRow.size }}>

          {/* Lissajous preview — izquierda */}
          <div className="lissajous-pane" style={{ flex: 1 }}>
            <div className="lissajous-container">
              <LissajousPreview params={params} />
            </div>
          </div>

          {/* Divisor vertical interno */}
          <div className="drag-handle-v" onMouseDown={bottomSplit.onMouseDown} />

          {/* G-code output — derecha */}
          <div className="gcode-pane" style={{ flex: 1 }}>
            <GcodeOutput gcode={gcode} filename={gcodeFilename} />
          </div>

        </div>
      </div>

      {/* Divisor derecho */}
      <div className="drag-handle-v" onMouseDown={rightPanel.onMouseDown} />

      {/* ── Panel derecho ── */}
      <div className="sidebar right-sidebar" style={{ width: rightPanel.size }}>
        <LissajousParams
          params={params}
          onChange={setParams}
          onReset={() => setParams(DEFAULT_PARAMS)}
        />
      </div>

    </div>
  );
}
