/**
 * Thumbnails for the printer's screen: the toolpath seen from the Iso
 * preset, in the layer colours, on a transparent square (as Creality Print
 * draws them). Browser only: it needs a canvas.
 */

import type { ToolpathLayer } from './toolpath';
import type { GcodeThumbnail } from './gcodeGenerator';
import { layerColor, makeProjector } from './draw3D';

const ISO_AZIMUTH = 325, ISO_ELEVATION = 28;
const MARGIN = 0.06;  // of the side, each edge

export function renderThumbnail(toolpath: ToolpathLayer[], size: number, lineWidth: number): GcodeThumbnail {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const project = makeProjector(ISO_AZIMUTH, ISO_ELEVATION);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const layer of toolpath) for (const path of layer.paths) for (const p of path) {
    const [x, y] = project(p.x, p.y, p.z);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const span = Math.max(maxX - minX, maxY - minY, 1e-6);
  const scale = size * (1 - 2 * MARGIN) / span;
  const ox = size / 2 - (minX + maxX) / 2 * scale;
  const oy = size / 2 - (minY + maxY) / 2 * scale;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, lineWidth * scale);
  // Points closer than this to the last one drawn add nothing at this size.
  const minStep = 0.5;
  toolpath.forEach((layer, li) => {
    ctx.strokeStyle = layerColor(li, toolpath.length);
    ctx.beginPath();
    for (const path of layer.paths) {
      let lx = NaN, ly = NaN;
      path.forEach((p, i) => {
        const [px, py] = project(p.x, p.y, p.z);
        const x = ox + px * scale, y = oy + py * scale;
        if (i === 0) { ctx.moveTo(x, y); lx = x; ly = y; return; }
        if (i < path.length - 1 && Math.abs(x - lx) < minStep && Math.abs(y - ly) < minStep) return;
        ctx.lineTo(x, y); lx = x; ly = y;
      });
    }
    ctx.stroke();
  });

  posterize(ctx, size);
  const png = canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
  return { width: size, height: size, png };
}

// The browser's PNG encoder compresses little: anti-aliased strokes in a
// colour ramp made a 300 px thumbnail ≈ 170 kB. Fewer distinct pixels let it
// find repeats; the screen shows the image small enough not to notice.
function posterize(ctx: CanvasRenderingContext2D, size: number) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 96) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; continue; }
    d[i + 3] = 255;
    for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, Math.round(d[i + c] / 32) * 32);
  }
  ctx.putImageData(img, 0, 0);
}
