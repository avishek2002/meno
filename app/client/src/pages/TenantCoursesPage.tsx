// #/t/:tenant - course list.
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { EmptyState } from '../components/EmptyState';
import type { TreeResponse } from '../../../shared/types.ts';

export function TenantCoursesPage({ tenant }: { tenant: string }) {
  const { data, error, loading, revalidate } = useResource<TreeResponse>(`/api/v1/${encodeURIComponent(tenant)}/tree`);
  useRegisterRevalidate(revalidate);

  if (loading && !data) return <p className="status-line">Loading courses...</p>;
  if (error) return <p className="status-line status-error">Could not load courses: {error}</p>;
  const courses = data?.courses ?? [];

  if (courses.length === 0) {
    return <EmptyState title={`No courses yet for ${tenant}`} />;
  }

  return (
    <section>
      <h1>Courses</h1>
      {data && data.warnings.length > 0 && (
        <div className="warnings-box">
          {data.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
      <ul className="course-list">
        {courses.map((c) => (
          <li key={c.slug} className="course-card">
            <a href={`#/t/${encodeURIComponent(tenant)}/c/${encodeURIComponent(c.slug)}`}>
              <h2>{c.title}</h2>
            </a>
            <p className="course-card-meta">
              <span className={`status-badge status-${c.status}`}>{c.status}</span>
              {' · '}
              {c.modules.length} {c.modules.length === 1 ? 'module' : 'modules'}
            </p>
            <div className="module-status-row">
              {c.modules.map((m) => (
                <span key={m.slug} className={`status-dot status-${m.status}`} title={`${m.title}: ${m.status}`} />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
