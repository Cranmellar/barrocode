/**
 * Summary of a G-code program, read back from the G-code itself so it counts
 * every move the printer will make (priming, skirt travel, soft-join
 * transitions, dwell), not just the toolpath. generateGcode keeps the same
 * summary while it writes; this reader is the tests' reference for it.
 *
 * Time assumes each move runs at its programmed feedrate: no acceleration,
 * so real prints take somewhat longer. With E disabled every move counts as
 * travel. E only counts once it passes its highest value so far, so a
 * retraction and its recovery consume nothing.
 */

export interface GcodeBox { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }

export interface GcodeStats {
  timeSec: number;
  printLength: number;   // mm extruded along
  travelLength: number;  // mm moved without extruding
  eTotal: number;        // E units consumed
  // Every coordinate a G0/G1 names, travel included; ±Infinity when none.
  box: GcodeBox;
}

export const emptyBox = (): GcodeBox =>
  ({ minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });

export function growBox(b: GcodeBox, x?: number, y?: number, z?: number) {
  if (x !== undefined) { if (x < b.minX) b.minX = x; if (x > b.maxX) b.maxX = x; }
  if (y !== undefined) { if (y < b.minY) b.minY = y; if (y > b.maxY) b.maxY = y; }
  if (z !== undefined) { if (z < b.minZ) b.minZ = z; if (z > b.maxZ) b.maxZ = z; }
}

export function summarizeGcode(gcode: string): GcodeStats {
  let x = 0, y = 0, z = 0, e = 0, f = 0, eHigh = 0;
  let timeSec = 0, printLength = 0, travelLength = 0, eTotal = 0;
  const box = emptyBox();

  for (const raw of gcode.split('\n')) {
    const line = raw.split(';')[0].trim();
    if (!line) continue;
    const words = line.split(/\s+/);
    const cmd = words[0];
    const arg: Record<string, number> = {};
    for (const w of words.slice(1)) arg[w[0]] = parseFloat(w.slice(1));

    if (cmd === 'G0' || cmd === 'G1') {
      if (arg.F !== undefined) f = arg.F;
      const nx = arg.X ?? x, ny = arg.Y ?? y, nz = arg.Z ?? z, ne = arg.E ?? e;
      const d = Math.hypot(nx - x, ny - y, nz - z);
      if (f > 0) timeSec += d / (f / 60);
      if (ne > e) {
        printLength += d;
        if (ne > eHigh) { eTotal += ne - eHigh; eHigh = ne; }
      } else {
        travelLength += d;
      }
      growBox(box, arg.X, arg.Y, arg.Z);
      x = nx; y = ny; z = nz; e = ne;
    } else if (cmd === 'G4') {
      timeSec += arg.P !== undefined ? arg.P / 1000 : arg.S ?? 0;
    } else if (cmd === 'G92' && arg.E !== undefined) {
      e = eHigh = arg.E;
    }
  }

  return { timeSec, printLength, travelLength, eTotal, box };
}
