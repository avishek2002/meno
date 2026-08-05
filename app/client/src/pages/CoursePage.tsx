// #/t/:tenant/c/:course - objectives, the hub note, modules + lessons, and a
// per-concept mastery summary when the course has any recorded progress.
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { RenderedHtml } from '../components/RenderedHtml';
import { Meter } from '../components/Meter';
import { asMastery } from '../clientTypes';
import type { CourseNode } from '../../../shared/types.ts';

interface CourseResponse extends CourseNode {
  hubHtml: string;
  mastery: unknown;
}

function stripMd(file: string): string {
  return file.replace(/\.md$/, '');
}

export function CoursePage({ tenant, course }: { tenant: string; course: string }) {
  const { data, error, loading, revalidate } = useResource<CourseResponse>(
    `/api/v1/${encodeURIComponent(tenant)}/course/${encodeURIComponent(course)}`,
  );
  useRegisterRevalidate(revalidate);

  if (loading && !data) return <p className="status-line">Loading course...</p>;
  if (error) return <p className="status-line status-error">Could not load course: {error}</p>;
  if (!data) return null;

  const mastery = asMastery(data.mastery);
  const courseMastery = mastery?.courses[course] ?? null;
  const concepts = courseMastery ? Object.entries(courseMastery.concepts) : [];

  return (
    <section>
      <header className="course-header">
        <h1>{data.title}</h1>
        <span className={`status-badge status-${data.status}`}>{data.status}</span>
      </header>

      {data.objectives.length > 0 && (
        <section className="objectives">
          <h2>Objectives</h2>
          <ul>
            {data.objectives.map((o) => (
              <li key={o.id}>
                <strong>{o.id}</strong> ({o.bloom}): {o.text}
                {o.assessed_by && <div className="objective-assessed">Assessed by: {o.assessed_by}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.hubHtml && (
        <section className="hub-note">
          <h2>Map</h2>
          <RenderedHtml html={data.hubHtml} tenant={tenant} className="prose" />
        </section>
      )}

      <section className="modules">
        <h2>Modules</h2>
        {data.modules.map((m) => (
          <div key={m.slug} className="module-card">
            <h3>
              {m.title} <span className={`status-badge status-${m.status}`}>{m.status}</span>
            </h3>
            <ul className="lesson-list">
              {m.lessons.map((l) => (
                <li key={l.file}>
                  {l.status !== 'planned' ? (
                    <a
                      href={`#/t/${encodeURIComponent(tenant)}/c/${encodeURIComponent(course)}/m/${encodeURIComponent(m.slug)}/l/${encodeURIComponent(stripMd(l.file))}`}
                    >
                      {l.title}
                    </a>
                  ) : (
                    <span className="lesson-planned">{l.title} (planned)</span>
                  )}
                  <span className="lesson-status"> - {l.status}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {concepts.length > 0 && (
        <section className="mastery-summary">
          <h2>Concept mastery</h2>
          <table className="mastery-table">
            <thead>
              <tr>
                <th>Concept</th>
                <th>Level</th>
                <th>Transfer score</th>
                <th>Recognition rate</th>
                <th>Next review</th>
              </tr>
            </thead>
            <tbody>
              {concepts.map(([concept, c]) => (
                <tr key={concept}>
                  <td>{concept}</td>
                  <td>
                    <span className={`level-badge level-${c.level}`}>{c.level}</span>
                  </td>
                  <td>
                    <Meter value={c.transfer_score} label="transfer score" />
                  </td>
                  <td>
                    <Meter value={c.recognition_rate} label="recognition rate" />
                  </td>
                  <td>{c.next_review ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </section>
  );
}
