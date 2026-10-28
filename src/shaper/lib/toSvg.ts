import { fmt, shapeBounds, shapeOutlines, shapePath, type ShapeDoc } from './shape';

/**
 * A standalone SVG whose user unit is 1 mm: the viewBox is the shape's box in
 * mm and width/height say so, so `parseSVG` reports mmPerUnit = 1. Each
 * contour is its own <path>, so each prints as its own path.
 */
export function shapeToSvg(doc: ShapeDoc): string {
  const outlines = shapeOutlines(doc);
  const b = shapeBounds(outlines);
  const vb = [b.x, b.y, b.width, b.height].map(v => fmt(v)).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${fmt(b.width)}mm" height="${fmt(b.height)}mm">`
    + outlines.map(o => `<path d="${shapePath([o])}" fill="none" stroke="#000"/>`).join('') + '</svg>';
}
