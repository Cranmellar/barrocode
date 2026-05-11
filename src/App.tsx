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
import { PathList } from './components/PathList';
import { CenterScaleParams } from './components/CenterScaleParams';
import { NumInput } from './components/NumInput';
import { CenterPad } from './components/CenterPad';

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
  // Center + scale around pivot
  centerX: 0,
  centerY: 0,
  scaleX: 1,
  scaleY: 1,
  scaleUniform: true,
  // Z-hop
  zHopHeight: 0,
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

function uid() { return Math.random().toString(36).slice(2, 9); }

export default function App() {
  const [params, setParams] = useState<PrintParams>(DEFAULT_PARAMS);
  const [parsedSVG, setParsedSVG] = useState<ParsedSVG | null>(null);
  const [layers, setLayers] = useState<WaveLayer[]>([]);
  const [gcode, setGcode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [gcodeFilename, setGcodeFilename] = useState('curva.de.barro.gcode');
  const [timelineProgress, setTimelineProgress] = useState(0);
  const [keyframes, setKeyframes] = useState<WaveKeyframe[]>([]);
  const [centerTab, setCenterTab] = useState<'preview' | 'gcode'>('preview');
  const [selectedKfId, setSelectedKfId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastRawRef = useRef<{ raw: string; spacing: number } | null>(null);

  const selectedKf = keyframes.find(k => k.id === selectedKfId) ?? null;
  const svgH = parsedSVG?.viewBox.height ?? 200;

  function addKeyframe() {
    const newKf: WaveKeyframe = {
      id: uid(), t: timelineProgress,
      ampN: params.lissAmpN, ampT: params.lissAmpT,
      wlN: params.lissWlN, wlT: params.lissWlT,
      delta: params.lissDelta,
      centerX: params.centerX, centerY: params.centerY,
      scaleX: params.scaleX, scaleY: params.scaleY,
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

  // Resizable panels
  const leftPanel         = useResize(272, 200, 480, 'x');
  const rightPanel        = useResize(288, 200, 480, 'x', true);
  const bottomRow         = useResize(200, 120, 480, 'y', true);
  const lissPreviewHeight = useResize(200, 120, 400, 'y');

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
    const newLayers = generateWaveLayers(parsedSVG.paths, params, keyframes, parsedSVG.viewBox.height);
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
      setGcodeFilename('curva.de.barro.gcode');
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
          <img src={logoUrl} alt="BarroCode" />
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
            hasKeyframes={keyframes.length > 0}
            onToggle={togglePath}
            onOverride={setOverride}
          />
        )}

        <PathParams params={params} onChange={setParams} />
        <CenterScaleParams params={params} onChange={setParams} />
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
          centerTab={centerTab}
          onTabChange={setCenterTab}
          gcode={gcode}
          gcodeFilename={gcodeFilename}
          selectedKfId={selectedKfId}
          onKfSelect={setSelectedKfId}
        />

        {/* Divisor horizontal redimensionable */}
        <div className="drag-handle-h" onMouseDown={bottomRow.onMouseDown} />

        {/* Fila inferior — Keyframes */}
        <div className="bottom-row" style={{ height: bottomRow.size }}>
          <div className="kf-panel">
            <div className="toolbar">
              <span className="toolbar-title">Keyframes</span>
              <button className="btn-small kf-add-btn" onClick={addKeyframe}>
                ⊕ Añadir en {Math.round(timelineProgress * 100)}%
              </button>
              {selectedKfId && (
                <button className="btn-small kf-del-btn" onClick={deleteKeyframe}>
                  ✕ Eliminar
                </button>
              )}
              {keyframes.length > 0 && (
                <button className="btn-small kf-del-btn kf-trash-btn" onClick={clearAllKeyframes}
                  title="Eliminar todos los keyframes">
                  <svg width="11" height="12" viewBox="0 0 11 12" fill="none" stroke="currentColor"
                    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 3h9M3.5 3V2h4v1M2 3l.8 7h5.4l.8-7"/>
                    <line x1="4.2" y1="5.5" x2="4" y2="8.5"/>
                    <line x1="6.8" y1="5.5" x2="7" y2="8.5"/>
                  </svg>
                </button>
              )}
              {keyframes.length === 0 && (
                <span className="kf-empty-hint">
                  Añade un keyframe para animar la onda por capas
                </span>
              )}
            </div>

            {selectedKf && (
              <div className="kf-editor">
                <span className="kf-editor-title">
                  KF {(selectedKf.t * 100).toFixed(1)}%
                </span>
                <div className="kf-field">
                  <label>Amp N</label>
                  <div className="kf-field-input-row">
                    <NumInput value={selectedKf.ampN} min={0} max={30} step={0.1}
                      onChange={v => updateKf('ampN', v)} />
                    <span className="kf-unit">mm</span>
                  </div>
                </div>
                <div className="kf-field">
                  <label>Amp T</label>
                  <div className="kf-field-input-row">
                    <NumInput value={selectedKf.ampT} min={0} max={30} step={0.1}
                      onChange={v => updateKf('ampT', v)} />
                    <span className="kf-unit">mm</span>
                  </div>
                </div>
                <div className="kf-field">
                  <label>λ N</label>
                  <div className="kf-field-input-row">
                    <NumInput value={selectedKf.wlN} min={1} max={200} step={1}
                      onChange={v => updateKf('wlN', v)} />
                    <span className="kf-unit">mm</span>
                  </div>
                </div>
                <div className="kf-field">
                  <label>λ T</label>
                  <div className="kf-field-input-row">
                    <NumInput value={selectedKf.wlT} min={1} max={200} step={1}
                      onChange={v => updateKf('wlT', v)} />
                    <span className="kf-unit">mm</span>
                  </div>
                </div>
                <div className="kf-field">
                  <label>Delta</label>
                  <div className="kf-field-input-row">
                    <NumInput
                      value={parseFloat((selectedKf.delta * 180 / Math.PI).toFixed(1))}
                      min={-180} max={180} step={1}
                      onChange={v => updateKf('delta', v * Math.PI / 180)}
                    />
                    <span className="kf-unit">°</span>
                  </div>
                </div>
                <div className="kf-pad-wrap">
                  <span className="kf-pad-label">Centro</span>
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
                <div className="kf-field">
                  <label>Escala X</label>
                  <div className="kf-field-input-row">
                    <NumInput value={selectedKf.scaleX ?? params.scaleX} min={0.05} max={5} step={0.01}
                      onChange={v => updateKf('scaleX', v)} />
                  </div>
                </div>
                <div className="kf-field" style={{ borderRight: 'none' }}>
                  <label>Escala Y</label>
                  <div className="kf-field-input-row">
                    <NumInput value={selectedKf.scaleY ?? params.scaleY} min={0.05} max={5} step={0.01}
                      onChange={v => updateKf('scaleY', v)} />
                  </div>
                </div>
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
          <LissajousPreview params={params} />
        </div>
        <div className="drag-handle-h" onMouseDown={lissPreviewHeight.onMouseDown} />
        <div className="right-sidebar-scroll">
          <LissajousParams
            params={params}
            onChange={setParams}
            onReset={() => setParams(DEFAULT_PARAMS)}
          />
        </div>
      </div>

    </div>
  );
}
