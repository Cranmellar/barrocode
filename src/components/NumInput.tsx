import { useEffect, useRef } from 'react';

interface Props {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  placeholder?: string;
  onChange: (v: number) => void;
}

/**
 * Number input that intercepts scroll events to change value in-place,
 * preventing the event from bubbling up and scrolling the parent panel.
 */
export function NumInput({ value, min, max, step, className, placeholder, onChange }: Props) {
  const ref   = useRef<HTMLInputElement>(null);
  const valRef = useRef(value);
  valRef.current = value;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      e.stopPropagation();
      const s   = step ?? 1;
      let next  = valRef.current + (e.deltaY < 0 ? s : -s);
      if (min !== undefined) next = Math.max(min, next);
      if (max !== undefined) next = Math.min(max, next);
      // Trim floating-point noise
      const dec = String(s).includes('.') ? String(s).split('.')[1].length : 0;
      onChange(parseFloat(next.toFixed(dec + 2)));
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [step, min, max, onChange]);

  return (
    <input
      ref={ref}
      type="number"
      value={value}
      min={min}
      max={max}
      step={step ?? 'any'}
      className={className}
      placeholder={placeholder}
      onChange={e => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) onChange(v);
      }}
    />
  );
}
