// Mounts one small note button beside every depth-2 lesson heading, into raw
// dangerouslySetInnerHTML content. Unlike checkMounts.tsx's interactive
// checks, this does NOT mount a separate react-dom render tree per mount
// point: synchronously tearing one of those down mid-render, once per
// heading, logged "Attempted to synchronously unmount a root while React was
// already rendering" eleven times on a single lesson page load, verified in
// a clean browser. These buttons live outside React's tree by design, so
// they are built and torn down as plain DOM instead: one effect keyed on the
// `html` string (a genuine markup change replaces every heading, buttons and
// all), and no touch to RenderedHtml's memoized dangerouslySetInnerHTML
// object.
//
// `whole-lesson` never has a heading (docs/specs/notes.md), so it is skipped
// here; the panel offers it as the default section with zero clicks.
import { useEffect, type RefObject } from 'react';
import type { LessonSection } from '../../shared/types.ts';

export function useSectionNoteButtons(
  ref: RefObject<HTMLElement | null>,
  sections: LessonSection[] | undefined,
  onOpenSection: (sectionKey: string) => void,
  html?: string,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !sections || sections.length === 0) return;
    const mounts: HTMLElement[] = [];
    for (const section of sections) {
      if (section.key === 'whole-lesson') continue;
      // Headings carry `data-meno-section` (app/server/markdown.ts's
      // post-sanitize id pass); this queries by that attribute rather than
      // by the heading's own id, per docs/specs/notes.md's rule for this
      // feature's client code.
      const heading = el.querySelector<HTMLElement>(`[data-meno-section="${CSS.escape(section.key)}"]`);
      if (!heading) continue;
      const mount = document.createElement('span');
      mount.className = 'section-note-button-mount';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'section-note-button';
      button.setAttribute('aria-label', `Notes: ${section.title}`);
      const icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '✎';
      button.appendChild(icon);
      button.addEventListener('click', () => onOpenSection(section.key));
      mount.appendChild(button);
      heading.appendChild(mount);
      mounts.push(mount);
    }
    return () => {
      mounts.forEach((m) => m.remove());
    };
    // `html`, for the same reason useCheckMounts takes it: RenderedHtml keeps
    // one DOM node across renders and swaps its innerHTML, so when the
    // markup genuinely changes every heading is replaced by a fresh one
    // while `sections` may keep the same identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, sections, onOpenSection, html]);
}
