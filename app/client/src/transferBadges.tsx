// Transfer callouts (div.callout[data-meno-level="transfer"], see
// app/server/markdown.ts) get a styling-only badge appended - there is no input
// widget for them client-side; they're graded by the agent in the next review
// session, not answered here.
import { useEffect, type RefObject } from 'react';

export function useTransferBadges(ref: RefObject<HTMLElement | null>, html: string): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const callouts = el.querySelectorAll<HTMLElement>('.callout[data-meno-level="transfer"]');
    callouts.forEach((c) => {
      if (c.querySelector(':scope > .transfer-badge')) return;
      const badge = document.createElement('span');
      badge.className = 'transfer-badge';
      badge.textContent = 'graded in your next review session';
      c.appendChild(badge);
    });
  }, [ref, html]);
}
