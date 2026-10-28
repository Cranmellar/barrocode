import { fmt, shapeBounds, shapePath, type ShapeDoc } from './shape';

/**
 * A standalone SVG whose user unit is 1 mm: the viewBox is the shape's box in
 * mm and width/height say so, so `parseSVG` reports mmPerUnit = 1.
 */
export function shapeToSvg(doc: ShapeDoc): string {
  const b = shapeBounds(doc);
  const vb = [b.x, b.y, b.width, b.height].map(fmt).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${fmt(b.width)}mm" height="${fmt(b.height)}mm">`
    + `<path d="${shapePath(doc)}" fill="none" stroke="#000"/></svg>`;
}
