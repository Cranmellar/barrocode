import { useState, useEffect, useRef } from 'react';

interface Props {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}

/**
 * Number input with two key behaviours:
 *
 * 1. Local raw-string state so the user can freely erase digits, type a
 *    leading minus, or write "1." without the field snapping back.
 *    The parent receives a new value only when the text parses to a valid
 *    finite number; on blur the display resets to whatever the parent holds.
 *
 * 2. Scroll-to-change: wheel events increment / decrement by `step` without
 *    propagating to the parent panel scroll.
 */
export function NumInput({ value, min, max, step, className, placeholder, disabled, onChange }: Props) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const valRef    = useRef(value);
  const focusedRef = useRef(false);
  valRef.current  = value;

  // ── Local display state ────────────────────────────────────────────────────
  const [raw, setRaw] = useState(() => String(value));

  // Sync display from parent — but only when the user is NOT actively editing
  useEffect(() => {
    if (!focusedRef.current) setRaw(String(value));
  }, [value]);

  // ── Scroll handler ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      e.stopPropagation();
      const s    = step ?? 1;
      let next   = valRef.current + (e.deltaY < 0 ? s : -s);
      if (min !== undefined) next = Math.max(min, next);
      if (max !== undefined) next = Math.min(max, next);
      const dec  = String(s).includes('.') ? String(s).split('.')[1].length : 0;
      const out  = parseFloat(next.toFixed(dec + 2));
      onChange(out);
      if (!focusedRef.current) setRaw(String(out));
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [step, min, max, onChange]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
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
        setRaw(String(value));
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
  );
}
