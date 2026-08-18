// #/t/:tenant/n/:path - any vault note reached via a wikilink that isn't a
// lesson file (home, hub, profile, etc). UI-15: the note's own heading is the
// page's only <h1> (already inside data.html); the path renders as muted
// metadata instead, and a note under a course directory gets a breadcrumb
// back to it.
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { AsyncStatus } from '../components/AsyncStatus';
import { ErrorState } from '../components/ErrorState';
import { RenderedHtml } from '../components/RenderedHtml';
import { Breadcrumb, type BreadcrumbSegment } from '../components/Breadcrumb';
import { courseDirOfPath, courseHref } from '../courseContext.ts';
import type { NoteResponse, TreeResponse } from '../../../shared/types.ts';

// The sanitized note HTML (app/server/markdown.ts) puts the note's own
// heading first as a plain <h1>...</h1> - pull its text out (stripped of any
// nested markup, a wikilink inside a heading being the one realistic case)
// instead of duplicating it as a second, path-derived heading.
function extractTitle(html: string): string | null {
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!match) return null;
  const text = match[1].replace(/<[^>]+>/g, '').trim();
  return text || null;
}

export function NotePage({ tenant, path }: { tenant: string; path: string }) {
  const { data, error, loading, revalidate } = useResource<NoteResponse>(
    `/api/v1/${encodeURIComponent(tenant)}/note?path=${encodeURIComponent(path)}`,
  );

  // UI-15's fiddly half: this page only has a path, and courseHref needs a
  // slug - which can differ from CourseNode.dir for a hand-made course, so
  // the slug in the note's own path segments can't be trusted. Fetch /tree
  // (cached, UI-05) and match this note's directory against every course's
  // dir to find the course it actually belongs to, if any.
  const dir = courseDirOfPath(path);
  const tree = useResource<TreeResponse>(dir ? `/api/v1/${encodeURIComponent(tenant)}/tree` : null);
  const course = dir ? (tree.data?.courses.find((c) => c.dir === dir) ?? null) : null;

  useRegisterRevalidate(() => {
    revalidate();
    tree.revalidate();
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

  const title = extractTitle(data.html) ?? data.path;
  const breadcrumbSegments: BreadcrumbSegment[] | null = course
    ? [
        { label: 'Courses', href: `#/t/${encodeURIComponent(tenant)}` },
        { label: course.title, href: courseHref(tenant, course.slug) },
        { label: title },
      ]
    : null;

  return (
    <article className="note-page">
      {breadcrumbSegments && <Breadcrumb segments={breadcrumbSegments} />}
      <p className="note-path">{data.path}</p>
      <RenderedHtml html={data.html} tenant={tenant} className="prose" />
    </article>
  );
}
