import type { PrintParams, SampledPath, WaveKeyframe } from '../types';
import type { ShapeDoc } from '../shaper/lib/shape';
import { MACHINE_FIELDS } from './machineProfiles';
import { BUILD } from './build';

export const PROJECT_FORMAT = 'barrocode';
export const PROJECT_VERSION = 1;
export const PROJECT_EXT = '.barrocode.json';
// A project is mostly its SVG; a part made from tens of thousands of nodes
// stays well under this.
export const PROJECT_MAX_BYTES = 8 * 1024 * 1024;

export type PathState = Pick<SampledPath, 'id' | 'enabled' | 'ampNOverride' | 'ampTOverride' | 'wlNOverride' | 'wlTOverride'>;

export interface ProjectShape { doc: ShapeDoc; sent: string | null }

/** Which barrocode saved the file: commit and build date, and when it was saved (ISO). */
export interface ProjectApp { commit: string; build: string; saved: string }

/** What a `.barrocode.json` holds, checked field by field. */
export interface Project {
  name: string;
  svg: string | null;
  /** The design: every field of PrintParams but MACHINE_FIELDS. */
  params: Partial<PrintParams>;
  /** The printer it was made on, kept as a reference: opening it doesn't apply it. */
  machine: Partial<PrintParams>;
  keyframes: WaveKeyframe[];
  paths: PathState[];
  shape: ProjectShape | null;
  /** Null for files saved before barrocode wrote it. */
  app: ProjectApp | null;
}

export interface ProjectInput {
  name: string;
  svg: string | null;
  params: PrintParams;
  keyframes: WaveKeyframe[];
  paths: PathState[];
  shape: ProjectShape | null;
}

const MACHINE = new Set<string>(MACHINE_FIELDS);

export function serializeProject(p: ProjectInput, now = new Date()): string {
  const entries = Object.entries(p.params);
  const app: ProjectApp = { commit: BUILD.commit, build: BUILD.date, saved: now.toISOString() };
  return JSON.stringify({
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    app,
    name: p.name,
    svg: p.svg,
    params: Object.fromEntries(entries.filter(([k]) => !MACHINE.has(k))),
    machine: Object.fromEntries(entries.filter(([k]) => MACHINE.has(k))),
    keyframes: p.keyframes,
    paths: p.paths,
    shape: p.shape,
  }, null, 1);
}

export const projectFileName = (name: string) => `${name || 'barrocode'}${PROJECT_EXT}`;

export function nameFromFile(fileName: string): string {
  return fileName.replace(/\.barrocode\.json$/i, '').replace(/\.json$/i, '');
}

type Kind = 'number' | 'boolean' | 'string';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fits = (v: unknown, kind: Kind) => typeof v === kind && (kind !== 'number' || Number.isFinite(v));

/** The keys of `src` that `kinds` names, with the type it gives them; the rest are dropped. */
function pick<T>(src: Record<string, unknown>, kinds: Record<string, Kind>): Partial<T> {
  return Object.fromEntries(Object.entries(src).filter(([k, v]) => Object.prototype.hasOwnProperty.call(kinds, k) && fits(v, kinds[k]))) as Partial<T>;
}

const KF_KINDS: Record<keyof WaveKeyframe, Kind> = {
  id: 'string', t: 'number', ampN: 'number', ampT: 'number', wlN: 'number', wlT: 'number', delta: 'number',
  ampZ: 'number', wlZ: 'number', phaseZ: 'number', centerX: 'number', centerY: 'number',
  scaleX: 'number', scaleY: 'number', rotation: 'number', phaseOffset: 'number', phaseShift: 'number',
  smooth: 'boolean',
};
const KF_REQUIRED = ['id', 't', 'ampN', 'ampT', 'wlN', 'wlT', 'delta'] as const;

function keyframe(v: unknown): WaveKeyframe | null {
  if (!isObj(v)) return null;
  const k = pick<WaveKeyframe>(v, KF_KINDS);
  return KF_REQUIRED.every(f => k[f] !== undefined) && k.t! >= 0 && k.t! <= 1 ? k as WaveKeyframe : null;
}

const OVERRIDES = ['ampNOverride', 'ampTOverride', 'wlNOverride', 'wlTOverride'] as const;

function pathState(v: unknown): PathState | null {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.enabled !== 'boolean') return null;
  const s: PathState = { id: v.id, enabled: v.enabled, ampNOverride: null, ampTOverride: null, wlNOverride: null, wlTOverride: null };
  for (const f of OVERRIDES) if (fits(v[f], 'number')) s[f] = v[f] as number;
  return s;
}

const SHAPE_KINDS: Record<Exclude<keyof ShapeDoc, 'family' | 'contours'>, Kind> = {
  sizeMM: 'number', rotation: 'number', seamAngle: 'number', clockwise: 'boolean',
  sfM: 'number', sfN1: 'number', sfN2: 'number', sfN3: 'number',
  polySides: 'number', polyStarPct: 'number', polyFilletMM: 'number',
  lobeCount: 'number', lobeDepthPct: 'number', lobeSharp: 'number',
  pathOrder: 'number', pathSymmetric: 'boolean',
};
const FAMILIES: ReadonlySet<unknown> = new Set<ShapeDoc['family']>(['superformula', 'polygon', 'lobes']);
const NODE_NUMS = ['x', 'y', 'inX', 'inY', 'outX', 'outY'] as const;

const isNode = (n: unknown) => isObj(n) && typeof n.smooth === 'boolean' && NODE_NUMS.every(f => fits(n[f], 'number'));
const isContours = (c: unknown) => Array.isArray(c) && c.length > 0
  && c.every(nodes => Array.isArray(nodes) && nodes.length >= 2 && nodes.every(isNode));

/** Forma fills any missing field from its defaults, so a partial doc is fine. */
export function shapeDoc(v: unknown): ShapeDoc | null {
  if (!isObj(v) || !FAMILIES.has(v.family)) return null;
  if (v.contours !== null && v.contours !== undefined && !isContours(v.contours)) return null;
  return { ...pick<ShapeDoc>(v, SHAPE_KINDS), family: v.family, contours: v.contours ?? null } as ShapeDoc;
}

function projectApp(v: unknown): ProjectApp | null {
  if (!isObj(v) || typeof v.commit !== 'string' || !v.commit) return null;
  const str = (x: unknown) => typeof x === 'string' ? x : '';
  return { commit: v.commit, build: str(v.build), saved: str(v.saved) };
}

function shape(v: unknown): ProjectShape | null {
  if (!isObj(v)) return null;
  const doc = shapeDoc(v.doc);
  return doc && { doc, sent: typeof v.sent === 'string' ? v.sent : null };
}

/**
 * Reads a project file. Fields of the wrong type are dropped, so the app's
 * defaults fill them; a keyframe or path entry that can't be read is skipped.
 * The SVG is cleaned later by parseSVG, like any loaded SVG.
 */
export function parseProject(text: string, defaults: PrintParams): Project | { error: string } {
  if (text.length > PROJECT_MAX_BYTES) return { error: 'El archivo es demasiado grande para ser un proyecto de barrocode.' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'El archivo no es un proyecto de barrocode (no es JSON válido).' };
  }
  if (!isObj(data) || data.format !== PROJECT_FORMAT) return { error: 'El archivo no es un proyecto de barrocode.' };
  if (typeof data.version !== 'number' || data.version > PROJECT_VERSION) {
    return { error: 'Este proyecto es de una versión más nueva de barrocode. Recarga la página e inténtalo de nuevo.' };
  }

  const svg = typeof data.svg === 'string' ? data.svg : null;
  const sh = shape(data.shape);
  if (svg === null && sh === null) return { error: 'El proyecto no trae ni un SVG ni una forma.' };

  const kinds = Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, typeof v as Kind]));
  const all = isObj(data.params) ? pick<PrintParams>(data.params, kinds) : {};
  const params = Object.fromEntries(Object.entries(all).filter(([k]) => !MACHINE.has(k))) as Partial<PrintParams>;
  const machine = isObj(data.machine)
    ? pick<PrintParams>(data.machine, Object.fromEntries(Object.entries(kinds).filter(([k]) => MACHINE.has(k))))
    : {};

  const list = <T>(v: unknown, read: (x: unknown) => T | null) =>
    Array.isArray(v) ? v.map(read).filter((x): x is T => x !== null) : [];

  return {
    name: typeof data.name === 'string' ? data.name : '',
    svg,
    params,
    machine,
    keyframes: list(data.keyframes, keyframe).sort((a, b) => a.t - b.t),
    paths: list(data.paths, pathState),
    shape: sh,
    app: projectApp(data.app),
  };
}
