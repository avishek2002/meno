// #/t/:tenant/n/:path - any vault note reached via a wikilink that isn't a
// lesson file (home, hub, profile, etc).
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { RenderedHtml } from '../components/RenderedHtml';
import type { NoteResponse } from '../../../shared/types.ts';

export function NotePage({ tenant, path }: { tenant: string; path: string }) {
  const { data, error, loading, revalidate } = useResource<NoteResponse>(
    `/api/v1/${encodeURIComponent(tenant)}/note?path=${encodeURIComponent(path)}`,
  );
  useRegisterRevalidate(revalidate);

  if (loading && !data) return <p className="status-line">Loading note...</p>;
  if (error) return <p className="status-line status-error">Could not load note: {error}</p>;
  if (!data) return null;

  return (
    <article className="note-page">
      <h1>{data.path}</h1>
      <RenderedHtml html={data.html} tenant={tenant} className="prose" />
    </article>
  );
}
