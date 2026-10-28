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

const PARAMS_PER_COMMAND: Record<string, number> = {
  m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0,
};

/**
 * Split path data into one string per subpath (each `M`/`m`), each starting
 * with an absolute moveto. getPointAtLength runs straight across the gap
 * between subpaths, so a contour with a hole would print a bead joining
 * both. Returns [d] unchanged when there is a single subpath.
 */
export function splitSubpaths(d: string): string[] {
  const starts: { at: number; x: number; y: number; rest: number; implicitRel: boolean }[] = [];
  let x = 0, y = 0, sx = 0, sy = 0;
  let i = 0;
  const skip = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const num = () => {
    skip();
    const m = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(d.slice(i));
    if (!m) return null;
    i += m[0].length;
    return parseFloat(m[0]);
  };
  // Arc flags may be written without separators ("a5 5 0 0110 10").
  const flag = () => { skip(); return d[i] === '0' || d[i] === '1' ? +d[i++] : null; };

  let cmd = '';
  while (true) {
    skip();
    if (i >= d.length) break;
    if (/[a-zA-Z]/.test(d[i])) {
      cmd = d[i++];
    } else if (!cmd) {
      return [d];
    }
    const lc = cmd.toLowerCase();
    const rel = cmd === lc;
    const at = i - 1;
    if (lc === 'z') { x = sx; y = sy; cmd = ''; continue; }
    const n = PARAMS_PER_COMMAND[lc];
    if (n === undefined) return [d];
    let first = true;
    // A command letter may be followed by several parameter groups.
    while (true) {
      skip();
      if (i >= d.length || /[a-zA-Z]/.test(d[i])) break;
      const vals: number[] = [];
      for (let k = 0; k < n; k++) {
        const v = lc === 'a' && (k === 3 || k === 4) ? flag() : num();
        if (v === null) return [d];
        vals.push(v);
      }
      const ox = rel ? x : 0, oy = rel ? y : 0;
      if (lc === 'h') x = ox + vals[0];
      else if (lc === 'v') y = oy + vals[0];
      else { x = ox + vals[n - 2]; y = oy + vals[n - 1]; }
      if (lc === 'm' && first) {
        sx = x; sy = y;
        starts.push({ at, x, y, rest: i, implicitRel: rel });
      }
      first = false;
    }
  }
  if (starts.length <= 1) return [d];
  return starts.map((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1].at : d.length;
    const rest = d.slice(s.rest, end).trim();
    // Extra pairs after a moveto are linetos, relative after `m`.
    const lead = rest && !/^[a-zA-Z]/.test(rest) ? (s.implicitRel ? 'l' : 'L') : '';
    return `M${s.x} ${s.y}${lead ? ` ${lead}` : ''} ${rest}`.trim();
  });
}

const MM_PER_UNIT: Record<string, number> = {
  mm: 1, cm: 10, q: 0.25, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6,
};

/** A root width/height in mm, or null when it has no physical unit (unitless, px, %). */
function lengthMM(attr: string | null): number | null {
  const m = attr?.trim().match(/^([\d.]+(?:e[+-]?\d+)?)\s*(mm|cm|q|in|pt|pc)$/i);
  return m ? parseFloat(m[1]) * MM_PER_UNIT[m[2].toLowerCase()] : null;
}

/** A root width/height in user units (CSS px), as used when there is no viewBox. */
function lengthPx(attr: string | null): number {
  const mm = lengthMM(attr);
  if (mm !== null) return mm * 96 / 25.4;
  const v = parseFloat(attr ?? '');
  return v > 0 && !attr!.trim().endsWith('%') ? v : 200;
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
/**
 * Replace HTML named entities that are not valid in XML (only &lt; &gt; &amp; &quot; &apos;
 * are allowed by the XML spec) with their numeric equivalents so the strict
 * DOMParser('image/svg+xml') does not choke on them.
 */
function sanitizeXmlEntities(svg: string): string {
  // Map of common HTML entities → numeric character references
  const htmlEntities: Record<string, string> = {
    nbsp: '&#160;', middot: '&#183;', mdash: '&#8212;', ndash: '&#8211;',
    laquo: '&#171;', raquo: '&#187;', copy: '&#169;', reg: '&#174;',
    trade: '&#8482;', euro: '&#8364;', pound: '&#163;', yen: '&#165;',
    cent: '&#162;', deg: '&#176;', plusmn: '&#177;', times: '&#215;',
    divide: '&#247;', frac12: '&#189;', frac14: '&#188;', frac34: '&#190;',
    hellip: '&#8230;', lsquo: '&#8216;', rsquo: '&#8217;', ldquo: '&#8220;',
    rdquo: '&#8221;', bull: '&#8226;', rarr: '&#8594;', larr: '&#8592;',
    uarr: '&#8593;', darr: '&#8595;', infin: '&#8734;', alpha: '&#945;',
    beta: '&#946;', pi: '&#960;', sigma: '&#963;', mu: '&#956;',
  };
  return svg.replace(/&([a-zA-Z]+);/g, (match, name) => {
    return htmlEntities[name] ?? match;
  });
}

/**
 * Remove what could run code once the SVG is in the page: scripts, embedded
 * HTML, event-handler attributes and javascript: links. Shared files are
 * untrusted.
 */
function stripActiveContent(doc: Document): void {
  doc.querySelectorAll('script, foreignObject').forEach(el => el.remove());
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const isLink = attr.localName === 'href' && /^\s*javascript:/i.test(attr.value);
      if (attr.name.toLowerCase().startsWith('on') || isLink) el.removeAttributeNode(attr);
    }
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// Geometry under these is only referenced (clip shapes, symbols), never drawn.
const NON_RENDERED = 'defs, clipPath, mask, symbol, marker, pattern';

/**
 * Whether the element is drawn: not inside a reference-only container and
 * not hidden by display:none on itself or an ancestor (e.g. a hidden
 * Inkscape layer). visibility can't be checked: the measuring container is
 * visibility:hidden.
 */
function isRendered(el: Element, root: Element): boolean {
  if (el.closest(NON_RENDERED)) return false;
  for (let n: Element | null = el; n && n !== root.parentElement; n = n.parentElement) {
    if (getComputedStyle(n).display === 'none') return false;
  }
  return true;
}

function parseXML(svgString: string): Document {
  const parser = new DOMParser();
  const xml = sanitizeXmlEntities(svgString);
  const doc = parser.parseFromString(xml, 'image/svg+xml');
  // SVG copied out of an HTML page often has no xmlns: HTML accepts that,
  // but as XML its elements land in no namespace and can't be measured.
  const root = doc.documentElement;
  if (root.localName === 'svg' && !root.namespaceURI) {
    return parser.parseFromString(xml.replace(/<svg\b/, `<svg xmlns="${SVG_NS}"`), 'image/svg+xml');
  }
  return doc;
}

export function parseSVG(svgString: string, spacing: number): ParsedSVG {
  const doc = parseXML(svgString);

  // Detect parser errors (malformed XML).
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`El archivo no es un SVG válido: ${parseError.textContent?.slice(0, 200)}`);
  }

  const sourceSvgEl = doc.documentElement;
  const vb = (sourceSvgEl.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const hasViewBox = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0;
  const viewBox = hasViewBox
    ? { x: vb[0], y: vb[1], width: vb[2], height: vb[3] }
    : {
      x: 0, y: 0,
      width: lengthPx(sourceSvgEl.getAttribute('width')),
      height: lengthPx(sourceSvgEl.getAttribute('height')),
    };

  // mm per user unit, when the root states its size in a physical unit.
  const widthMM = lengthMM(sourceSvgEl.getAttribute('width'));
  const heightMM = lengthMM(sourceSvgEl.getAttribute('height'));
  const mmPerUnit = widthMM !== null ? +(widthMM / viewBox.width).toFixed(4)
    : heightMM !== null ? +(heightMM / viewBox.height).toFixed(4)
    : null;

  // Insert SVG into hidden container so the browser can measure it.
  stripActiveContent(doc);
  const container = getHiddenContainer();
  container.replaceChildren(document.importNode(sourceSvgEl, true));
  const liveSvgEl = container.querySelector('svg') as SVGSVGElement | null;

  if (!liveSvgEl) {
    throw new Error('El archivo no contiene un elemento <svg>.');
  }

  // Make the hidden SVG large enough that viewBox scaling doesn't distort
  // the screen CTM in a way that causes precision issues.
  liveSvgEl.style.width = '1000px';
  liveSvgEl.style.height = '1000px';

  const SUPPORTED = 'path, polyline, polygon, line, circle, ellipse, rect';
  const elements = Array.from(liveSvgEl.querySelectorAll(SUPPORTED));

  const paths: SampledPath[] = [];

  elements.forEach((el, idx) => {
    if (!(el instanceof SVGGeometryElement) || !isRendered(el, liveSvgEl)) return;

    let totalLen = 0;
    try {
      totalLen = el.getTotalLength();
    } catch {
      return; // element not measurable
    }

    if (totalLen <= 0) return;

    const id = el.id || `${el.tagName.toLowerCase()}-${idx}`;
    const subpaths = el instanceof SVGPathElement ? splitSubpaths(el.getAttribute('d') ?? '') : [];
    // Each subpath is measured on a copy in the same place in the tree, so
    // it keeps the original's transforms.
    const parts: { el: SVGGeometryElement; id: string }[] = subpaths.length > 1
      ? subpaths.map((d, k) => {
        const part = el.cloneNode(false) as SVGPathElement;
        part.removeAttribute('id');
        part.setAttribute('d', d);
        el.after(part);
        return { el: part, id: `${id}-${k + 1}` };
      })
      : [{ el, id }];

    for (const part of parts) {
      const len = part.el.getTotalLength();
      const pts = len > 0 ? sampleElement(part.el, liveSvgEl, spacing) : [];
      if (part.el !== el) part.el.remove();
      if (pts.length < 2) continue;
      for (const p of pts) { p.x -= viewBox.x; p.y -= viewBox.y; }

      paths.push({
        id: part.id,
        tagName: el.tagName.toLowerCase(),
        totalLength: len,
        points: pts,
        enabled: true,
        ampNOverride: null,
        ampTOverride: null,
        wlNOverride: null,
        wlTOverride: null,
      });
    }
  });

  if (paths.length === 0) {
    throw new Error(
      'No se encontró geometría medible. El SVG debe contener elementos <path>, <polyline>, <polygon>, <line>, <circle>, <ellipse> o <rect> visibles.',
    );
  }

  return { paths, viewBox, mmPerUnit, raw: svgString };
}

