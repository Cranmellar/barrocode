// Canvas can't read CSS variables, so the tokens in index.css are copied here
// once at startup (loadPalette). The defaults mirror them for tests (no DOM).
export const palette = {
  bg:      '#F1F1F3',
  surface: '#FFFFFF',
  ink:     '#38383E',
  ink2:    '#55555D',
  muted:   '#71717A',
  border:  '#E4E4E7',
  signal:  '#FF5A1F',
  nAxis:   '#404DD8',
  tAxis:   '#C33CAE',
  err:     '#DC2626',
  ok:      '#15803D',
};

const TOKENS: Record<keyof typeof palette, string> = {
  bg: '--bg', surface: '--surface', ink: '--ink', ink2: '--ink-2', muted: '--muted',
  border: '--border', signal: '--signal', nAxis: '--n-axis', tAxis: '--t-axis',
  err: '--err', ok: '--ok',
};

export function loadPalette() {
  const style = getComputedStyle(document.documentElement);
  for (const key of Object.keys(TOKENS) as (keyof typeof palette)[]) {
    const v = style.getPropertyValue(TOKENS[key]).trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) palette[key] = v;
  }
}

export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function oklchToRgb(L: number, C: number, hDeg: number): [number, number, number] {
  const h = hDeg * Math.PI / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const gamma = (x: number) => {
    x = Math.min(1, Math.max(0, x));
    return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
  };
  return [
    gamma( 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}

// Layer ramp: electric indigo → magenta → --signal, interpolated in OKLCH so
// lightness climbs evenly and the hue never passes through green or yellow.
// The end point is --signal (#FF5A1F) in OKLCH.
const RAMP_FROM = { L: 0.50, C: 0.21, h: 272 };
const RAMP_TO   = { L: 0.682, C: 0.211, h: 37.7 + 360 };

export function rampColor(t: number, alpha = 1, lightness?: number, chroma?: number): string {
  const L = lightness ?? RAMP_FROM.L + (RAMP_TO.L - RAMP_FROM.L) * t;
  const C = chroma ?? RAMP_FROM.C + (RAMP_TO.C - RAMP_FROM.C) * t;
  const [r, g, b] = oklchToRgb(L, C, (RAMP_FROM.h + (RAMP_TO.h - RAMP_FROM.h) * t) % 360);
  return alpha === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}
