import { describe, expect, it } from 'vitest';
import { HINT_MEASURE, wrapHint } from '../wrapHint';

const LONG = 'Desplazamiento máximo vertical. La primera capa no baja de su altura y cada punto queda al menos media capa sobre la capa anterior; con amplitudes grandes los valles se aplanan.';

describe('wrapHint', () => {
  it('leaves short text and empty values alone', () => {
    expect(wrapHint('Máximo 500 capas')).toBe('Máximo 500 capas');
    expect(wrapHint(undefined)).toBeUndefined();
    expect(wrapHint('')).toBe('');
  });

  it('keeps every line within the measure and every word in order', () => {
    const out = wrapHint(LONG);
    const lines = out.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(HINT_MEASURE);
    expect(lines.join(' ')).toBe(LONG);
  });

  it('evens out the lines', () => {
    const lines = wrapHint(LONG).split('\n');
    const lengths = lines.map(l => l.length);
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThanOrEqual(12);
  });

  it('never ends a line on a one-letter word', () => {
    const text = 'Una prueba con a y o repartidas: corta y larga, e incluso u entre palabras de largo variable a lo largo';
    for (const measure of [12, 16, 20, 24, 30]) {
      for (const l of wrapHint(text, measure).split('\n')) expect(l).not.toMatch(/(^|\s)\p{L}$/u);
    }
  });

  it('does not break at a no-break space', () => {
    const text = 'Con T mayor que λT ÷ 6,3 la boquilla retrocede sobre su propio cordón';
    for (const measure of [10, 14, 20, 26]) {
      expect(wrapHint(text, measure).split('\n').some(l => l.includes('λT ÷ 6,3'))).toBe(true);
    }
  });

  it('wraps each paragraph on its own and keeps blank lines', () => {
    const out = wrapHint(`${LONG}\n\n0 = desactivado`);
    const parts = out.split('\n\n');
    expect(parts).toHaveLength(2);
    expect(parts[1]).toBe('0 = desactivado');
  });

  it('puts a word longer than the measure on its own line', () => {
    const out = wrapHint('corto supercalifragilisticoespialidoso corto', 10);
    expect(out.split('\n')).toContain('supercalifragilisticoespialidoso');
  });
});
