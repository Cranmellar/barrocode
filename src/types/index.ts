// ── Core geometry ──────────────────────────────────────────────────────────

export interface Point2D { x: number; y: number }
export interface Point3D { x: number; y: number; z: number }

/**
 * A point sampled along a centerline path with precomputed local frame.
 * All coordinates are in SVG user units.
 */
export interface SampledPoint {
  x: number;
  y: number;
  tangentX: number;   // unit tangent along forward direction
  tangentY: number;
  normalX: number;    // unit normal, 90° CCW from tangent
  normalY: number;
  arcLength: number;  // cumulative arc length from path start (SVG units)
}

export interface SampledPath {
  id: string;
  tagName: string;
  totalLength: number;  // total arc length in SVG units
  points: SampledPoint[];
  enabled: boolean;
  // Per-path Lissajous overrides (null = use global value)
  ampNOverride: number | null;
  ampTOverride: number | null;
  wlNOverride: number | null;
  wlTOverride: number | null;
}

export interface SVGViewBox {
  x: number; y: number; width: number; height: number;
}

export interface ParsedSVG {
  paths: SampledPath[];
  viewBox: SVGViewBox;
  raw: string;
}

// ── Wave / Lissajous point ──────────────────────────────────────────────────

/** A wave-modified point, still in SVG user units. */
export interface WavePoint {
  x: number;
  y: number;
  /** Z oscillation offset in mm (added on top of WaveLayer.z at emit time). */
  zOffset: number;
}

/**
 * A G-code-ready point: mm coordinates (scale + flip + offset applied) + Z.
 */
export interface PrintPoint {
  x: number; y: number; z: number;
}

// ── Layers ──────────────────────────────────────────────────────────────────

export interface WaveLayer {
  index: number;
  z: number;           // Z in mm
  paths: WavePoint[][];  // [pathIndex][pointIndex], SVG units
}

// ── Keyframes ───────────────────────────────────────────────────────────────

/**
 * A keyframe pins Lissajous parameters at a specific position (t ∈ [0,1])
 * along the total flattened trajectory (all layers, all paths, in order).
 * Values interpolate linearly between adjacent keyframes.
 */
export interface WaveKeyframe {
  id: string;
  t: number;        // 0 = start of layer 0, 1 = end of last layer
  ampN: number;     // mm
  ampT: number;     // mm
  wlN: number;      // mm
  wlT: number;      // mm
  delta: number;    // radians
  ampZ?: number;    // mm — Z oscillation amplitude (optional; falls back to global)
  wlZ?:  number;    // mm — Z oscillation wavelength
  phaseZ?: number;  // radians — Z oscillation phase offset
  // Scale pivot — optional; falls back to global PrintParams values when absent
  centerX?: number; // mm
  centerY?: number; // mm
  scaleX?:  number; // multiplier
  scaleY?:  number; // multiplier
}

// ── Parameters ──────────────────────────────────────────────────────────────

export interface PrintParams {
  // Sampling
  sampleSpacing: number;         // SVG units between samples

  // ── Lissajous (extruder local frame) ──
  lissAmpN: number;              // mm — amplitude along the curve normal
  lissAmpT: number;              // mm — amplitude along the curve tangent
  lissAmpZ: number;              // mm — amplitude of Z oscillation
  lissWlN: number;               // mm — wavelength (arc length per cycle) for N
  lissWlT: number;               // mm — wavelength for T
  lissWlZ: number;               // mm — wavelength for Z oscillation
  lissDelta: number;             // radians — phase shift of N relative to T
  lissPhaseZ: number;            // radians — phase offset for Z oscillation
  lissPhaseOffset: number;       // radians — global start phase at arc=0
  phaseShiftPerLayer: number;    // radians — extra phase added per layer

  // ── Layer stacking ──
  layerHeight: number;           // mm
  numLayers: number;
  useNumLayers: boolean;         // true = use numLayers; false = derive from totalHeight
  totalHeight: number;           // mm
  nozzleHeightOffset: number;    // mm — added to every layer Z
  safeZ: number;                 // mm — safe travel Z (used only if no soft join)

  // ── Soft layer join ──
  softJoin: boolean;             // interpolate Z smoothly from layer N→N+1
  transitionLength: number;      // mm — arc length over which Z transitions

  // ── Scale & placement ──
  scaleFactor: number;           // multiply SVG units → mm
  originX: number;               // mm offset
  originY: number;               // mm offset
  flipY: boolean;                // negate Y (SVG Y-down → printer Y-up)

  // ── Scale around center (applied after svgToMM) ──
  centerX: number;               // mm — pivot X for scaleX/scaleY
  centerY: number;               // mm — pivot Y
  scaleX: number;                // independent X scale (1 = no change)
  scaleY: number;                // independent Y scale (1 = no change)
  scaleUniform: boolean;         // UI lock: keep scaleX === scaleY

  // ── Z-hop ──
  zHopHeight: number;            // mm — nozzle lifts over path crossings (0 = off)

  // ── Concentric skirt travel ──
  skirtThreshold: number;        // mm — straight-line travel above this gets rerouted as a concentric arc

  // ── Speeds ──
  printSpeed: number;            // mm/min
  travelSpeed: number;           // mm/min

  // ── Extrusion ──
  generateE: boolean;
  extrusionMultiplier: number;   // E units per mm of travel

  // ── Path options ──
  reversePath: boolean;
  alternateDirection: boolean;
  closePath: boolean;

  // ── Clay-specific ──
  dwellAtStart: number;          // ms
  primingMove: boolean;
  primingLength: number;         // mm
}
