// The pure half of the wikilink seam (UI-13, UI-14): resolving a `#wiki:<path>`
// target to a real app route, and turning raw `[[target|display]]` text into
// the same anchor shape the server's markdown pipeline produces. No DOM, no
// React - the same split courseContext.ts documents (root tsconfig compiles
// app/**/*.ts without the DOM lib, so a stray browser global here fails
// typecheck instead of failing review, and `node --test` covers it directly).
// The DOM-touching half is useWikilinkNav in wikilinks.tsx.

// <domain>/<course>/modules/<module>/<lesson>.md, with the domain optional so a vault
// that predates the grouping still routes. Matching the course segment matters: a miss
// here is silent - the link still works, but falls through to the plain note route and
// the lesson loses its checks, so the regression would look like a styling quirk.
// The optional group backtracks correctly on an ungrouped path, since "modules" cannot
// then satisfy the literal /modules/ that follows.
const LESSON_PATH = /^(?:[^/]+\/)?([^/]+)\/modules\/([^/]+)\/([^/]+)\.md$/;

/** The real app route a `#wiki:<path>` target resolves to. */
export function resolveWikilinkPath(tenant: string, path: string): string {
  const lessonMatch = path.match(LESSON_PATH);
  if (lessonMatch) {
    const [, course, module, file] = lessonMatch;
    return `#/t/${encodeURIComponent(tenant)}/c/${encodeURIComponent(course)}/m/${encodeURIComponent(module)}/l/${encodeURIComponent(file)}`;
  }
  return `#/t/${encodeURIComponent(tenant)}/n/${encodeURIComponent(path)}`;
}

const WIKILINK_TEXT = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * UI-13: a todo's text carries the same `[[target|display]]` syntax the
 * markdown pipeline resolves server-side (app/server/markdown.ts), but a
 * todo never passes through that pipeline - `Todo.text` (app/shared/types.ts)
 * is the raw line from todos.md. The target here is already the resolved
 * vault path an agent wrote by hand, not a note title, so no index lookup is
 * needed: just the same `a.wikilink[href="#wiki:<path>"]` shape
 * useWikilinkNav already knows how to route and rewrite.
 */
export function wikilinkTextToHtml(text: string): string {
  WIKILINK_TEXT.lastIndex = 0;
  let out = '';
  let last = 0;
  for (const m of text.matchAll(WIKILINK_TEXT)) {
    out += escapeHtml(text.slice(last, m.index));
    const linkTarget = m[1].trim();
    const display = (m[2] ?? linkTarget).trim() || linkTarget;
    out += `<a class="wikilink" href="#wiki:${escapeHtml(linkTarget)}">${escapeHtml(display)}</a>`;
    last = m.index! + m[0].length;
  }
  out += escapeHtml(text.slice(last));
  return out;
}
