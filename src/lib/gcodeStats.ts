/**
 * Summary of a generated G-code program, read back from the G-code itself
 * so it counts every move the printer will make (priming, skirt travel,
 * soft-join transitions, dwell), not just the toolpath.
 *
 * Time assumes each move runs at its programmed feedrate: no acceleration,
 * so real prints take somewhat longer. With E disabled every move counts as
 * travel.
 */

export interface GcodeStats {
  timeSec: number;
  printLength: number;   // mm extruded along
  travelLength: number;  // mm moved without extruding
  eTotal: number;        // E units consumed
}

export function summarizeGcode(gcode: string): GcodeStats {
  let x = 0, y = 0, z = 0, e = 0, f = 0;
  let timeSec = 0, printLength = 0, travelLength = 0, eTotal = 0;

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
        eTotal += ne - e;
      } else {
        travelLength += d;
      }
      x = nx; y = ny; z = nz; e = ne;
    } else if (cmd === 'G4') {
      timeSec += arg.P !== undefined ? arg.P / 1000 : arg.S ?? 0;
    } else if (cmd === 'G92' && arg.E !== undefined) {
      e = arg.E;
    }
  }

  return { timeSec, printLength, travelLength, eTotal };
}
