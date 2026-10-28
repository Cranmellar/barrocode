import { useState, useEffect, useRef } from 'react';

interface Props {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  // Step with Shift held (wheel and label drag). Defaults to step / 10.
  fineStep?: number;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}

// Pixels of horizontal drag on the label per step.
const SCRUB_PX = 6;

function decimalsOf(n: number): number {
  return String(n).split('.')[1]?.length ?? 0;
}

// The field keeps the step's decimals (at most 2), so a wheel or drag that
// goes 2.5 → 3 → 3.5 doesn't change the text's width.
function format(v: number, step: number | undefined): string {
  return v.toFixed(Math.min(2, Math.max(decimalsOf(step ?? 1), decimalsOf(parseFloat(v.toFixed(2))))));
}

/**
 * Number input with these behaviours:
 *
 * 1. Local raw-string state so the user can freely erase digits, type a
 *    leading minus, or write "1." without the field snapping back.
 *    The parent receives a new value only when the text parses to a valid
 *    finite number; on blur the display resets to whatever the parent holds.
 *
 * 2. Wheel to change by `step`, or `fineStep` with Shift, without scrolling
 *    the panel. The field shows the new value even while it has focus.
 *
 * 3. Dragging the row's label left or right changes the value the same way.
 *
 * Wheel and drag changes show the amount added next to the field.
 */
export function NumInput({ value, min, max, step, fineStep, className, placeholder, disabled, onChange }: Props) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const valRef    = useRef(value);
  const focusedRef = useRef(false);
  valRef.current  = value;

  // ── Local display state ────────────────────────────────────────────────────
  const [raw, setRaw] = useState(() => format(value, step));
  const [delta, setDelta] = useState<{ n: number; text: string; left: number; top: number } | null>(null);

  // Sync display from parent — but only when the user is NOT actively editing
  useEffect(() => {
    if (!focusedRef.current) setRaw(format(value, step));
  }, [value, step]);

  // Latest props for the native listeners, which are attached once.
  const propsRef = useRef({ min, max, step, fineStep, onChange });
  propsRef.current = { min, max, step, fineStep, onChange };

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    // Moves the value by `steps` steps from `base`; returns whether it changed.
    function nudge(base: number, steps: number, fine: boolean) {
      const { min, max, step, fineStep, onChange } = propsRef.current;
      const s    = step ?? 1;
      const inc  = fine ? fineStep ?? s / 10 : s;
      let next   = base + steps * inc;
      if (min !== undefined) next = Math.max(min, next);
      if (max !== undefined) next = Math.min(max, next);
      const out  = parseFloat(next.toFixed(decimalsOf(inc) + 2));
      const prev = valRef.current;
      if (out === prev) return;
      onChange(out);
      setRaw(format(out, s));
      const d = parseFloat((out - prev).toFixed(decimalsOf(inc) + 2));
      setDelta(g => ({
        n: (g?.n ?? 0) + 1,
        text: `${d > 0 ? '+' : '−'}${Math.abs(d)}`,
        left: el!.offsetLeft,
        top: el!.offsetTop + el!.offsetHeight / 2,
      }));
    }

    function onWheel(e: WheelEvent) {
      // :disabled also covers a disabled ancestor <fieldset>.
      if (el!.matches(':disabled')) return;
      e.preventDefault();
      e.stopPropagation();
      // With Shift some systems report the wheel on the horizontal axis.
      const dy = e.deltaY || e.deltaX;
      if (dy) nudge(valRef.current, dy < 0 ? 1 : -1, e.shiftKey);
    }
    el.addEventListener('wheel', onWheel, { passive: false });

    const label = el.closest('.param-row, .kf-field')?.querySelector('label');
    let scrub: { x: number; base: number; moved: boolean } | null = null;
    function onDown(e: PointerEvent) {
      if (e.button !== 0 || el!.matches(':disabled')) return;
      scrub = { x: e.clientX, base: valRef.current, moved: false };
      label!.setPointerCapture(e.pointerId);
    }
    function onMove(e: PointerEvent) {
      if (!scrub) return;
      const dx = e.clientX - scrub.x;
      if (!scrub.moved && Math.abs(dx) < 3) return;
      if (!scrub.moved) {
        scrub.moved = true;
        label!.classList.add('num-scrub--on');
      }
      nudge(scrub.base, Math.round(dx / SCRUB_PX), e.shiftKey);
    }
    function onUp() {
      scrub = null;
      label!.classList.remove('num-scrub--on');
    }
    if (label) {
      label.classList.add('num-scrub');
      label.addEventListener('pointerdown', onDown);
      label.addEventListener('pointermove', onMove);
      label.addEventListener('pointerup', onUp);
      label.addEventListener('pointercancel', onUp);
    }

    return () => {
      el.removeEventListener('wheel', onWheel);
      if (label) {
        label.classList.remove('num-scrub', 'num-scrub--on');
        label.removeEventListener('pointerdown', onDown);
        label.removeEventListener('pointermove', onMove);
        label.removeEventListener('pointerup', onUp);
        label.removeEventListener('pointercancel', onUp);
      }
    };
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {delta && (
        // A new key per step remounts the span, which restarts its animation.
        <span key={delta.n} className="num-delta" aria-hidden="true"
          style={{ left: delta.left, top: delta.top }}>{delta.text}</span>
      )}
      <input
        ref={inputRef}
        type="number"
        value={raw}
        min={min}
        max={max}
        step={step ?? 'any'}
        className={className}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => { focusedRef.current = true; }}
        onBlur={() => {
          focusedRef.current = false;
          // Snap display back to the last committed value on exit
          setRaw(format(value, step));
        }}
        onChange={e => {
          const text = e.target.value;
          setRaw(text);                        // always update display
          const v = parseFloat(text);
          if (!isFinite(v)) return;            // empty / "-" / "1." — wait for more input
          let clamped = v;
          if (min !== undefined) clamped = Math.max(min, clamped);
          if (max !== undefined) clamped = Math.min(max, clamped);
          onChange(clamped);
        }}
      />
    </>
  );
}
