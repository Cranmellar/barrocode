/**
 * Printer profiles for the Máquina workspace. Catalogue figures and
 * community slicer profiles, none checked on a machine yet: each profile's
 * note says what to verify. Speeds are mm/min, like PrintParams.
 */

import type { Firmware, PrintParams } from '../types';

export const FIRMWARE_LABEL: Record<Firmware, string> = {
  marlin: 'Marlin', klipper: 'Klipper', prusa: 'Prusa (Marlin)', bambu: 'Bambu Lab', reprap: 'RepRap / Duet',
};

/** Fields that describe the machine rather than the part; they survive loading another SVG or session. */
export const MACHINE_FIELDS = [
  'material', 'machineProfile', 'firmware', 'bedShape', 'bedX', 'bedY', 'bedZ', 'bedOrigin',
  'gcodeOrigin', 'originX', 'originY', 'marginX', 'marginY',
  'nozzleDiameter', 'lineWidth', 'filamentDiameter', 'flowRatio', 'maxVolumetricFlow',
  'nozzleTemp', 'bedTemp', 'fanSpeed', 'fanFromLayer', 'retractLength', 'retractSpeed',
  'printSpeed', 'travelSpeed', 'firstLayerSpeed', 'minLayerTime', 'accel',
  'generateE', 'extrusionMultiplier', 'nozzleHeightOffset', 'safeZ',
  'dwellAtStart', 'primingMove', 'primingLength', 'startGcode', 'endGcode',
] as const satisfies readonly (keyof PrintParams)[];

export type MachineFields = Pick<PrintParams, typeof MACHINE_FIELDS[number]>;

const T = {
  creality: 'M140 S0\nM104 S0\nSTART_PRINT EXTRUDER_TEMP={nozzleTemp} BED_TEMP={bedTemp}',
  crealityEnd: 'END_PRINT',
  voron: 'PRINT_START BED={bedTemp} EXTRUDER={nozzleTemp}',
  voronEnd: 'PRINT_END',
  marlin: [
    'M140 S{bedTemp}', 'M104 S{nozzleTemp}', 'G28', 'M190 S{bedTemp}', 'M109 S{nozzleTemp}', 'G92 E0',
    'G1 Z2 F600', 'G1 X3 Y20 F6000', 'G1 Z0.3 F600', 'G1 X3 Y150 E12 F1500 ; purge line', 'G1 Z2 F600', 'G92 E0',
  ].join('\n'),
  marlinEnd: ['M104 S0', 'M140 S0', 'M107', 'G1 X0 Y{bedY} F3000', 'M84'].join('\n'),
  prusa: (model: string) => [
    `M862.3 P "${model}" ; printer model check`, 'M140 S{bedTemp}', 'M104 S170', 'G28', 'G29 ; bed mesh',
    'M104 S{nozzleTemp}', 'M190 S{bedTemp}', 'M109 S{nozzleTemp}', 'G92 E0', 'G1 Z0.3 F720', 'G1 X10 Y5 F6000',
    'G1 X100 Y5 E9 F1200 ; purge line', 'G92 E0',
  ].join('\n'),
  prusaEnd: ['M104 S0', 'M140 S0', 'M107', 'G1 X0 Y{bedY} F3600', 'M84'].join('\n'),
  bambu: [
    '; Minimal start: Bambu Studio writes a long, per-model one. Start from',
    '; that one, and wrap the file as .gcode.3mf to send it over the network.',
    'M140 S{bedTemp}', 'M104 S{nozzleTemp}', 'G28', 'M190 S{bedTemp}', 'M109 S{nozzleTemp}', 'G92 E0',
  ].join('\n'),
  bambuEnd: ['M104 S0', 'M140 S0', 'M106 S0', 'M84'].join('\n'),
  wasp: 'G28 ; home (top of the tower on a delta)',
  waspEnd: 'G28',
};

export interface MachineProfile {
  id: string;
  name: string;
  note: string;
  values: Omit<MachineFields, 'machineProfile' | 'gcodeOrigin' | 'originX' | 'originY' | 'marginX' | 'marginY'>;
}

const BASE: MachineProfile['values'] = {
  material: 'filament', firmware: 'marlin', bedShape: 'rect', bedX: 220, bedY: 220, bedZ: 250, bedOrigin: 'corner',
  nozzleDiameter: 0.4, lineWidth: 0.6, filamentDiameter: 1.75, flowRatio: 100, maxVolumetricFlow: 15,
  nozzleTemp: 215, bedTemp: 60, fanSpeed: 100, fanFromLayer: 3, retractLength: 0.8, retractSpeed: 2400,
  printSpeed: 3600, travelSpeed: 9000, firstLayerSpeed: 1800, minLayerTime: 8, accel: 0,
  generateE: true, extrusionMultiplier: 0.05, nozzleHeightOffset: 0, safeZ: 5,
  dwellAtStart: 0, primingMove: false, primingLength: 20, startGcode: T.marlin, endGcode: T.marlinEnd,
};
const CLAY: Partial<MachineProfile['values']> = {
  material: 'clay', nozzleDiameter: 4, lineWidth: 5, maxVolumetricFlow: 0, retractLength: 0,
  printSpeed: 600, travelSpeed: 1500, firstLayerSpeed: 0, minLayerTime: 0, nozzleHeightOffset: 1, safeZ: 20,
  startGcode: '', endGcode: '',
};

const p = (id: string, name: string, note: string, v: Partial<MachineProfile['values']>): MachineProfile =>
  ({ id, name, note, values: { ...BASE, ...v } });

export const MACHINE_PROFILES: MachineProfile[] = [
  p('clay-centre', 'Arcilla · origen al centro', 'Lo que BarroCode emitía siempre: sin plantillas, E como multiplicador de la bomba. Ajusta la cama a tu máquina.',
    { ...CLAY, firmware: 'reprap', bedX: 300, bedY: 300, bedZ: 400, bedOrigin: 'centre' }),
  p('clay-corner', 'Arcilla · origen en esquina', 'Cartesianas adaptadas a pasta (pistón o tornillo). Ajusta la cama a tu máquina.',
    { ...CLAY, bedX: 300, bedY: 300, bedZ: 400 }),
  p('wasp2040', 'Delta WASP 2040 Clay', 'Delta: cama circular de Ø200 mm con el origen al centro, 400 mm de alto. Capa mínima de catálogo 0,5 mm.',
    { ...CLAY, firmware: 'reprap', bedShape: 'circle', bedX: 200, bedY: 200, bedZ: 400, bedOrigin: 'centre',
      nozzleDiameter: 1.2, lineWidth: 1.6, printSpeed: 1200, travelSpeed: 3600, startGcode: T.wasp, endGcode: T.waspEnd }),

  p('k1', 'Creality K1 / K1C', 'Creality OS (Klipper): la macro START_PRINT calienta, hace homing y purga.',
    { firmware: 'klipper', printSpeed: 7200, travelSpeed: 18000, accel: 8000, maxVolumetricFlow: 32, startGcode: T.creality, endGcode: T.crealityEnd }),
  p('k1max', 'Creality K1 Max', 'Como la K1, con cama de 300 mm.',
    { firmware: 'klipper', bedX: 300, bedY: 300, bedZ: 300, printSpeed: 7200, travelSpeed: 18000, accel: 8000, maxVolumetricFlow: 32, startGcode: T.creality, endGcode: T.crealityEnd }),
  p('e3v3', 'Creality Ender-3 V3', 'CoreXZ con Creality OS (Klipper); Z rápido, bien para la onda Z. Macro de inicio supuesta igual a la K1.',
    { firmware: 'klipper', printSpeed: 7200, travelSpeed: 18000, accel: 8000, maxVolumetricFlow: 32, startGcode: T.creality, endGcode: T.crealityEnd }),
  p('e3v3ke', 'Creality Ender-3 V3 KE', 'Cartesiana con Creality OS (Klipper).',
    { firmware: 'klipper', bedZ: 240, printSpeed: 6000, travelSpeed: 15000, accel: 5000, maxVolumetricFlow: 24, startGcode: T.creality, endGcode: T.crealityEnd }),
  p('e3v3se', 'Creality Ender-3 V3 SE', 'Marlin: el G-code calienta, hace homing y purga por su cuenta.',
    {}),
  p('e3s1', 'Creality Ender-3 S1', 'Marlin.',
    { bedZ: 270, printSpeed: 3000, maxVolumetricFlow: 12 }),
  p('a1mini', 'Bambu Lab A1 mini', 'Un .gcode suelto desde la tarjeta funciona en monocolor; por red pide .gcode.3mf.',
    { firmware: 'bambu', bedX: 180, bedY: 180, bedZ: 180, printSpeed: 6000, travelSpeed: 18000, accel: 10000, maxVolumetricFlow: 20, startGcode: T.bambu, endGcode: T.bambuEnd }),
  p('a1', 'Bambu Lab A1', 'Como la A1 mini.',
    { firmware: 'bambu', bedX: 256, bedY: 256, bedZ: 256, printSpeed: 6000, travelSpeed: 18000, accel: 10000, maxVolumetricFlow: 20, startGcode: T.bambu, endGcode: T.bambuEnd }),
  p('p1s', 'Bambu Lab P1S / X1C', 'Cerrada: con PLA, abre la tapa o sube el ventilador. Mismo aviso de formato que la A1.',
    { firmware: 'bambu', bedX: 256, bedY: 256, bedZ: 256, printSpeed: 7200, travelSpeed: 18000, accel: 10000, maxVolumetricFlow: 24, startGcode: T.bambu, endGcode: T.bambuEnd }),
  p('mk4s', 'Prusa MK4S', 'Firmware Prusa (base Marlin). M862.3 rechaza el archivo en otro modelo.',
    { firmware: 'prusa', bedX: 250, bedY: 210, bedZ: 220, printSpeed: 4800, travelSpeed: 12000, accel: 4000, maxVolumetricFlow: 20, startGcode: T.prusa('MK4S'), endGcode: T.prusaEnd }),
  p('coreone', 'Prusa CORE One', 'Firmware Prusa (base Marlin).',
    { firmware: 'prusa', bedX: 250, bedY: 220, bedZ: 270, printSpeed: 6000, travelSpeed: 15000, accel: 5000, maxVolumetricFlow: 20, startGcode: T.prusa('COREONE'), endGcode: T.prusaEnd }),
  p('mini', 'Prusa MINI+', 'Firmware Prusa (base Marlin).',
    { firmware: 'prusa', bedX: 180, bedY: 180, bedZ: 180, printSpeed: 3600, maxVolumetricFlow: 12, startGcode: T.prusa('MINI'), endGcode: T.prusaEnd }),
  p('n4pro', 'Elegoo Neptune 4 Pro', 'Klipper de Elegoo; su perfil usa códigos estándar (M104/M109, G28).',
    { firmware: 'klipper', bedX: 225, bedY: 225, bedZ: 265, printSpeed: 6000, travelSpeed: 15000, accel: 5000, maxVolumetricFlow: 20 }),
  p('kobra3', 'Anycubic Kobra 3', 'Firmware basado en Klipper, con códigos estándar.',
    { firmware: 'klipper', bedX: 250, bedY: 250, bedZ: 260, printSpeed: 6000, travelSpeed: 15000, accel: 5000, maxVolumetricFlow: 20 }),
  p('sv06', 'Sovol SV06', 'Marlin.',
    { printSpeed: 3600, maxVolumetricFlow: 12 }),
  p('voron', 'Voron 2.4 (350)', 'Cada Voron tiene su macro; PRINT_START BED= EXTRUDER= es la convención más común.',
    { firmware: 'klipper', bedX: 350, bedY: 350, bedZ: 340, printSpeed: 7200, travelSpeed: 18000, accel: 6000, maxVolumetricFlow: 24, startGcode: T.voron, endGcode: T.voronEnd }),
];

export function findProfile(id: string): MachineProfile | null {
  return MACHINE_PROFILES.find(pr => pr.id === id) ?? null;
}

export function profileName(id: string): string {
  return findProfile(id)?.name ?? 'Personalizado';
}

/** Bed centre in machine coordinates. */
export function bedCentre(params: Pick<PrintParams, 'bedShape' | 'bedX' | 'bedY' | 'bedOrigin'>): { x: number; y: number } {
  if (params.bedOrigin === 'centre') return { x: 0, y: 0 };
  return { x: params.bedX / 2, y: (params.bedShape === 'circle' ? params.bedX : params.bedY) / 2 };
}

/** The profile's machine, with the part centred on its bed. */
export function applyProfile(params: PrintParams, profile: MachineProfile): PrintParams {
  const next: PrintParams = { ...params, ...profile.values, machineProfile: profile.id, gcodeOrigin: 'centre' };
  const c = bedCentre(next);
  return { ...next, originX: c.x, originY: c.y };
}
