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
  /** User units, shifted so the viewBox's top-left corner is (0, 0). */
  paths: SampledPath[];
  viewBox: SVGViewBox;
  /** mm per user unit from a physical width/height (`100mm`, `200pt`); null if unitless. */
  mmPerUnit: number | null;
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
  closed: boolean[];     // per path: the source ends where it starts
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
  rotation?: number; // degrees, CCW seen from above, around the same pivot
  phaseOffset?: number; // radians — lissPhaseOffset at this keyframe
  phaseShift?: number;  // radians — phaseShiftPerLayer at this keyframe
  // Values arrive at and leave this keyframe with zero slope (no kink in the
  // wall); otherwise segments touching it are straight.
  smooth?: boolean;
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
  safeZ: number;                 // mm — travel Z at start, after priming and for the final lift

  // ── Soft layer join ──
  softJoin: boolean;             // interpolate Z smoothly from layer N→N+1
  transitionLength: number;      // mm — arc length over which Z transitions

  // ── Scale & placement ──
  scaleFactor: number;           // multiply SVG units → mm
  originX: number;               // mm — bed position of the part's centre
  originY: number;               // mm
  gcodeOrigin: 'centre' | 'corner'; // G-code only: part centre at (originX, originY), or bottom-left corner of its box at (marginX, marginY)
  marginX: number;               // mm — 'corner' only: bed origin to the part's left edge
  marginY: number;               // mm — 'corner' only: bed origin to the part's bottom edge
  flipY: boolean;                // negate Y (SVG Y-down → printer Y-up)

  // ── Scale around center (applied after svgToMM) ──
  centerX: number;               // mm — pivot X for scaleX/scaleY
  centerY: number;               // mm — pivot Y
  scaleX: number;                // independent X scale (1 = no change)
  scaleY: number;                // independent Y scale (1 = no change)
  scaleUniform: boolean;         // UI lock: keep scaleX === scaleY
  rotation: number;              // degrees, CCW seen from above, around the pivot (after scale)

  // ── Z-hop ──
  zHopHeight: number;            // mm — nozzle lifts over path crossings (0 = off)
  hopRadius: number;             // mm — arc spread on each side of a crossing

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

  // ── Machine (Máquina workspace; read by generateGcode only) ──
  material: 'clay' | 'filament';
  machineProfile: string;        // id in MACHINE_PROFILES, or 'custom'
  firmware: Firmware;
  bedShape: 'rect' | 'circle';
  bedX: number;                  // mm — width, or diameter of a round bed
  bedY: number;                  // mm — depth (rect only)
  bedZ: number;                  // mm — highest Z the machine reaches
  bedOrigin: 'corner' | 'centre'; // where the machine's X0 Y0 is
  nozzleDiameter: number;        // mm
  lineWidth: number;             // mm — bead width, for filament E and flow checks
  filamentDiameter: number;      // mm
  flowRatio: number;             // % — filament E multiplier
  maxVolumetricFlow: number;     // mm³/s the hotend melts; 0 = unknown
  nozzleTemp: number;            // °C — {nozzleTemp} in the start G-code
  bedTemp: number;               // °C — {bedTemp}
  fanSpeed: number;              // % — filament only
  fanFromLayer: number;          // 1-based layer where the fan turns on
  retractLength: number;         // mm of filament pulled back on travel; 0 = off
  retractSpeed: number;          // mm/min
  firstLayerSpeed: number;       // mm/min; 0 = printSpeed
  minLayerTime: number;          // s — slower layers below this; 0 = off
  accel: number;                 // mm/s²; 0 = leave the firmware's
  startGcode: string;            // template, see templateVars in gcodeGenerator
  endGcode: string;
}

export type Firmware = 'marlin' | 'klipper' | 'prusa' | 'bambu' | 'reprap';
