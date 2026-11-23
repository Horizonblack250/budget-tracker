import { useEffect, useRef, type ReactNode } from 'react';
import type { Source } from '../lib/calc';
import { fmt } from '../lib/format';

/** A popup: a bottom sheet on phones, a centred dialog on wider screens. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="sheethead">
          <h2>{title}</h2>
          <button type="button" className="icon" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Tappable choice of where money comes from / goes to, showing each balance. */
export function PotPicker({ groups, value, onChange, label }: { groups: [string, Source[]][]; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <fieldset className="potpicker">
      <legend>{label}</legend>
      {groups.map(([g, list]) =>
        list.length ? (
          <div key={g}>
            <div className="grouplabel">{g}</div>
            <div className="chips">
              {list.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`chip ${value === s.id ? 'on' : ''}`}
                  aria-pressed={value === s.id}
                  onClick={() => onChange(s.id)}
                >
                  <span className="chipname">
                    {s.name}
                    {s.locked && ' 🔒'}
                  </span>
                  <span className={`chipamt ${Math.round(s.available) < 0 ? 'neg' : ''}`}>{fmt(s.available)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null,
      )}
    </fieldset>
  );
}
