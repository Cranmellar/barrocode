// Native `title` tooltips can't be styled, but Chromium, Firefox and Safari
// all break lines at "\n". Wrapping the text ourselves gives a block instead
// of one long line. The system tooltip font is ≈ 11–12 px (Segoe UI 9 pt on
// Windows, the macOS tooltip font at 11 pt), ≈ 13 px on Linux desktops, so 46
// characters is ≈ 260–320 px: a comfortable measure for small text, and well
// under the width at which any of the three browsers wraps on its own.
export const HINT_MEASURE = 46;

// Split on plain spaces only, so a no-break space ( ) keeps "0° =" or
// "λT ÷ 6,3" on one line. A one-letter word ("y", "a", "o") goes with
// the next word rather than ending a line.
function tokens(paragraph: string): string[] {
  const out: string[] = [];
  let pending = '';
  for (const w of paragraph.split(' ')) {
    if (!w) continue;
    const t = pending ? `${pending} ${w}` : w;
    if (w.length === 1 && /\p{L}/u.test(w)) pending = t;
    else { out.push(t); pending = ''; }
  }
  if (pending) {
    if (out.length) out[out.length - 1] += ` ${pending}`;
    else out.push(pending);
  }
  return out;
}

function greedy(words: string[], width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line && line.length + 1 + w.length > width) { lines.push(line); line = w; }
    else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines;
}

// Keeps the line count greedy wrapping gives at `measure`, at the narrowest
// width that still fits it, so the lines come out about even in length.
function wrapParagraph(paragraph: string, measure: number): string {
  const words = tokens(paragraph);
  const n = greedy(words, measure).length;
  if (n <= 1) return words.join(' ');
  const total = words.reduce((s, w) => s + w.length, 0) + words.length - 1;
  for (let w = Math.ceil(total / n); w < measure; w++) {
    const lines = greedy(words, w);
    if (lines.length <= n) return lines.join('\n');
  }
  return greedy(words, measure).join('\n');
}

export function wrapHint(text: string, measure?: number): string;
export function wrapHint(text: string | undefined, measure?: number): string | undefined;
export function wrapHint(text: string | undefined, measure = HINT_MEASURE): string | undefined {
  if (!text) return text;
  return text.split('\n').map(p => wrapParagraph(p, measure)).join('\n');
}
