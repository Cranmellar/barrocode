/**
 * Pre-export review for the Máquina workspace: what in the G-code the chosen
 * machine can't run, or runs badly. Pure, so the panel and the tests share it.
 */

import type { PrintParams } from '../types';
import type { ToolpathLayer } from './toolpath';
import type { GcodeStats } from './gcodeStats';
import { gcodeOffset, layerFeeds, unknownTemplateVars } from './gcodeGenerator';
import { bedCentre } from './machineProfiles';
import { MAX_LAYERS } from './waveGenerator';

export type CheckLevel = 'err' | 'warn' | 'ok';

export interface MachineCheck {
  level: CheckLevel;
  title: string;
  detail?: string;
  // A one-click fix the panel offers.
  action?: 'centre' | 'adapt';
}

// Segments per second past which the firmware's planner starves and the
// motion stutters. Rough: Marlin on 32-bit boards, Klipper on its host.
const SEGMENT_RATE: Record<PrintParams['firmware'], number> = {
  marlin: 400, prusa: 600, reprap: 800, klipper: 2500, bambu: 2500,
};

const n = (v: number, d = 1) => v.toLocaleString('es', { maximumFractionDigits: d });

/** The bed's XY limits in machine coordinates (a round bed's bounding square). */
export function bedLimits(params: PrintParams) {
  const w = params.bedX, d = params.bedShape === 'circle' ? params.bedX : params.bedY;
  return params.bedOrigin === 'centre'
    ? { minX: -w / 2, maxX: w / 2, minY: -d / 2, maxY: d / 2 }
    : { minX: 0, maxX: w, minY: 0, maxY: d };
}

export function checkMachine(params: PrintParams, toolpath: ToolpathLayer[], stats: GcodeStats | null): MachineCheck[] {
  const out: MachineCheck[] = [];
  if (toolpath.length === 0) return out;
  const filament = params.material === 'filament';
  const off = gcodeOffset(toolpath, params);

  let top = -Infinity, maxR = 0;
  const c = bedCentre(params);
  const pts = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const layer of toolpath) {
    for (const path of layer.paths) {
      for (const p of path) {
        const x = p.x + off.x, y = p.y + off.y;
        if (p.z > top) top = p.z;
        if (x < pts.minX) pts.minX = x;
        if (x > pts.maxX) pts.maxX = x;
        if (y < pts.minY) pts.minY = y;
        if (y > pts.maxY) pts.maxY = y;
        maxR = Math.max(maxR, Math.hypot(x - c.x, y - c.y));
      }
    }
  }
  // The program's own envelope also has the priming line and travel arcs.
  const box = stats && Number.isFinite(stats.box.minX) ? stats.box : pts;
  const bed = bedLimits(params);
  const span = `X ${n(box.minX)} a ${n(box.maxX)} · Y ${n(box.minY)} a ${n(box.maxY)} mm`;

  if (params.bedOrigin === 'corner' && (box.minX < -1e-6 || box.minY < -1e-6)) {
    out.push({ level: 'err', title: 'Parte del recorrido queda en X/Y negativos',
      detail: `${span}. Con el origen en una esquina la máquina no llega ahí: recorta el movimiento o rechaza el archivo.`, action: 'centre' });
  } else if (params.bedShape === 'circle' ? maxR > params.bedX / 2 + 1e-6
    : box.minX < bed.minX - 1e-6 || box.maxX > bed.maxX + 1e-6 || box.minY < bed.minY - 1e-6 || box.maxY > bed.maxY + 1e-6) {
    out.push({ level: 'err', title: 'La pieza se sale de la cama',
      detail: params.bedShape === 'circle'
        ? `Llega a ${n(maxR)} mm del centro de una cama de ${n(params.bedX / 2)} mm de radio.`
        : `${span}, en una cama de X ${n(bed.minX)} a ${n(bed.maxX)} · Y ${n(bed.minY)} a ${n(bed.maxY)}.`,
      action: 'centre' });
  } else {
    out.push({ level: 'ok', title: 'Dentro de la cama', detail: span });
  }

  if (top > params.bedZ) out.push({ level: 'err', title: `La pieza mide ${n(top)} mm; la máquina llega a ${n(params.bedZ)}` });
  else out.push({ level: 'ok', title: `Altura ${n(top)} de ${n(params.bedZ)} mm` });
  if (params.safeZ > params.bedZ) out.push({ level: 'warn', title: `Z de seguridad (${n(params.safeZ)} mm) por encima de la máquina` });

  const h = params.layerHeight, noz = params.nozzleDiameter;
  if (h > 0.8 * noz) {
    out.push({ level: filament ? 'err' : 'warn', title: `Capa de ${n(h, 2)} mm con boquilla de ${n(noz, 2)}`,
      detail: filament ? 'Más del 80 % de la boquilla: las capas no se pegan.' : 'En arcilla suele ir entre el 40 y el 70 % de la boquilla.', action: 'adapt' });
  } else if (h < 0.25 * noz) {
    out.push({ level: 'warn', title: `Capa de ${n(h, 2)} mm con boquilla de ${n(noz, 2)}`,
      detail: 'Muy fina para esta boquilla: el cordón se aplasta y la onda apenas se lee.', action: 'adapt' });
  }

  if (filament) {
    if (params.lineWidth < noz || params.lineWidth > 2 * noz) {
      out.push({ level: 'warn', title: `Cordón de ${n(params.lineWidth, 2)} mm con boquilla de ${n(noz, 2)}`, detail: 'Lo habitual es entre 1 y 2 veces la boquilla.' });
    }
    const q = params.lineWidth * h * params.printSpeed / 60;
    if (params.maxVolumetricFlow > 0 && q > params.maxVolumetricFlow) {
      out.push({ level: 'warn', title: `Caudal de ${n(q)} mm³/s; la boquilla funde ${n(params.maxVolumetricFlow)}`,
        detail: `Baja la velocidad a ${n(params.maxVolumetricFlow / (params.lineWidth * h))} mm/s o el ancho de cordón.` });
    } else {
      out.push({ level: 'ok', title: `Caudal de ${n(q)} mm³/s`, detail: params.maxVolumetricFlow > 0 ? `límite del perfil: ${n(params.maxVolumetricFlow)} mm³/s` : undefined });
    }
  }

  if (params.minLayerTime > 0) {
    const feeds = layerFeeds(toolpath, params);
    const slowest = Math.min(...feeds);
    const slowed = feeds.filter((f, i) => f < (i === 0 && params.firstLayerSpeed > 0 ? params.firstLayerSpeed : params.printSpeed)).length;
    if (slowed > 0) {
      out.push({ level: slowest < 0.4 * params.printSpeed ? 'warn' : 'ok',
        title: `${slowed} capa${slowed > 1 ? 's' : ''} más rápida${slowed > 1 ? 's' : ''} que ${n(params.minLayerTime)} s`,
        detail: `Se imprimen más despacio, hasta ${n(slowest / 60)} mm/s, para que cada capa ${filament ? 'enfríe' : 'se asiente'}.` });
    }
  }

  const rate = params.printSpeed / 60 / Math.max(0.01, params.sampleSpacing * params.scaleFactor);
  const limit = SEGMENT_RATE[params.firmware];
  if (rate > limit) {
    out.push({ level: 'warn', title: `${Math.round(rate)} segmentos por segundo`,
      detail: `Por encima de ≈ ${limit} el movimiento tartamudea con este firmware. Baja la velocidad o aumenta el espaciado de muestra.` });
  }

  if (!params.useNumLayers && params.totalHeight / params.layerHeight > MAX_LAYERS) {
    out.push({ level: 'warn', title: `La altura total pide más de ${MAX_LAYERS} capas`, detail: `BarroCode corta en ${MAX_LAYERS}; la pieza sale más baja.` });
  }

  const unknown = unknownTemplateVars(params);
  if (unknown.length > 0) {
    out.push({ level: 'err', title: 'Variables desconocidas en las plantillas',
      detail: `${unknown.map(v => `{${v}}`).join(' ')} quedarían tal cual en el G-code.` });
  }
  if (filament && !params.startGcode.trim()) {
    out.push({ level: 'warn', title: 'Sin G-code de inicio', detail: 'Nada calienta la boquilla ni hace homing antes de imprimir.' });
  }
  if (params.firmware === 'bambu') {
    out.push({ level: 'warn', title: 'Bambu Lab no imprime cualquier .gcode',
      detail: 'Desde la tarjeta funciona en monocolor; por red espera un .gcode.3mf con su propio inicio.' });
  }
  if (params.firmware === 'prusa' && !/M862\.3/.test(params.startGcode)) {
    out.push({ level: 'warn', title: 'Falta la comprobación de modelo (M862.3)', detail: 'La impresora no avisará si el archivo es de otro modelo.' });
  }
  if (params.firmware === 'klipper' && /START_PRINT|PRINT_START/.test(params.startGcode) && /M109|M190/.test(params.startGcode)) {
    out.push({ level: 'warn', title: 'Calentamiento doble', detail: 'La plantilla espera la temperatura con M109/M190 y además llama a la macro de inicio.' });
  }

  const order: Record<CheckLevel, number> = { err: 0, warn: 1, ok: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/**
 * Layer height, bead width, wave and sample spacing scaled to the nozzle:
 * the starting point for a material or nozzle the wave wasn't set for. The
 * wave is left alone when keyframes hold it.
 */
export function adaptToNozzle(params: PrintParams, hasKeyframes: boolean): PrintParams {
  const noz = params.nozzleDiameter;
  const k = params.material === 'filament'
    ? { h: 0.5, w: 1.5, amp: 2.5, wl: 15 }
    : { h: 0.6, w: 1.25, amp: 0.75, wl: 5 };
  const round = (v: number, step: number) => +(Math.round(v / step) * step).toFixed(3);
  const wl = Math.max(1, round(noz * k.wl, 0.5));
  const next: PrintParams = {
    ...params,
    layerHeight: Math.max(0.05, round(noz * k.h, 0.05)),
    lineWidth: Math.max(0.05, round(noz * k.w, 0.05)),
  };
  if (!hasKeyframes) {
    next.lissAmpN = round(noz * k.amp, 0.1);
    next.lissWlN = wl;
    next.lissWlT = wl;
  }
  next.sampleSpacing = Math.max(0.1, round(Math.min(wl, hasKeyframes ? params.lissWlN : wl) / 16 / params.scaleFactor, 0.05));
  return next;
}
