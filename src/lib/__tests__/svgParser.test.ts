import { describe, expect, it } from 'vitest';
import { splitSubpaths } from '../svgParser';

describe('splitSubpaths', () => {
  it('leaves a single subpath untouched', () => {
    const d = 'M10 10 h20 v20 h-20 z';
    expect(splitSubpaths(d)).toEqual([d]);
  });

  it('starts every subpath with an absolute moveto', () => {
    // A square with a square hole, the hole written relative to the closed outline.
    expect(splitSubpaths('M10 10 h20 v20 h-20 z m5 5 h10 v10 h-10 z')).toEqual([
      'M10 10 h20 v20 h-20 z',
      'M15 15 h10 v10 h-10 z',
    ]);
  });

  it('keeps the linetos that follow a moveto, relative or absolute', () => {
    expect(splitSubpaths('m0 0 10 0 0 10z m20 0 5 5')).toEqual(['M0 0 l 10 0 0 10z', 'M20 0 l 5 5']);
    expect(splitSubpaths('M0 0 10 0M5 5 6 6')).toEqual(['M0 0 L 10 0', 'M5 5 L 6 6']);
  });

  it('tracks the current point through every command', () => {
    expect(splitSubpaths('M1 1h4v4m1 1h1')[1]).toBe('M6 6 h1');
    expect(splitSubpaths('M0 0c1 1 2 2 3 3s1 1 2 2q1 1 2 2t1 1m1 0h1')[1]).toBe('M9 8 h1');
    expect(splitSubpaths('M0 0l1.5.5m1-2h1')[1]).toBe('M2.5 -1.5 h1');
  });

  it('reads arc flags written without separators', () => {
    expect(splitSubpaths('M0 0a5 5 0 0110 0m3 0h1')[1]).toBe('M13 0 h1');
  });

  it('returns malformed data unchanged', () => {
    expect(splitSubpaths('M0 0 L 5')).toEqual(['M0 0 L 5']);
  });
});
