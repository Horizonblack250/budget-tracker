import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { fmt, num } from '../lib/format';

/** Amount with ₹ formatting; red with a minus sign when negative. */
export function Money({ n, className = '' }: { n: number; className?: string }) {
  return <span className={`${className} ${Math.round(n) < 0 ? 'neg' : ''}`.trim()}>{fmt(n)}</span>;
}

type NumberFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | null;
  onValue: (n: number | null) => void;
  /** When true, an empty field reports null instead of 0. */
  nullable?: boolean;
};

/** A number input that keeps what you type while focused and never goes negative. */
export function NumberField({ value, onValue, nullable, ...rest }: NumberFieldProps) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value === null ? '' : String(value));
  }, [value]);
  return (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      {...rest}
      value={text}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setText(value === null ? '' : String(value));
      }}
      onChange={(e) => {
        setText(e.target.value);
        onValue(nullable && e.target.value.trim() === '' ? null : num(e.target.value));
      }}
    />
  );
}

/** A text input that commits on every keystroke but keeps the cursor stable. */
export function TextField({ value, onValue, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onValue: (s: string) => void }) {
  return <input type="text" {...rest} value={value} onChange={(e) => onValue(e.target.value)} />;
}

/** Progress bar: value out of max. */
export function Bar({ value, max, kind = 'acc' }: { value: number; max: number; kind?: 'acc' | 'over' | 'goal' }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : value > 0 ? 100 : 0;
  return (
    <span className="track" aria-hidden>
      <span className={`fill fill-${kind}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

export function Lock({ on }: { on: boolean }) {
  return on ? (
    <span className="lock" title="Locked: never used to cover other shortfalls" aria-label="locked">
      🔒
    </span>
  ) : null;
}

export function UndoToast({ msg, onUndo, onDone, stamp }: { msg: string; onUndo?: () => void; onDone: () => void; stamp: number }) {
  useEffect(() => {
    const t = setTimeout(onDone, onUndo ? 8000 : 3000);
    return () => clearTimeout(t);
  }, [stamp, onDone, onUndo]);
  return (
    <div className="toast" role="status">
      <span>{msg}</span>
      {onUndo && (
        <button type="button" onClick={onUndo}>
          Undo
        </button>
      )}
    </div>
  );
}
