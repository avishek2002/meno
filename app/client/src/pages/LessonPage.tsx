// #/t/:tenant/c/:course/m/:module/l/:file - lesson body, interactive checks,
// mermaid diagrams, references, and the once-after-20s read-progress ping.
import { useEffect } from 'react';
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { RenderedHtml } from '../components/RenderedHtml';
import { ReferencesPanel } from '../components/ReferencesPanel';
import { postJson } from '../api';
import { parseSources } from '../clientTypes';
import type { LessonResponse } from '../../../shared/types.ts';

interface LessonPageProps {
  tenant: string;
  course: string;
  module: string;
  file: string;
}

export function LessonPage({ tenant, course, module, file }: LessonPageProps) {
  const url = `/api/v1/${encodeURIComponent(tenant)}/lesson/${encodeURIComponent(course)}/${encodeURIComponent(module)}/${encodeURIComponent(file)}`;
  const { data, error, loading, revalidate } = useResource<LessonResponse>(url);
  useRegisterRevalidate(revalidate);

  useEffect(() => {
    const timer = setTimeout(() => {
      void postJson(`/api/v1/${encodeURIComponent(tenant)}/lesson/read`, {
        course,
        module,
        lesson: file,
        seconds: 20,
      }).catch(() => {
        // best-effort: reading progress is not on the critical path for the reader
      });
    }, 20000);
    return () => clearTimeout(timer);
  }, [tenant, course, module, file]);

  if (loading && !data) return <p className="status-line">Loading lesson...</p>;
  if (error) return <p className="status-line status-error">Could not load lesson: {error}</p>;
  if (!data) return null;

  const sources = parseSources(data.frontmatter);
  const title = typeof data.frontmatter.title === 'string' ? data.frontmatter.title : file;

  return (
    <article className="lesson">
      <h1>{title}</h1>
      {data.warnings.length > 0 && (
        <div className="warnings-box">
          {data.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
      <RenderedHtml
        html={data.html}
        tenant={tenant}
        className="prose"
        checks={data.checks}
        course={course}
        module={module}
        lesson={file}
      />
      <ReferencesPanel sources={sources} />
    </article>
  );
}
