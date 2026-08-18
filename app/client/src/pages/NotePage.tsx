// #/t/:tenant/n/:path - any vault note reached via a wikilink that isn't a
// lesson file (home, hub, profile, etc).
//
// The <h1> stays the vault path, deliberately, even though the note body
// renders its own `# heading` below it (RenderedHtml.html is the note's
// markdown as-is) - two <h1>s on one page. The path is what disambiguates a
// note from every other note that could share a heading text, and demoting
// it to a muted strip or a <nav> would lose that as the page's identity, not
// just its decoration. Only the segments the server confirms resolve to a
// real route (noteBreadcrumb.ts) become links; the rest render as plain
// text, visually distinguished from a link by more than color alone (see
// .note-breadcrumb-plain in styles.css) so the reader can tell what is
// clickable before clicking.
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { RenderedHtml } from '../components/RenderedHtml';
import { noteBreadcrumb } from '../notePath.ts';
import type { NoteResponse } from '../../../shared/types.ts';

export function NotePage({ tenant, path }: { tenant: string; path: string }) {
  const { data, error, loading, revalidate } = useResource<NoteResponse>(
    `/api/v1/${encodeURIComponent(tenant)}/note?path=${encodeURIComponent(path)}`,
  );
  useRegisterRevalidate(revalidate);

  if (loading && !data) return <p className="status-line">Loading note...</p>;
  if (error) return <p className="status-line status-error">Could not load note: {error}</p>;
  if (!data) return null;

  const segments = noteBreadcrumb({ tenant, path: data.path, course: data.course, domain: data.domain });

  return (
    <article className="note-page">
      <h1 className="note-breadcrumb">
        {segments.map((seg, i) => (
          <span key={i}>
            {i > 0 && (
              <span className="note-breadcrumb-sep" aria-hidden="true">
                /
              </span>
            )}
            {seg.href ? <a href={seg.href}>{seg.text}</a> : <span className="note-breadcrumb-plain">{seg.text}</span>}
          </span>
        ))}
      </h1>
      <RenderedHtml html={data.html} tenant={tenant} className="prose" />
    </article>
  );
}
