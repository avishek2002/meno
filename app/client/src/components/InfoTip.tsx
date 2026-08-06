// A small "what is this?" affordance next to a label. Deliberately a disclosure
// button rather than a hover-only tooltip: hover-only would be unreachable by
// keyboard and on touch, and this app is read on both.
//
// Opens on hover, on keyboard focus, or on click (click pins it open so the
// pointer can leave). Escape closes and returns focus to the trigger.
//
// Positioned `fixed` from the trigger's bounding rect on purpose: tables in
// this app are `display: block; overflow-x: auto`, so an absolutely positioned
// popover inside a table header would be clipped by the scroll container.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { GLOSSARY, type GlossaryKey } from '../guide/glossary';

const MARGIN = 8;
const WIDTH = 280;

export function InfoTip({ entry }: { entry: GlossaryKey }) {
  const { term, body } = GLOSSARY[entry];
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [pinned, setPinned] = useState(false);
  const [transient, setTransient] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const open = pinned || transient;

  const place = useCallback((): void => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.min(Math.max(MARGIN, r.left + r.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - MARGIN);
    setPos({ top: r.bottom + 6, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = (): void => place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, place]);

  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setPinned(false);
        setTransient(false);
        triggerRef.current?.focus();
      }
    };
    const onDown = (e: MouseEvent): void => {
      if (!triggerRef.current?.contains(e.target as Node)) setPinned(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [pinned]);

  return (
    <span className="infotip">
      <button
        ref={triggerRef}
        type="button"
        className="infotip-trigger"
        aria-label={`What is "${term}"?`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setPinned((p) => !p)}
        onMouseEnter={() => setTransient(true)}
        onMouseLeave={() => setTransient(false)}
        onFocus={() => setTransient(true)}
        onBlur={() => setTransient(false)}
      >
        <span aria-hidden="true">i</span>
      </button>
      {open && pos && (
        <span id={id} role="note" className="infotip-bubble" style={{ top: pos.top, left: pos.left, width: WIDTH }}>
          <strong className="infotip-term">{term}</strong>
          {body}
        </span>
      )}
    </span>
  );
}
