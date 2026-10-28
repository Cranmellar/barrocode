export interface ShapeDoc {
  family: 'circle';
  /** Outer diameter in mm. */
  sizeMM: number;
}

export const DEFAULT_SHAPE: ShapeDoc = { family: 'circle', sizeMM: 80 };

export interface Bounds { x: number; y: number; width: number; height: number }

/** Bounding box in mm, centred on the shape. */
export function shapeBounds(doc: ShapeDoc): Bounds {
  const r = doc.sizeMM / 2;
  return { x: -r, y: -r, width: doc.sizeMM, height: doc.sizeMM };
}

// Control-point distance that puts a quarter cubic closest to a circular arc
// (radius error ≈ 0.027 %).
const KAPPA = 0.5522847498;

/** Path data in mm, centred on (0, 0). Starts at +X: that sample is the seam. */
export function shapePath(doc: ShapeDoc): string {
  const r = doc.sizeMM / 2;
  const k = r * KAPPA;
  const n = (v: number) => fmt(v);
  return `M${n(r)} 0`
    + `C${n(r)} ${n(k)} ${n(k)} ${n(r)} 0 ${n(r)}`
    + `C${n(-k)} ${n(r)} ${n(-r)} ${n(k)} ${n(-r)} 0`
    + `C${n(-r)} ${n(-k)} ${n(-k)} ${n(-r)} 0 ${n(-r)}`
    + `C${n(k)} ${n(-r)} ${n(r)} ${n(-k)} ${n(r)} 0Z`;
}

export function seamPoint(doc: ShapeDoc): { x: number; y: number } {
  return { x: doc.sizeMM / 2, y: 0 };
}

export function shapeLabel(doc: ShapeDoc): string {
  return `Círculo · Ø ${fmt(doc.sizeMM)} mm`;
}

export function fmt(v: number): string {
  return String(+v.toFixed(3));
}
