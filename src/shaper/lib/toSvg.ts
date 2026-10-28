import { fmt, shapeBounds, shapePath, shapePoints, type ShapeDoc } from './shape';

/**
 * A standalone SVG whose user unit is 1 mm: the viewBox is the shape's box in
 * mm and width/height say so, so `parseSVG` reports mmPerUnit = 1.
 */
export function shapeToSvg(doc: ShapeDoc): string {
  const pts = shapePoints(doc);
  const b = shapeBounds(pts);
  const vb = [b.x, b.y, b.width, b.height].map(v => fmt(v)).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${fmt(b.width)}mm" height="${fmt(b.height)}mm">`
    + `<path d="${shapePath(pts)}" fill="none" stroke="#000"/></svg>`;
}
