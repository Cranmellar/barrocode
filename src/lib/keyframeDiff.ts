import type { PrintParams, WaveKeyframe } from '../types';

export interface KeyframeChange { label: string; from: string; to: string; unit: string }

const DEG = 180 / Math.PI;

// [label, value of a keyframe (optional fields fall back to the global
// value), unit, decimals]. Same order as the Lissajous panel, then the dock.
const FIELDS: Array<[string, (k: WaveKeyframe, p: PrintParams) => number, string, number]> = [
  ['N',            k => k.ampN, 'mm', 2],
  ['λN',           k => k.wlN, 'mm', 1],
  ['T',            k => k.ampT, 'mm', 2],
  ['λT',           k => k.wlT, 'mm', 1],
  ['Z',            (k, p) => k.ampZ ?? p.lissAmpZ, 'mm', 2],
  ['λZ',           (k, p) => k.wlZ ?? p.lissWlZ, 'mm', 1],
  ['Fase Z',       (k, p) => (k.phaseZ ?? p.lissPhaseZ) * DEG, '°', 0],
  ['Delta',        k => k.delta * DEG, '°', 0],
  ['Desfase',      (k, p) => (k.phaseOffset ?? p.lissPhaseOffset) * DEG, '°', 0],
  ['Desfase/capa', (k, p) => (k.phaseShift ?? p.phaseShiftPerLayer) * DEG, '°', 1],
  ['Giro',         (k, p) => k.rotation ?? p.rotation, '°', 1],
  ['Escala X',     (k, p) => k.scaleX ?? p.scaleX, '', 2],
  ['Escala Y',     (k, p) => k.scaleY ?? p.scaleY, '', 2],
  ['Centro X',     (k, p) => k.centerX ?? p.centerX, 'mm', 1],
  ['Centro Y',     (k, p) => k.centerY ?? p.centerY, 'mm', 1],
];

const fmt = (v: number, d: number) => v.toLocaleString('es', { maximumFractionDigits: d });

/** What changes from `prev` to `kf`, at the precision the editor shows. */
export function keyframeChanges(prev: WaveKeyframe, kf: WaveKeyframe, params: PrintParams): KeyframeChange[] {
  const out: KeyframeChange[] = [];
  for (const [label, get, unit, d] of FIELDS) {
    const from = fmt(get(prev, params), d), to = fmt(get(kf, params), d);
    if (from !== to) out.push({ label, from, to, unit });
  }
  return out;
}
