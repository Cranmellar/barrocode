// @vitest-environment jsdom
// jsdom has no SVG layout (getTotalLength), so only the sanitizer is tested here.
import { describe, expect, it } from 'vitest';
import { sanitizedSvg } from '../svgParser';

const SVG_NS = 'http://www.w3.org/2000/svg';

function unsafeTraces(svg: Element): string[] {
  return [svg, ...Array.from(svg.querySelectorAll('*'))].flatMap(el =>
    Array.from(el.attributes)
      .filter(a => /^on/i.test(a.name) || /javascript:/i.test(a.value))
      .map(a => `${el.localName}[${a.name}]`),
  );
}

describe('sanitizedSvg', () => {
  const evil = `<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100" onload="x()">
    <script>x()</script>
    <image href="x" onerror="x()"/>
    <foreignObject width="10" height="10"><img xmlns="http://www.w3.org/1999/xhtml" src="x" onerror="x()"/></foreignObject>
    <a xlink:href="javascript:x()"><path id="keep" d="M0 0 L100 100" ONCLICK="x()"/></a>
    <a href=" JavaScript:x()"><circle r="5"/></a>
    <animate attributeName="href" to="javascript:x()"/>
    <set attributeName="onclick" to="x()"/>
  </svg>`;

  it('removes scripting elements, event handlers and javascript: links', () => {
    const svg = sanitizedSvg(evil)!;
    expect(svg.querySelectorAll('script, foreignObject, animate, set')).toHaveLength(0);
    expect(unsafeTraces(svg)).toEqual([]);
  });

  it('keeps geometry, ids and safe attributes', () => {
    const svg = sanitizedSvg(evil)!;
    const path = svg.querySelector('#keep')!;
    expect(path.getAttribute('d')).toBe('M0 0 L100 100');
    expect(svg.querySelector('circle')).not.toBeNull();
    expect(svg.getAttribute('viewBox')).toBe('0 0 100 100');
    expect(svg.querySelector('image')!.getAttribute('href')).toBe('x');
  });

  it('returns a live-document SVG element, also when xmlns is missing', () => {
    const svg = sanitizedSvg('<svg viewBox="0 0 10 10"><g transform="translate(5 5)"><line x2="1"/></g></svg>')!;
    expect(svg.ownerDocument).toBe(document);
    expect(svg.namespaceURI).toBe(SVG_NS);
    expect(svg.querySelector('line')!.namespaceURI).toBe(SVG_NS);
    expect(svg.querySelector('g')!.getAttribute('transform')).toBe('translate(5 5)');
  });

  it('returns null when there is no <svg>', () => {
    expect(sanitizedSvg('<div>no svg</div>')).toBeNull();
  });
});
