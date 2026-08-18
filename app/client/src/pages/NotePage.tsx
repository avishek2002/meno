// #/t/:tenant/n/:path - any vault note reached via a wikilink that isn't a
// lesson file (home, hub, profile, etc). UI-15: the note's own heading is the
// page's only <h1> (already inside data.html); the vault path renders
// instead as a breadcrumb, because the path is still what disambiguates a
// note from every other note that could share a heading text - dropping it
// entirely would lose that as the page's identity, not just its decoration.
// Only the segments the server confirms resolve to a real route
// (noteBreadcrumb, notePath.ts) become links; the rest render as plain text,
// and Breadcrumb's default anchor underline (not color alone) is what tells
// the reader which segments are clickable before they click.
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { AsyncStatus } from '../components/AsyncStatus';
import { ErrorState } from '../components/ErrorState';
import { RenderedHtml } from '../components/RenderedHtml';
import { Breadcrumb, type BreadcrumbSegment } from '../components/Breadcrumb';
import { noteBreadcrumb } from '../notePath.ts';
import type { NoteResponse } from '../../../shared/types.ts';

export function NotePage({ tenant, path }: { tenant: string; path: string }) {
  const { data, error, loading, revalidate } = useResource<NoteResponse>(
    `/api/v1/${encodeURIComponent(tenant)}/note?path=${encodeURIComponent(path)}`,
  );

  useRegisterRevalidate(() => {
    revalidate();
  });

  if (loading && !data) return <AsyncStatus message="Loading note..." />;
  if (error) {
    return (
      <ErrorState
        title="Could not load note"
        message="This note could not be loaded."
        detail={error}
        links={[{ label: 'Courses', href: `#/t/${encodeURIComponent(tenant)}` }]}
      />
    );
  }
  if (!data) return null;

  // course/domain come straight off the server's own walk (resolveNoteCourse
  // in app/server/tree.ts), not a client-side guess from the path string, so
  // the breadcrumb can never link to a course the tree does not contain.
  const segments = noteBreadcrumb({ tenant, path: data.path, course: data.course, domain: data.domain });
  const breadcrumbSegments: BreadcrumbSegment[] = segments.map((seg) => ({
    label: seg.text,
    href: seg.href ?? undefined,
  }));

  return (
    <article className="note-page">
      <Breadcrumb segments={breadcrumbSegments} />
      {/* RenderedHtml.html already carries the note's own `# heading` as a
          plain <h1> (app/server/markdown.ts) - this is the page's only <h1>,
          per UI-15; nothing here re-renders extractTitle as a second one. */}
      <RenderedHtml html={data.html} tenant={tenant} className="prose" />
    </article>
  );
}
