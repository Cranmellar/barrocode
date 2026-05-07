/**
 * SVG Parser — extracts and samples geometric elements from an SVG string.
 *
 * Strategy: insert the SVG into a hidden off-screen div so the browser's
 * layout engine can compute transforms and arc lengths natively via
 * SVGGeometryElement.getTotalLength() / getPointAtLength().
 */

import type { SampledPath, SampledPoint, ParsedSVG } from '../types';

// Persistent hidden container reused across calls to avoid repeated DOM churn.
let _hiddenContainer: HTMLDivElement | null = null;

function getHiddenContainer(): HTMLDivElement {
  if (!_hiddenContainer || !document.body.contains(_hiddenContainer)) {
    _hiddenContainer = document.createElement('div');
    _hiddenContainer.style.cssText =
      'position:fixed;left:-9999px;top:0;width:2000px;height:2000px;overflow:hidden;visibility:hidden;pointer-events:none;';
    document.body.appendChild(_hiddenContainer);
  }
  return _hiddenContainer;
}

/**
 * Transform a DOMPoint from element-local coordinates into SVG root user-unit
 * coordinates, accounting for any CSS/SVG transforms on the element and its
 * ancestors up to (but not including) the SVG viewport transform.
 *
 * We use getScreenCTM() for both and cancel the common viewport factor so
 * that what remains is purely the element→SVG-user-units mapping.
 */
function elementPointToSVGUnits(
  rawPoint: DOMPoint,
  elScreenCTM: DOMMatrix,
  svgScreenCTM: DOMMatrix,
): { x: number; y: number } {
  // M = svgScreenCTM^(-1) · elScreenCTM
  // This maps element coords → SVG root user-unit coords.
  const m = svgScreenCTM.inverse().multiply(elScreenCTM);
  const result = rawPoint.matrixTransform(m);
  return { x: result.x, y: result.y };
}

/**
 * Sample one SVGGeometryElement at regular arc-length intervals.
 * Returns an array of SampledPoint with position, unit tangent, and unit normal.
 *
 * @param el          The live DOM element (must be in document).
 * @param svgEl       The root <svg> element (used for CTM computation).
 * @param spacing     Desired spacing between samples in SVG user units.
 */
function sampleElement(
  el: SVGGeometryElement,
  svgEl: SVGSVGElement,
  spacing: number,
): SampledPoint[] {
  const totalLen = el.getTotalLength();
  if (totalLen <= 0) return [];

  const elCTM = el.getScreenCTM();
  const svgCTM = svgEl.getScreenCTM();
  const hasTransform = !!(elCTM && svgCTM);

  // Number of evenly-spaced samples along the arc.
  const nSegments = Math.max(2, Math.ceil(totalLen / spacing));
  const step = totalLen / nSegments;

  // Epsilon for finite-difference tangent (must be small relative to spacing).
  const eps = Math.min(step * 0.05, 0.5, totalLen * 0.005);

  const points: SampledPoint[] = [];

  for (let i = 0; i <= nSegments; i++) {
    const t = Math.min(i * step, totalLen);

    const rawP = el.getPointAtLength(t);
    const rawP0 = el.getPointAtLength(Math.max(0, t - eps));
    const rawP1 = el.getPointAtLength(Math.min(totalLen, t + eps));

    let px: number, py: number;
    let ax: number, ay: number, bx: number, by: number;

    if (hasTransform) {
      const p = elementPointToSVGUnits(rawP as DOMPoint, elCTM!, svgCTM!);
      const p0 = elementPointToSVGUnits(rawP0 as DOMPoint, elCTM!, svgCTM!);
      const p1 = elementPointToSVGUnits(rawP1 as DOMPoint, elCTM!, svgCTM!);
      px = p.x; py = p.y;
      ax = p0.x; ay = p0.y;
      bx = p1.x; by = p1.y;
    } else {
      px = rawP.x; py = rawP.y;
      ax = rawP0.x; ay = rawP0.y;
      bx = rawP1.x; by = rawP1.y;
    }

    // Unit tangent via central finite difference.
    let dx = bx - ax;
    let dy = by - ay;
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > 1e-12) {
      dx /= mag;
      dy /= mag;
    } else {
      // Degenerate: use previous tangent or default.
      dx = points.length > 0 ? points[points.length - 1].tangentX : 1;
      dy = points.length > 0 ? points[points.length - 1].tangentY : 0;
    }

    // Unit normal: 90° counter-clockwise from tangent.
    // In SVG space (Y-down), CCW rotation means: normal = (-dy, dx).
    // This produces oscillation to the left/right of the travel direction.
    const nx = -dy;
    const ny = dx;

    points.push({
      x: px,
      y: py,
      tangentX: dx,
      tangentY: dy,
      normalX: nx,
      normalY: ny,
      arcLength: t,
    });
  }

  return points;
}

/**
 * Parse an SVG string and sample all geometry elements.
 *
 * Supported elements: <path>, <polyline>, <polygon>, <line>,
 *                     <circle>, <ellipse>, <rect>.
 *
 * @param svgString  Raw SVG markup.
 * @param spacing    Sample spacing in SVG user units.
 */
export function parseSVG(svgString: string, spacing: number): ParsedSVG {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');

  // Detect parser errors (malformed XML).
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`SVG parse error: ${parseError.textContent?.slice(0, 200)}`);
  }

  const sourceSvgEl = doc.documentElement as unknown as SVGSVGElement;
  const vb = sourceSvgEl.viewBox?.baseVal;
  const viewBox = {
    x: vb?.x ?? 0,
    y: vb?.y ?? 0,
    width: vb?.width || parseFloat(sourceSvgEl.getAttribute('width') ?? '200') || 200,
    height: vb?.height || parseFloat(sourceSvgEl.getAttribute('height') ?? '200') || 200,
  };

  // Insert SVG into hidden container so the browser can measure it.
  const container = getHiddenContainer();
  container.innerHTML = svgString;
  const liveSvgEl = container.querySelector('svg') as SVGSVGElement | null;

  if (!liveSvgEl) {
    throw new Error('No <svg> element found in the uploaded file.');
  }

  // Make the hidden SVG large enough that viewBox scaling doesn't distort
  // the screen CTM in a way that causes precision issues.
  liveSvgEl.style.width = '1000px';
  liveSvgEl.style.height = '1000px';

  const SUPPORTED = 'path, polyline, polygon, line, circle, ellipse, rect';
  const elements = Array.from(liveSvgEl.querySelectorAll(SUPPORTED));

  const paths: SampledPath[] = [];

  elements.forEach((el, idx) => {
    if (!(el instanceof SVGGeometryElement)) return;

    let totalLen = 0;
    try {
      totalLen = el.getTotalLength();
    } catch {
      return; // element not measurable
    }

    if (totalLen <= 0) return;

    const pts = sampleElement(el, liveSvgEl, spacing);
    if (pts.length < 2) return;

    paths.push({
      id: el.id || `${el.tagName.toLowerCase()}-${idx}`,
      tagName: el.tagName.toLowerCase(),
      totalLength: totalLen,
      points: pts,
      enabled: true,
      ampNOverride: null,
      ampTOverride: null,
      wlNOverride: null,
      wlTOverride: null,
    });
  });

  if (paths.length === 0) {
    throw new Error(
      'No measurable geometry found. Make sure the SVG contains <path>, <polyline>, <circle>, <ellipse>, <rect>, or <line> elements.',
    );
  }

  return { paths, viewBox, raw: svgString };
}

/**
 * Re-sample an already-parsed SVG with a different spacing value.
 * This is cheaper than re-parsing but still hits the DOM.
 */
export function resampleSVG(raw: string, spacing: number): ParsedSVG {
  return parseSVG(raw, spacing);
}
