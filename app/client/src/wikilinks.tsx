// Rendered lesson/note/hub HTML contains `<a class="wikilink" href="#wiki:<path>">`
// (see app/server/markdown.ts). That hash isn't one of our app routes, so a plain
// click would land on useRoute's not-found branch - we intercept clicks inside the
// rendered container instead and compute the real app route from the vault path.
// `span.wikilink.broken` (no href) needs no handling; it's just muted by CSS.
import { useEffect, type RefObject } from 'react';
import { navigate } from './router';

const LESSON_PATH = /^([^/]+)\/modules\/([^/]+)\/([^/]+)\.md$/;

export function useWikilinkNav(ref: RefObject<HTMLElement | null>, tenant: string): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClick = (e: MouseEvent): void => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a.wikilink');
      if (!anchor || !el.contains(anchor)) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href.startsWith('#wiki:')) return;
      e.preventDefault();
      const path = href.slice('#wiki:'.length);
      const lessonMatch = path.match(LESSON_PATH);
      if (lessonMatch) {
        const [, course, module, file] = lessonMatch;
        navigate(
          `#/t/${encodeURIComponent(tenant)}/c/${encodeURIComponent(course)}/m/${encodeURIComponent(module)}/l/${encodeURIComponent(file)}`,
        );
      } else {
        navigate(`#/t/${encodeURIComponent(tenant)}/n/${encodeURIComponent(path)}`);
      }
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [ref, tenant]);
}
