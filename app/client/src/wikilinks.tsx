// Rendered lesson/note/hub HTML contains `<a class="wikilink" href="#wiki:<path>">`
// (see app/server/markdown.ts). That hash isn't one of our app routes, so a plain
// click would land on useRoute's not-found branch. `span.wikilink.broken` (no
// href) needs no handling; it's just muted by CSS. The pure route/HTML logic
// lives in wikilinkText.ts; this file is only the DOM-touching half.
import { useEffect, type RefObject } from 'react';
import { navigate } from './router';
import { resolveWikilinkPath } from './wikilinkText.ts';

export { wikilinkTextToHtml } from './wikilinkText.ts';

/**
 * UI-14: rewrites every `#wiki:<path>` href in the container to the real app
 * route it resolves to, so the browser's own new-tab, new-window and
 * back/forward handling works with no JS at all - cmd-click, middle-click and
 * shift-click all follow the anchor's real href. The click listener below
 * then only has to cover the plain-click case, where it is an optimisation
 * (an in-page hash update via the router) rather than the only path a click
 * can take.
 *
 * `html` is an explicit dependency, distinct from `ref`, because the same DOM
 * node is reused across renders that swap `dangerouslySetInnerHTML` (see
 * RenderedHtml) - without it, a later render's freshly-inserted `#wiki:`
 * hrefs would never get rewritten.
 */
export function useWikilinkNav(ref: RefObject<HTMLElement | null>, tenant: string, html?: string): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.querySelectorAll<HTMLAnchorElement>('a.wikilink[href^="#wiki:"]').forEach((anchor) => {
      const path = anchor.getAttribute('href')!.slice('#wiki:'.length);
      anchor.setAttribute('href', resolveWikilinkPath(tenant, path));
    });
    const onClick = (e: MouseEvent): void => {
      // Any modifier or non-primary button means the browser's own handling
      // is wanted (new tab, new window, or nothing at all) - defer to the
      // real href set above instead of forcing same-window navigation.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a.wikilink');
      if (!anchor || !el.contains(anchor)) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href.startsWith('#/')) return; // broken wikilinks (href="#") and anything not ours
      e.preventDefault();
      navigate(href);
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [ref, tenant, html]);
}
